#!/usr/bin/env python3
"""Build one product's listing images the way the batch runner does — callable from the deployed worker.

    python3 scripts/produce_images.py <product_id>

The producer agent on Railway used to generate three mockups with an image model, at roughly $0.54 a
product, on a path that knows none of the rules the batch pipeline enforces: it renders type with AI,
ignores the declared thread palette, cannot tell an embroidered chest badge from a full-front print,
and never checks the design against the garment it is shown on. Approving a product from the website
therefore produced something we would not ship, while the same product built locally passed eight
gates for $0.03. Two production paths that disagree is the defect; this is the one path.

Blanks live in the mockup_blanks table rather than on disk, which is how this codebase already stores
images — the service keeps no persistent volume, so a file next to the script would not survive a
deploy.
"""
import io
import json
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mockup_composite import composite_pil, fit_quad, decontaminate   # noqa: E402

MODELS = ["model-IvoryTrendy4", "model-Pepper"]
FLATS = ["flat-Bay", "flat-Navy", "flat-LayYam", "flat-Black"]
CHART = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
         "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
         "flat-Black"]
FONT_T = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT_L = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Railway's image has neither macOS font; fall back rather than fail the whole build."""
    # Alpine puts DejaVu in /usr/share/fonts/dejavu, Debian in /usr/share/fonts/truetype/dejavu. Only
    # the Debian paths were listed, so on the deployed Alpine image every lookup failed and PIL fell back
    # to its bitmap default — the colourway badge came out unreadably small on a listing image that
    # otherwise looked finished. Installing the font package is not enough if the path is wrong.
    for p in (path,
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


# The two placements a buyer can choose between, each at the size that placement is actually sold at —
# a left chest badge is small, a centre chest one is not. The label carries the size so the gallery
# says which is which.
EMB_SPOTS = {"left":   {"x": 0.78, "y": 0.06, "inches": 4.0, "label": 'Left chest 4"'},
             "center": {"x": 0.50, "y": 0.10, "inches": 6.0, "label": 'Centre chest 6"'}}


def badge_quad(quad, spot: dict, inches: float | None = None) -> list:
    """A 4-inch badge placed at a named spot inside the garment's print area."""
    (x0, y0), (x1, _), _, (_, y3) = [tuple(pt) for pt in quad]
    w, h = x1 - x0, y3 - y0
    side = int(w * (inches or spot.get("inches", 4.0)) / 10.0)   # the print box spans ten inches
    cx = int(x0 + w * spot["x"])
    top = int(y0 + h * spot["y"])
    return [[cx - side // 2, top], [cx + side // 2, top],
            [cx + side // 2, top + side], [cx - side // 2, top + side]]


PRINT_INCHES = 10.0            # the cap the shop sells; smaller is allowed, larger cannot be printed

# DTF placements. Until now every screen print was blown up to the full ten inches and centred, which is
# why an icon a concept described as "compact scale sized for a left-chest print" still went out as a
# giant chest graphic: the brief said one thing and the compositor did another. Placement is the design's
# decision now, carried in design_params, and the size is free — ten inches is a ceiling, not a target, so
# a 9 inch tall strip or a 4 inch pocket icon is printed at the size it was designed for.
PRINT_SPOTS = {
    "center_chest": {"x": None, "y": None, "inches": 10.0, "label": "Centre chest"},
    "left_chest":   {"x": 0.78, "y": 0.06, "inches": 4.0,  "label": "Left chest"},
}
DEFAULT_SPOT = "center_chest"
# The widest a left-chest patch gets before it stops being one.
LEFT_CHEST_MAX_IN = 5.0

# Some styles ARE a placement. The minimal preset asks for "one small simple motif ... reads clearly at
# three inches" — a pocket print — and every one of them was still blown up to ten inches and centred,
# which is precisely why they read as giant clipart on the mockup. A style whose brief says small gets a
# small placement unless the product says otherwise.
STYLE_SPOT = {"minimal": ("left_chest", 4.0)}


def print_placement(params: dict | None) -> dict:
    """Resolve a product's stored placement into inches and position fractions.

    design_params may carry `placement` (a PRINT_SPOTS key) and `print_inches` (the LONGER side, in
    inches). Either may be missing, in which case the style's own scale decides, and failing that the
    full-front print the shop has always sold.
    """
    p = params if isinstance(params, dict) else {}
    style_spot, style_in = STYLE_SPOT.get(str(p.get("style") or ""), (DEFAULT_SPOT, None))
    spot_key = str(p.get("placement") or style_spot)
    if spot_key not in PRINT_SPOTS:
        spot_key = DEFAULT_SPOT
    spot = PRINT_SPOTS[spot_key]
    if p.get("print_inches") is None and p.get("placement") is None and style_in:
        p = {**p, "print_inches": style_in}
    inches = p.get("print_inches")
    try:
        inches = float(inches) if inches is not None else float(spot["inches"])
    except (TypeError, ValueError):
        inches = float(spot["inches"])
    # The physical print area caps it; anything larger cannot be produced whatever the row says. The label
    # reports the capped value, not the request — a badge reading 99" on a 10" print is a lie in the gallery.
    inches = min(inches, PRINT_INCHES)
    # A left-chest print is a small patch by definition. `placement=left_chest` with `print_inches=10` was
    # accepted in silence and composited 10 inches wide at x=0.78 — off the shoulder and off the garment.
    # The pair is incoherent, so the placement wins and the size is corrected out loud rather than shipped.
    if spot_key == "left_chest" and inches > LEFT_CHEST_MAX_IN:
        print(f"UYARI: left_chest {inches:g}\" istendi, {LEFT_CHEST_MAX_IN:g}\" ile sinirlandi — "
              f"sol gogus kucuk bir yamadir; buyuk baski istiyorsan placement=center_chest yap",
              file=sys.stderr)
        inches = LEFT_CHEST_MAX_IN
    return {"x": spot["x"], "y": spot["y"], "inches": inches, "spot": spot_key,
            "label": f"{spot['label']} {inches:g}\""}


def placement_quad(design: Image.Image, tpl: dict, embroidery: bool, spot: str = "left",
                   place: dict | None = None) -> list:
    """Where the artwork lands on this blank, in blank pixels.

    Split out of composite() so the detail crop can ask the same question instead of recomputing the
    placement — a second copy of this arithmetic is what once published the whole catalogue at the
    wrong size and offset.
    """
    box, ppi = tpl.get("print_box"), tpl.get("px_per_inch")
    if box and ppi:
        cfg = EMB_SPOTS[spot] if embroidery else (place or print_placement(None))
        return fit_quad(design, box, float(ppi),
                        inches=float(cfg["inches"]),
                        angle=float(tpl.get("angle") or 0.0),
                        x_frac=cfg["x"], y_frac=cfg["y"])
    # Uncalibrated blank: fall back to the stored quad rather than skip the image, but say so —
    # silence here is what let a whole catalogue publish at the wrong size.
    print(f"UYARI {tpl.get('colorway')}: print_box/px_per_inch yok, eski quad kullanildi "
          f"(scripts/sync_blank_calibration.py --apply)", file=sys.stderr)
    return badge_quad(tpl["quad"], EMB_SPOTS[spot]) if embroidery else tpl["quad"]


def detail_shot(shot: Image.Image, quad: list, side: int = 2000, pad: float = 0.22) -> Image.Image:
    """A square close crop around the stitching, for the gallery.

    Winning listings fill the frame; a 4-inch badge on a full-body model shot is about a tenth of the
    width, so at gallery-thumbnail size the buyer cannot read what is stitched — which is fatal when
    the promise IS the lettering. The crop is clamped to the canvas so a badge near an edge stays
    inside the picture instead of shifting the subject off-centre.
    """
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys)) * (0.5 + pad)
    half = min(half, shot.width / 2, shot.height / 2)
    cx = min(max(cx, half), shot.width - half)
    cy = min(max(cy, half), shot.height - half)
    crop = shot.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    return crop.resize((side, side), Image.LANCZOS)


def composite(design: Image.Image, blank: Image.Image, tpl: dict, embroidery: bool,
              spot: str = "left", place: dict | None = None) -> Image.Image:
    """Place the artwork using the SHARED compositor and the MEASURED print rectangle.

    This function used to carry its own copy of the warp-and-light maths and to hand the artwork's
    corners straight to a square quad out of mockup_blanks. Both were wrong in ways only visible on a
    finished listing: the duplicated lighting kept a formula that blacked pixels out on cleanly lit
    cloth, and the square quad stretched every non-square design inside an area a third too small and
    offset from where the print actually lands. The calibrated numbers were in templates.json all along;
    they now live in the table this path reads.
    """
    quad = placement_quad(design, tpl, embroidery, spot, place)
    return composite_pil(design, blank, {**tpl, "quad": quad})


def badge(img: Image.Image, colorway: str) -> Image.Image:
    w, h = img.size
    pad = int(w * 0.03)
    d = ImageDraw.Draw(img, "RGBA")
    f1, f2 = font(FONT_L, int(w * 0.028)), font(FONT_L, int(w * 0.046))
    top, bot = "COMFORT COLORS", colorway.upper()
    bw = max(d.textbbox((0, 0), top, font=f1)[2], d.textbbox((0, 0), bot, font=f2)[2]) + pad * 2
    bh = int(w * 0.115)
    x, y = pad, h - bh - pad
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=int(bh * 0.28), fill=(20, 20, 20, 205))
    d.text((x + (bw - d.textbbox((0, 0), top, font=f1)[2]) / 2, y + bh * 0.16), top, font=f1,
           fill=(235, 232, 226, 255))
    d.text((x + (bw - d.textbbox((0, 0), bot, font=f2)[2]) / 2, y + bh * 0.44), bot, font=f2,
           fill=(255, 255, 255, 255))
    return img


def build_chart(design: Image.Image, blanks: dict, embroidery: bool, cell: int = 460) -> Image.Image:
    cols, label_h = 4, int(cell * 0.15)
    tiles = []
    for name in CHART:
        b = blanks.get(name)
        if not b:
            continue
        im = composite(design, b["image"], b, embroidery)
        im.thumbnail((cell, cell), Image.LANCZOS)
        tiles.append((b["colorway"], im))
    rows = (len(tiles) + cols - 1) // cols
    title_h = int(cell * 0.40)
    canvas = Image.new("RGB", (cols * cell, title_h + rows * (cell + label_h)), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    ft, fl = font(FONT_T, int(cell * 0.14)), font(FONT_L, int(cell * 0.082))
    for i, line in enumerate(["COMFORT COLORS", "COLOR CHART"]):
        w = d.textbbox((0, 0), line, font=ft)[2]
        d.text(((canvas.width - w) // 2, int(cell * 0.05) + i * int(cell * 0.16)), line, font=ft,
               fill=(20, 20, 20))
    for i, (name, im) in enumerate(tiles):
        x = (i % cols) * cell + (cell - im.width) // 2
        y = title_h + (i // cols) * (cell + label_h)
        canvas.paste(im, (x, y))
        tw = d.textbbox((0, 0), name, font=fl)[2]
        d.text(((i % cols) * cell + (cell - tw) // 2, y + im.height + int(label_h * 0.10)), name,
               font=fl, fill=(30, 30, 30))
    return canvas


def jpeg(im: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def main() -> None:
    # --out writes the JPEGs to a folder and touches NOTHING else: no product_images, no hero
    # colourway, no Etsy. Every image change until now went straight to the database and from there to
    # a live listing, so the only way to see a mockup was to publish it. A render that can be looked at
    # before it ships is the difference between approving a change and discovering it on the shop page.
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_dir = None
    for i, a in enumerate(sys.argv):
        if a == "--out" and i + 1 < len(sys.argv):
            out_dir = Path(sys.argv[i + 1]).expanduser()
            argv = [x for x in argv if x != sys.argv[i + 1]]
    if not argv:
        sys.exit("kullanim: produce_images.py <product_id> [--out KLASOR] [--only-cover]")
    pid = int(argv[0])
    # One frame instead of nine: the approval gate needs something to LOOK at before the full set is worth
    # building. A design nobody has approved should not cost nine composites and a schedule slot.
    only_cover = "--only-cover" in sys.argv
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT slug, technique, print_file, emb_render FROM products WHERE id=%s", (pid,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"urun {pid} yok")
    slug, technique, print_file, emb_render = row
    if not print_file:
        sys.exit(f"{slug}: print_file yok — once tasarim uretilmeli")
    emb = technique == "embroidery"
    # The listing shows thread; print_file stays flat because the digitiser reads it as colour.
    # Compositing the production file is what made embroidery mockups look like DTF.
    src = emb_render if (emb and emb_render) else print_file
    if emb and not emb_render:
        print(f"UYARI {slug}: emb_render yok, duz dosya kullanildi "
              f"(scripts/make_emb_render.py {slug})", file=sys.stderr)
    design = Image.open(io.BytesIO(bytes(src))).convert("RGBA")
    design = design.crop(design.getbbox() or (0, 0, design.width, design.height))
    # Once, here: every composite below reuses this decoded design, and the distance transform
    # is far too expensive to repeat nine times per product.
    design = decontaminate(design)

    cur.execute("""SELECT name, colorway, quad, opacity, shade, print_box, px_per_inch, angle, bytes
                     FROM mockup_blanks""")
    blanks = {}
    for name, colorway, quad, opacity, shade, box, ppi, angle, blob in cur.fetchall():
        blanks[name] = {"colorway": colorway,
                        "quad": quad if isinstance(quad, list) else json.loads(quad),
                        "opacity": opacity, "shade": shade,
                        "print_box": box if isinstance(box, list) else (json.loads(box) if box else None),
                        "px_per_inch": ppi, "angle": angle,
                        "image": Image.open(io.BytesIO(bytes(blob))).convert("RGB")}
    if not blanks:
        sys.exit("mockup_blanks bos — blank'ler yuklenmeli")

    # Which model shot leads. This used to be hardcoded to Ivory, which was safe while every design was a
    # dark flat-vector emblem. The styles that actually sell are cream-forward engravings, and cream on an
    # ivory tee is invisible — so the cover follows MEASURED contrast between the artwork's own ink and the
    # garment, the same rule the batch pipeline uses. Moving the garment is free; regenerating is not.
    def _contrast(blank_name: str) -> float:
        import numpy as np
        b = blanks[blank_name]
        g = np.asarray(b["image"].convert("L")).astype(float).mean()
        a = np.asarray(design.convert("RGBA"))
        m = a[:, :, 3] > 128
        if not m.any():
            return 0.0
        ink = (0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2])[m].mean()
        return abs(ink - g)

    # Honour the garment produce_product already chose — the type on the artwork was set to contrast with
    # it. Recomputing here with a different measure is what put cream type on an ivory tee.
    cur.execute("SELECT hero_colorway, design_params FROM products WHERE id=%s", (pid,))
    row = cur.fetchone() or [None, None]
    want = row[0]
    # Placement and size are the design's decision, made when the concept was written; read them here
    # instead of assuming a ten inch centred print for everything.
    params = row[1]
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except ValueError:
            params = {}
    place = print_placement(params)
    if place["inches"] != PRINT_INCHES or place["x"] is not None:
        print(f"yerlesim: {place['label']}", file=sys.stderr)
    chosen = next((n for n in MODELS if blanks.get(n, {}).get("colorway") == want), None)
    if chosen:
        models = [chosen] + [n for n in MODELS if n != chosen]
    else:
        models = sorted(MODELS, key=_contrast, reverse=True) if not emb else MODELS
    if models[0] != MODELS[0]:
        print(f"kapak {blanks[models[0]]['colorway']} secildi: tasarim {blanks[MODELS[0]]['colorway']} "
              f"uzerinde okunmuyordu (kontrast {_contrast(models[0]):.0f} vs {_contrast(MODELS[0]):.0f})",
              file=sys.stderr)

    images: list[tuple[str, str, str, bytes]] = []
    # The close crop goes second, right behind the lead model shot: the gallery's job after the click is
    # to prove what is printed or stitched, and on a full-body shot the artwork is too small to read.
    detail: tuple[str, str, str, bytes] | None = None
    if emb:
        # The listing has to show both placements or the buyer cannot see what the choice means.
        b = blanks[models[0]]
        for spot in ("left", "center"):
            shot = composite(design, b["image"], b, emb, spot)
            im = badge(shot, f"{b['colorway']} · {EMB_SPOTS[spot]['label']}")
            images.append((f"{slug}-{spot}-model.jpg", "model", b["colorway"], jpeg(im, 93)))
            if detail is None:
                detail = (f"{slug}-detail.jpg", "detail", b["colorway"],
                          jpeg(detail_shot(shot, placement_quad(design, b, emb, spot)), 93))
    # A second worn shot is only worth a gallery slot if the design can be seen in it. Pepper's mean
    # luminance is 127 and these designs' ink runs 89-165, so its contrast measured 2-38 on 38 of 40
    # products sampled — an image of a shirt with something indistinct on it. The lead shot always
    # stays; the rest have to earn their place, and the flats below carry the colour variety.
    MIN_MODEL_CONTRAST = 35.0
    # Embroidery already spent models[0] on the two placement shots above; DTF still needs its lead.
    lead = [] if emb else [models[0]]
    rest = [] if only_cover else [n for n in models[1:] if _contrast(n) >= MIN_MODEL_CONTRAST]
    skipped = [blanks[n]["colorway"] for n in models[1:] if n not in rest]
    if skipped:
        print(f"model karesi atlandi (tasarim okunmuyor): {skipped}", file=sys.stderr)
    for name in lead + rest:
        b = blanks[name]
        shot = composite(design, b["image"], b, emb, place=place)
        im = badge(shot, b["colorway"])
        images.append((f"{slug}-{b['colorway'].lower().replace(' ', '-')}-model.jpg",
                       "model", b["colorway"], jpeg(im, 93)))
        if detail is None:
            detail = (f"{slug}-detail.jpg", "detail", b["colorway"],
                      jpeg(detail_shot(shot, placement_quad(design, b, emb, place=place)), 93))
    if detail is not None:
        images.insert(1, detail)
    # The flats used to be four fixed dark shades. That was safe for pale artwork and wrong for
    # everything else: a dark engraving with a dark typeset caption on Bay, Navy, Yam and Black gave
    # four listing images where the words could not be read at all — checked on a Pepper frame where
    # "THE MILLER HAUNT — EST. 2026" was invisible. The cover already follows measured contrast; the
    # flats now follow the same rule, so a buyer only ever sees colourways this print actually reads on.
    # Approval preview: the lead shot and the close crop, nothing else. Those two are what the design is
    # judged on; the flats and the colour chart are another eight composites and about ninety seconds, and
    # they are what approval buys.
    flats = [] if only_cover else sorted((n for n in CHART if n in blanks), key=_contrast, reverse=True)[:len(FLATS)]
    if not flats and not only_cover:
        flats = [n for n in FLATS if n in blanks]
    dropped = [blanks[n]["colorway"] for n in FLATS if n in blanks and n not in flats]
    if dropped and not only_cover:
        print(f"düz kareler kontrasta göre secildi: {[blanks[n]['colorway'] for n in flats]} "
              f"(atlanan: {dropped})", file=sys.stderr)
    for name in flats:
        b = blanks[name]
        images.append((f"{slug}-{b['colorway'].lower().replace(' ', '-')}-flat.jpg",
                       "flat", b["colorway"], jpeg(composite(design, b["image"], b, emb, place=place))))
    if not only_cover:
        images.append((f"{slug}-color-chart.jpg", "colorway-chart", "All colors",
                       jpeg(build_chart(design, blanks, emb), 91)))

    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        for rank, (fn, role, label, blob) in enumerate(images, start=1):
            (out_dir / f"{rank:02d}-{fn}").write_bytes(blob)
        print(json.dumps({"ok": True, "slug": slug, "images": len(images),
                          "technique": technique, "out": str(out_dir), "db": "dokunulmadi"}))
        return

    cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
    for rank, (fn, role, label, blob) in enumerate(images, start=1):
        cur.execute("""INSERT INTO product_images
                         (product_id, rank, role, label, filename, mime, bytes)
                       VALUES (%s,%s,%s,%s,%s,'image/jpeg',%s)""",
                    (pid, rank, "cover" if rank == 1 else role, label, fn, psycopg2.Binary(blob)))
    cur.execute("UPDATE products SET hero_colorway=%s, updated_at=now() WHERE id=%s",
                (blanks[models[0]]["colorway"], pid))   # confirm what was actually featured
    conn.commit()
    print(json.dumps({"ok": True, "slug": slug, "images": len(images),
                      "technique": technique, "cover": images[0][0]}))


if __name__ == "__main__":
    main()
