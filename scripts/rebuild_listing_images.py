#!/usr/bin/env python3
"""Rebuild every listing's image set from our own photographs. Printful renders are dropped entirely.

Printful's mockup generator is free and its placement is honest, which is why it was used to prove
the artwork sits where we stitch it. But it is a 3D render on a headless studio ghost, and it is the
same render every Printful shop publishes — on a marketplace where the first image decides whether
anyone clicks, that is the wrong picture. The licensed blanks are photographs of a person in a room,
and they are ours to use.

The set, in order:

  1  Ivory on model     the cover
  2  Pepper on model    the same design on a dark garment, so the range is visible immediately
  3+ four flat lays     colours chosen to span the palette, not to repeat the two above
  n  colour chart       all thirteen flats in a labelled grid
  n+ info cards         personalisation, technique, fit and care

Embroidery keeps its own quad: those products are fulfilled as a 4-inch left-chest badge, and a
full-width composite of the same artwork would advertise a garment we do not make.
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mockup_composite import load_config, composite_pil, BLANKS      # noqa: E402
from apply_blank_covers import badge, luma                          # noqa: E402


PIPELINE = Path("/Users/omer/Documents/code/etsy/pipeline")
MODELS = [("model-IvoryTrendy4", "Ivory"), ("model-Pepper", "Pepper")]
FLATS = [("flat-Bay", "Bay"), ("flat-Navy", "Navy"), ("flat-LayYam", "Yam"), ("flat-Black", "Black")]
CHART = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
         "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
         "flat-Black"]
CHART_NAMES = {"flat-White": "White", "flat-Ivory": "Ivory", "flat-Blossom": "Blossom",
               "flat-Bay": "Bay", "flat-Grey": "Grey", "flat-Moss": "Moss", "flat-LayYam": "Yam",
               "flat-Crims": "Crimson", "flat-Red": "Red", "flat-Demin": "Denim",
               "flat-Navy": "Navy", "flat-Pepper": "Pepper", "flat-Black": "Black"}
FONT_T = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT_L = "/System/Library/Fonts/Supplemental/Arial.ttf"
CARD_ORDER = ["how-to-personalize.jpg", "stitched-not-printed.jpg", "printed-to-last.jpg",
              "fit-and-care.jpg"]

MAX_PRINT_IN = 10.0

# Distance from the neckline, in inches. A print's top edge sits a fixed distance below the collar
# seam on a real garment; anchoring to each template's own quad instead put it at a different
# distance in every photograph, which reads as three different products.
DROP_BELOW_COLLAR_IN = 2.6
EMB_DROP_IN = 2.2

# Embroidery is not only a left-chest badge. Centre chest carries a wider crest, and a bigger badge
# is legitimate there because it sits on the flat of the chest rather than over the pectoral curve.
# Size still stays small — stitch count is what the supplier bills and what stiffens the garment.
# Both placements at the same 4 inches, because size is a production decision and position is the
# buyer's. Centre chest was 6 inches while it was the only alternative to a small left badge; now
# that both are offered the difference has to be position alone, or the two options are not
# comparable and the listing is choosing for them.
EMB_PLACEMENTS = {
    "embroidery_chest_left":   {"inches": 4.0, "x": 0.78, "y": 0.06, "label": "Left chest"},
    "embroidery_chest_center": {"inches": 4.0, "x": 0.50, "y": 0.08, "label": "Centre chest"},
}
EMB_DEFAULT = "embroidery_chest_left"


def place_badge(sized, full, spot):
    """Move an already-sized badge to a named spot inside the garment's print area."""
    (fx0, fy0), (fx1, _), _, (_, fy3) = [tuple(p) for p in full]
    w, h = fx1 - fx0, fy3 - fy0
    dx = int(fx0 + w * spot["x"]) - (sized[0][0] + sized[1][0]) // 2
    dy = int(fy0 + h * spot["y"]) - sized[0][1]
    return [[x + dx, y + dy] for x, y in sized]


# Decoding a 3600x3000 JPEG takes longer than the composite itself, and each product does nineteen
# of them — two models, four flats, thirteen chart tiles. Decoded once, they serve every product.
_BLANK_CACHE: dict = {}


def blank_image(file: str) -> Image.Image:
    if file not in _BLANK_CACHE:
        _BLANK_CACHE[file] = Image.open(BLANKS / file).convert("RGB")
    return _BLANK_CACHE[file]


_DESIGN_CACHE: dict = {}


def design_image(path: Path) -> Image.Image:
    """Cropped to its own content. The artwork sits on a square canvas with transparent margin, and
    warping the whole canvas into a 10-inch quad prints the MARGIN at 10 inches — the visible design
    came out around seven. `inches` has to mean the artwork, which is what a buyer measures."""
    key = str(path)
    if key not in _DESIGN_CACHE:
        _DESIGN_CACHE.clear()                    # one product at a time; do not grow unbounded
        im = Image.open(path).convert("RGBA")
        _DESIGN_CACHE[key] = im.crop(im.getbbox() or (0, 0, im.width, im.height))
    return _DESIGN_CACHE[key]


# Print sizes in inches on the longest side. Embroidery is a chest badge and nothing else: a needle
# has a minimum stitch length, so a large stitched panel is both slow to run and stiff to wear, and
# every extra square inch is stitch count somebody pays for.

# Embroidery is not only a left-chest badge. Centre chest carries a wider crest, and a bigger badge
# is legitimate there because it sits on the flat of the chest rather than over the pectoral curve.
# Size still stays small — stitch count is what the supplier bills and what stiffens the garment.


def rotate_quad(quad, deg: float) -> list:
    """Turn the quad about its own centre so the print lies along the garment, not the frame.

    Every folded flat in this set is shot at about -8 degrees and the worn shots vary from -14 to +5.
    A print laid square to the image sits visibly crooked on a shirt that is not — the single most
    obvious tell in the first test set.
    """
    import math
    pts = [(float(x), float(y)) for x, y in quad]
    cx = sum(p[0] for p in pts) / 4
    cy = sum(p[1] for p in pts) / 4
    r = math.radians(deg)
    cos, sin = math.cos(r), math.sin(r)
    return [[int(cx + (x - cx) * cos - (y - cy) * sin),
             int(cy + (x - cx) * sin + (y - cy) * cos)] for x, y in pts]


def fit_quad(quad, design: Image.Image, inches: float, px_per_inch: float,
             collar_y: float | None = None, drop_in: float = 0.0,
             center_x: float | None = None, box=None) -> list:
    """Size the quad to the design's own proportions, capped at `inches` on the longer side.

    A square quad stretches a wide emblem and pillarboxes a tall one. The artwork is cropped to its
    content first, so a triangle occupying the top half of its canvas is placed as a triangle rather
    than as the square it happens to be stored in.
    """
    bb = design.getbbox() or (0, 0, design.width, design.height)   # NOT `box`: that is the caller's
    aw, ah = bb[2] - bb[0], bb[3] - bb[1]                           # measured print rectangle
    long_px = inches * px_per_inch
    w = long_px if aw >= ah else long_px * aw / ah
    h = long_px if ah > aw else long_px * ah / aw
    (x0, y0), (x1, _), _, (_, y3) = [tuple(pt) for pt in quad]
    # print_box is measured, not inferred: it is the exact rectangle a real printed mockup of this
    # same photograph occupies, recovered by diffing that mockup against our blank. Every earlier
    # attempt derived the position from a detected garment or collar and was wrong by a visible
    # margin in at least one photograph. When the box is present nothing else gets a vote.
    if box is not None:
        cx = (box[0] + box[2]) / 2
        top = box[1]
    else:
        cx = (x0 + x1) / 2 if center_x is None else float(center_x)
        top = y0 if collar_y is None else collar_y + drop_in * px_per_inch
    return [[int(cx - w / 2), int(top)], [int(cx + w / 2), int(top)],
            [int(cx + w / 2), int(top + h)], [int(cx - w / 2), int(top + h)]]


def stitch_look(design: Image.Image, inches: float) -> Image.Image:
    """Make flat artwork read as thread rather than ink.

    Three things separate embroidery from a print. Satin stitches run in a direction and catch the
    light as fine parallel banding. The thread stands proud of the cloth, so each shape carries a
    shadow on one side and a highlight on the other. And a stitched edge is slightly ragged where a
    printed edge is exact.

    `inches` is how wide the artwork will be worn, which is what sets the stitch pitch — banding
    computed in canvas pixels rather than in real millimetres came out invisible at one size and
    like corduroy at another.
    """
    from scipy import ndimage

    a = np.asarray(design.convert("RGBA")).astype(float)
    h, w = a.shape[:2]
    alpha = a[:, :, 3]
    solid = alpha > 128
    if not solid.any():
        return design

    px_per_mm = w / max(inches, 0.1) / 25.4
    # A real satin pitch is ~0.55mm, which on a photograph of a whole shirt is two pixels — true,
    # and invisible. The banding is deliberately coarsened to about 1.6mm so it still reads at
    # listing size; the point of the mockup is to say "this is stitched", not to be a micrograph.
    period = max(3.0, 1.6 * px_per_mm)
    yy, xx = np.mgrid[0:h, 0:w]
    band = np.sin((xx + yy) * (2 * np.pi / period))[:, :, None]
    lit = a[:, :, :3] * (1.0 + band * 0.17)

    off = max(2, int(px_per_mm * 1.1))            # relief, also coarsened so it survives the resize
    inner = ndimage.binary_erosion(solid, np.ones((off * 2 + 1, off * 2 + 1)))
    rim = (solid & ~inner).astype(float)
    up = np.roll(np.roll(rim, -off, 0), -off, 1)[:, :, None]
    dn = np.roll(np.roll(rim, off, 0), off, 1)[:, :, None]
    lit = np.clip(lit * (1.0 + up * 0.26 - dn * 0.30), 0, 255)

    # Ragged only AT the edge. Applied across the whole alpha it printed a faint rectangle the size
    # of the canvas — the transparent margin picked up noise and stopped being transparent.
    edge = (ndimage.binary_dilation(solid, np.ones((off * 2 + 1,) * 2)) &
            ~ndimage.binary_erosion(solid, np.ones((off * 2 + 1,) * 2)))
    noise = np.asarray(Image.fromarray(
        (np.random.default_rng(7).random((max(h // 6, 1), max(w // 6, 1))) * 255).astype(np.uint8)
    ).resize((w, h), Image.BILINEAR)).astype(float)
    out_alpha = np.where(edge, np.clip(alpha + (noise - 128) * 0.55, 0, 255), alpha)

    im = Image.fromarray(np.dstack([lit, out_alpha]).astype(np.uint8), "RGBA")
    return im


def render(design: Path, tpl_name: str, cfg: dict, out: Path, embroidery: bool,
           scale: float = 1.0, placement: str | None = None,
           mockup_src: Path | None = None) -> Path:
    spec = dict(cfg[tpl_name])
    ppi = float(spec.get("px_per_inch") or 90.0)
    spot = EMB_PLACEMENTS.get(placement or EMB_DEFAULT, EMB_PLACEMENTS[EMB_DEFAULT])
    spec["quad"] = fit_quad(spec["quad"], design_image(design),
                            spot["inches"] if embroidery else MAX_PRINT_IN, ppi,
                            collar_y=spec.get("collar_y"),
                            drop_in=EMB_DROP_IN if embroidery else DROP_BELOW_COLLAR_IN,
                            center_x=spec.get("center_x"),
                            box=spec.get("print_box"))
    if embroidery:
        anchor = cfg[tpl_name].get("print_box") or cfg[tpl_name]["quad"]
        full = (anchor if isinstance(anchor[0], list)
                else [[anchor[0], anchor[1]], [anchor[2], anchor[1]],
                      [anchor[2], anchor[3]], [anchor[0], anchor[3]]])
        spec["quad"] = place_badge(spec["quad"], full, spot)
    spec["quad"] = rotate_quad(spec["quad"], float(spec.get("angle") or 0.0))
    blank = blank_image(spec["file"])
    if scale < 1.0:
        # Chart tiles are thumbnailed to 460px anyway; compositing them at full size is nine times
        # the pixel work for detail that is discarded on the next line.
        w, h = blank.size
        blank = blank.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        spec["quad"] = [[int(x * scale), int(y * scale)] for x, y in spec["quad"]]
    # For embroidery the listing shows emb_render — the design drawn as thread. print_file stays
    # flat because the digitiser reads it as colour, and compositing that flat file is exactly what
    # made every embroidery mockup look like DTF.
    art = design_image(mockup_src or design)
    composite_pil(art, blank, spec).save(out, quality=92)
    return out


def build_chart(design: Path, cfg: dict, out: Path, embroidery: bool, cell: int = 460,
                placement: str | None = None, mockup_src: Path | None = None) -> Path:
    """Thirteen flats, labelled. Same idea as the Printful chart, from our own photographs."""
    cols, pad_label = 4, int(cell * 0.15)
    tiles = []
    for name in CHART:
        if name not in cfg:
            continue
        tmp = out.parent / f".chart-{name}.jpg"
        render(design, name, cfg, tmp, embroidery, scale=0.34, placement=placement,
               mockup_src=mockup_src)
        im = Image.open(tmp).convert("RGB")
        im.thumbnail((cell, cell), Image.LANCZOS)
        tiles.append((CHART_NAMES.get(name, name), im))
        tmp.unlink(missing_ok=True)

    rows = (len(tiles) + cols - 1) // cols
    title_h = int(cell * 0.40)
    canvas = Image.new("RGB", (cols * cell, title_h + rows * (cell + pad_label)), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    ft = ImageFont.truetype(FONT_T, int(cell * 0.14))
    fl = ImageFont.truetype(FONT_L, int(cell * 0.082))
    for i, line in enumerate(["COMFORT COLORS", "COLOR CHART"]):
        w = d.textbbox((0, 0), line, font=ft)[2]
        d.text(((canvas.width - w) // 2, int(cell * 0.05) + i * int(cell * 0.16)), line,
               font=ft, fill=(20, 20, 20))
    for i, (name, im) in enumerate(tiles):
        x = (i % cols) * cell + (cell - im.width) // 2
        y = title_h + (i // cols) * (cell + pad_label)
        canvas.paste(im, (x, y))
        tw = d.textbbox((0, 0), name, font=fl)[2]
        d.text(((i % cols) * cell + (cell - tw) // 2, y + im.height + int(pad_label * 0.10)),
               name, font=fl, fill=(30, 30, 30))
    canvas.save(out, quality=91)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    cfg = load_config()
    root = PIPELINE / a.campaign / "designs"
    # Each product writes ~7 JPEGs of a megabyte or so; the managed Postgres drops a connection that
    # has been idle between those bursts, and two of these running in parallel killed it outright.
    # Reconnect rather than lose the run at product 40 of 97.
    def connect():
        # TCP keepalives are the whole story here. Without them a dropped connection is not noticed
        # until the OS gives up retransmitting, which took 88 minutes on one product — 12 seconds of
        # that was CPU. With them a dead socket surfaces in about a minute and the retry can act.
        return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15,
                                keepalives=1, keepalives_idle=20, keepalives_interval=8,
                                keepalives_count=3)

    dirs = [d for d in sorted(root.iterdir()) if d.is_dir() and (d / "final.png").exists()]
    if a.only:
        dirs = [d for d in dirs if d.name == a.only]
    if a.limit:
        dirs = dirs[:a.limit]

    # Read the whole list up front and hold no connection during the image work. Twelve seconds of
    # compositing with an open connection was enough for the managed Postgres to close it, and the
    # write then blocked on a dead socket — 88 minutes for one product, of which 12 seconds was CPU.
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT slug, id, technique, printful_placement FROM products WHERE slug = ANY(%s)",
                ([d.name for d in dirs],))
    meta = {slug: (pid, tech, place) for slug, pid, tech, place in cur.fetchall()}
    conn.close()

    done = 0
    for d in dirs:
        if d.name not in meta:
            print(f"  {d.name:14} urun satiri yok")
            continue
        pid, technique, placement = meta[d.name]
        emb = technique == "embroidery"
        design, shots = d / "final.png", d / "shots"
        shots.mkdir(exist_ok=True)
        mock_src = None
        if emb:
            c = connect(); k = c.cursor()
            k.execute("SELECT emb_render FROM products WHERE id=%s", (pid,))
            blob = (k.fetchone() or [None])[0]
            c.close()
            if blob:
                mock_src = shots / f"{d.name}-emb-render.png"
                mock_src.write_bytes(bytes(blob))
            else:
                print(f"    {d.name}: emb_render yok -> make_emb_render.py calistirilmali")
        files: list[Path] = []
        try:
            # An embroidery listing has to show both placements, or the buyer cannot see what the
            # choice means. Cover is the left badge; the second frame is the same badge centred.
            if emb:
                for tpl, colour in MODELS[:1]:
                    for place, tag in (("embroidery_chest_left", "left"),
                                       ("embroidery_chest_center", "center")):
                        p = render(design, tpl, cfg, shots / f"{d.name}-{tag}-model.jpg", emb,
                                   placement=place, mockup_src=mock_src)
                        lbl = EMB_PLACEMENTS[place]["label"]
                        badge(Image.open(p).convert("RGB"), f"{colour} · {lbl}").save(p, quality=93)
                        files.append(p)
            for tpl, colour in MODELS[1:] if emb else MODELS:
                p = render(design, tpl, cfg, shots / f"{d.name}-{colour.lower()}-model.jpg", emb,
                           placement=placement, mockup_src=mock_src)
                badge(Image.open(p).convert("RGB"), colour).save(p, quality=93)
                files.append(p)
            for tpl, colour in FLATS:
                files.append(render(design, tpl, cfg,
                                    shots / f"{d.name}-{colour.lower()}-flat.jpg", emb,
                                    placement=placement, mockup_src=mock_src))
            files.append(build_chart(design, cfg, shots / f"{d.name}-color-chart.jpg", emb,
                                     placement=placement, mockup_src=mock_src))
        except Exception as e:
            print(f"  {d.name:14} HATA {str(e)[:120]}")
            continue

        cards = d / "cards"
        if cards.is_dir():
            named = {p.name: p for p in cards.glob("*.jpg")}
            files += [named[n] for n in CARD_ORDER if n in named]

        print(f"  {d.name:14} {len(files):2} gorsel  ({'nakis' if emb else 'baski'})")
        if not a.apply:
            continue
        blobs = []
        for f in files:
            im = Image.open(f).convert("RGB")
            if max(im.size) > 2400:            # Etsy asks for 2000px; 3600 is bytes nobody sees
                im.thumbnail((2400, 2400), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=88)
            blobs.append((f.name, buf.getvalue()))
        for attempt in (1, 2, 3):
            c = None
            try:
                c = connect()                       # fresh, used immediately, closed straight after
                k = c.cursor()
                # hero_colorway follows the cover, which is now always the Ivory model
                k.execute("UPDATE products SET hero_colorway='Ivory' WHERE id=%s", (pid,))
                k.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
                for rank, (fn, blob) in enumerate(blobs, start=1):
                    k.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                                 VALUES (%s,%s,%s,'image/jpeg',%s)""",
                              (pid, rank, fn, psycopg2.Binary(blob)))
                c.commit()
                c.close()
                break
            except psycopg2.Error as e:
                print(f"    yeniden deneniyor ({str(e)[:60]})")
                if c is not None:
                    try:
                        c.close()
                    except Exception:
                        pass
                if attempt == 3:
                    raise
        done += 1

    print(f"\n{done} urunun gorsel seti yenilendi" + ("" if a.apply else "   (--apply verilmedi)"))


if __name__ == "__main__":
    main()
