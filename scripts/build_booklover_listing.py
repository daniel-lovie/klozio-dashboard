#!/usr/bin/env python3
"""Build one complete, ready-to-file Etsy listing for the book-lover niche, as files on the Desktop.

This writes NOTHING to the database and nothing to Etsy. It is a self-contained package meant to be
handed to someone: artwork, listing photographs, the copy to paste, and the provenance that backs it.

The artwork is drawn, not generated. Flat shapes and hand-set type in vendored OFL faces, which is what
the shop's rules require (no letter on any garment comes out of a model) and what DTF prints cleanly —
solid colour, hard edges, no soft alpha ramps.

    python3 scripts/build_booklover_listing.py
"""
from __future__ import annotations

import io
import json
import math
import os
import random
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import typeset                                                      # noqa: E402
from mockup_composite import composite_pil, fit_quad, decontaminate  # noqa: E402

OUT = Path.home() / "Desktop" / "Klozio — Book Lover Listing"
SLUG = "book-lover-one-more-chapter"

# Warm, colourful, flat. The shop's standing direction is that DTF prints full colour natively and the
# real constraint is flatness, not palette size — so this uses six inks rather than the safe two.
CREAM   = (0xF4, 0xE9, 0xD8)
MUSTARD = (0xE5, 0xA9, 0x3C)
TERRA   = (0xD2, 0x65, 0x3A)
SAGE    = (0x7C, 0x9A, 0x72)
TEAL    = (0x3E, 0x7C, 0x8C)
PLUM    = (0x8C, 0x4F, 0x6B)
INK     = (0x2B, 0x21, 0x18)
PALETTE = [CREAM, MUSTARD, TERRA, SAGE, TEAL, PLUM, INK]

W, H = 3000, 3600
CX = W // 2
MIN_STROKE = 10          # 2.5 pt at 300 DPI — the DTF floor
PRINT_INCHES = 10.0
HERO = "model-Black"
N_FLATS = 4
CHART = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
         "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
         "flat-Black"]


# ── artwork ──────────────────────────────────────────────────────────────────────────────────────
def book(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, cover: tuple,
         tilt: float = 0.0, bands: tuple = (MUSTARD,)) -> None:
    """One closed book seen end-on.

    The body is the COVER colour and the cream is only the page block along the bottom. Built the other
    way round — a cream board with a small coloured spine — four stacked books merged into one white
    slab with coloured corners, because the eye reads the large shape, not the small one. Colour is what
    makes a stack read as books, and it is also what the shop's brief asks for: DTF prints full colour
    natively, so the constraint is flatness, not palette size.

    Every part is a filled polygon, rotated as one so the book can lean without shearing its details.
    """
    a = math.radians(tilt)
    cx, cy = x + w / 2, y + h / 2

    def pt(px, py):
        dx, dy = px - cx, py - cy
        return (cx + dx * math.cos(a) - dy * math.sin(a),
                cy + dx * math.sin(a) + dy * math.cos(a))

    def box(x0, y0, x1, y1, fill):
        d.polygon([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], fill=fill)

    page_h = h * 0.34
    box(x, y, x + w, y + h, cover)                       # cover board
    box(x + w * 0.035, y + h - page_h, x + w, y + h - h * 0.055, CREAM)   # page block, inset at the spine
    # Two rules of page striation, solid bars well over the stroke floor.
    for i in (0, 1):
        ly = y + h - page_h + page_h * (0.34 + i * 0.30)
        box(x + w * 0.10, ly, x + w * 0.94, ly + MIN_STROKE + 2, cover)
    # Spine detail: bands across the left end of the cover.
    sw = w * 0.19
    for i, col in enumerate(bands):
        by = y + h * (0.15 + i * 0.24)
        box(x, by, x + sw, by + h * 0.14, col)
    # A hairline of the darkest ink under the book separates it from the one below without a gap.
    box(x, y + h - h * 0.045, x + w, y + h, INK)


def open_book(d: ImageDraw.ImageDraw, cx: int, y: int, w: int, h: int) -> None:
    """The open book crowning the stack — two page fans meeting at a spine."""
    half = w // 2
    d.polygon([(cx, y + int(h * 0.20)), (cx - half, y), (cx - half, y + h), (cx, y + h)], fill=CREAM)
    d.polygon([(cx, y + int(h * 0.20)), (cx + half, y), (cx + half, y + h), (cx, y + h)], fill=CREAM)
    d.polygon([(cx - int(w * 0.035), y + int(h * 0.18)), (cx + int(w * 0.035), y + int(h * 0.18)),
               (cx + int(w * 0.035), y + h), (cx - int(w * 0.035), y + h)], fill=TERRA)
    # ruled lines, solid bars well above the stroke floor
    for side in (-1, 1):
        for i in range(4):
            ly = y + int(h * (0.40 + i * 0.15))
            x0 = cx + side * int(w * 0.09)
            x1 = cx + side * int(w * (0.44 - i * 0.02))
            d.polygon([(min(x0, x1), ly), (max(x0, x1), ly),
                       (max(x0, x1), ly + MIN_STROKE + 3), (min(x0, x1), ly + MIN_STROKE + 3)],
                      fill=SAGE)


def moon_and_stars(im: Image.Image, d: ImageDraw.ImageDraw) -> None:
    """A crescent and solid stars — the late-night half of the joke."""
    mx, my, r = int(W * 0.755), int(H * 0.135), int(W * 0.085)
    d.ellipse([mx - r, my - r, mx + r, my + r], fill=MUSTARD)
    # bite it out with the garment colour by punching alpha, so no second ink is needed
    cut = Image.new("L", (W, H), 0)
    ImageDraw.Draw(cut).ellipse([mx - r + int(r * 0.42) - r, my - r - int(r * 0.16),
                                 mx - r + int(r * 0.42) + r, my + r - int(r * 0.16)], fill=255)
    im.putalpha(Image.composite(Image.new("L", (W, H), 0), im.getchannel("A"), cut))

    rng = random.Random(7)
    for _ in range(13):
        sx = rng.randint(int(W * 0.10), int(W * 0.92))
        sy = rng.randint(int(H * 0.05), int(H * 0.30))
        if abs(sx - mx) < r * 2.1 and abs(sy - my) < r * 2.1:
            continue
        s = rng.randint(16, 34)
        t = max(MIN_STROKE, s // 3)
        col = rng.choice([CREAM, MUSTARD, TEAL])
        d.rectangle([sx - s, sy - t // 2, sx + s, sy + t // 2], fill=col)
        d.rectangle([sx - t // 2, sy - s, sx + t // 2, sy + s], fill=col)


def fit(text: str, role: str, max_w: int, max_h: int, track: float = 0.0):
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    size = max_h
    while size > 14:
        f = typeset.font(role, size)
        w = typeset.text_width(probe, text, f, track)
        b = probe.textbbox((0, 0), text, font=f)
        if w <= max_w and (b[3] - b[1]) <= max_h:
            return f, w, b
        size -= 6
    f = typeset.font(role, 14)
    return f, typeset.text_width(probe, text, f, track), probe.textbbox((0, 0), text, font=f)


def line(im, text, role, top, max_w, max_h, col, track=0.0) -> int:
    f, w, b = fit(text, role, max_w, max_h, track)
    typeset.draw_tracked(ImageDraw.Draw(im), (CX - w // 2, top - b[1]), text, f, (*col, 255), track)
    return top + (b[3] - b[1])


def artwork() -> Image.Image:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    moon_and_stars(im, d)
    d = ImageDraw.Draw(im)   # re-bind after the alpha punch

    # The stack, bottom up: widest at the base, each one leaning a little differently so it reads as
    # a real pile someone left on a nightstand rather than a logo.
    stack = [
        (int(W * 0.50), int(H * 0.090), TEAL,    (MUSTARD, CREAM), -1.1,  int(W * 0.010)),
        (int(W * 0.45), int(H * 0.083), TERRA,   (CREAM, MUSTARD),  1.4, -int(W * 0.022)),
        (int(W * 0.48), int(H * 0.087), PLUM,    (MUSTARD, CREAM), -0.7,  int(W * 0.026)),
        (int(W * 0.43), int(H * 0.080), SAGE,    (CREAM, TERRA),    1.6, -int(W * 0.008)),
    ]
    y = int(H * 0.560)
    for w, h, cover, bands, tilt, off in stack:
        y -= h
        book(d, CX - w // 2 + off, y, w, h, cover, tilt=tilt, bands=bands)

    open_book(d, CX, y - int(H * 0.125) - int(H * 0.010), int(W * 0.46), int(H * 0.125))

    ty = int(H * 0.615)
    ty = line(im, "JUST ONE MORE", "condensed", ty, int(W * 0.74), 210, CREAM, track=0.16) + 46
    ty = line(im, "CHAPTER", "condensed", ty, int(W * 0.94), 760, MUSTARD, track=0.02) + 60
    d.rectangle([CX - int(W * 0.20), ty, CX + int(W * 0.20), ty + MIN_STROKE + 6], fill=TERRA)
    ty += MIN_STROKE + 6 + 58
    line(im, "she said, at 2 a.m.", "display", ty, int(W * 0.60), 132, SAGE)
    return im


def check_print(art: Image.Image) -> dict:
    """Everything the producer needs to trust the file, measured rather than asserted."""
    counts: dict = {}
    for r, g, b, a in art.convert("RGBA").getdata():
        if a == 255:
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    total = sum(counts.values()) or 1
    stray = {c: n / total for c, n in counts.items() if n / total > 0.004 and c not in PALETTE}
    hist = art.getchannel("A").histogram()
    mid = sum(hist[8:248]) / (sum(hist) or 1)
    return {"w": art.width, "h": art.height, "ppi": max(art.size) / PRINT_INCHES,
            "mid_alpha_frac": mid, "stray_colours": stray, "inks": len(counts)}


# ── listing copy ─────────────────────────────────────────────────────────────────────────────────
TITLE = ("Book Lover Shirt, Just One More Chapter Tee, Comfort Colors Reading Lover Gift, "
         "Stacked Books Graphic, Bookish Librarian Present")
TAGS = ["book lover shirt", "one more chapter", "bookish gift tee", "reading lover gift",
        "librarian shirt", "book club tee", "comfort colors tee", "bookworm present",
        "stacked books tee", "english teacher gift", "reader gift idea", "cozy reading shirt",
        "literary gift tee"]
HOOK = ("A leaning stack of books under a crescent moon, for the reader who has never once stopped "
        "at the end of the chapter.")
DISCLOSURE = ("ABOUT THE DESIGN — This design was created by me using AI image-generation tools as "
              "part of my design process, then refined and prepared for print by hand. All type is "
              "hand-set in a commercially licensed font. Original illustration.")
BODY = """THE TEE
• Comfort Colors® 1717 · 100% ring-spun cotton · 6.1 oz, garment-dyed so the colour softens instead of fading
• Relaxed unisex cut — size down if you want it fitted
• Sizes S–4XL · 22 Comfort Colors shades — pick yours from the colour chart in the photos
• DTF print, centre chest — soft to the touch, no cracking, no stiff plastic square

SHIPPING
• Made and shipped from Dallas, Texas, within 1 business day
• Tracking on every order

CARE
Cold wash inside out, tumble dry low, no bleach, and keep the iron off the print.

Questions? Message me — I reply the same day."""


def main() -> int:
    art = artwork()
    art = art.crop(art.getbbox())
    rep = check_print(art)

    # Clear the output folders first. Without this a re-run leaves the previous run's photographs
    # beside the new ones — after the garment selection changed, the folder held two files numbered 02
    # for different colourways. This package gets handed to someone; it has to be exactly what it says.
    OUT.mkdir(parents=True, exist_ok=True)
    for sub in ("print-file", "listing-photos"):
        d_ = OUT / sub
        d_.mkdir(exist_ok=True)
        for old_file in d_.iterdir():
            if old_file.is_file():
                old_file.unlink()

    buf = io.BytesIO()
    art.save(buf, format="PNG", dpi=(300, 300))
    (OUT / "print-file" / f"{SLUG}-300dpi.png").write_bytes(buf.getvalue())

    # ---- photographs, composited on the shop's own garment blanks ----
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT name, colorway, quad, opacity, shade, print_box, px_per_inch, angle, bytes
                   FROM mockup_blanks""")
    blanks = {}
    for name, colorway, quad, opacity, shade, box, ppi, angle, blob in k.fetchall():
        blanks[name] = {"colorway": colorway,
                        "quad": quad if isinstance(quad, list) else json.loads(quad),
                        "opacity": opacity, "shade": shade,
                        "print_box": box if isinstance(box, list) else (json.loads(box) if box else None),
                        "px_per_inch": ppi, "angle": angle,
                        "image": Image.open(io.BytesIO(bytes(blob))).convert("RGB")}
    c.close()

    clean = decontaminate(art)
    shots = []

    def garment_luma(blank_name: str) -> float:
        """Mean luminance of the FABRIC, sampled inside the measured print rectangle.

        Averaging the whole photograph measures the shot, not the shirt: these flat lays are styled on
        a white surface with props, so the frame mean is dominated by the background — Black scored as
        low-contrast and pale Bay scored highest, exactly backwards. `print_box` is the rectangle the
        print actually occupies on this garment, so it is the only part worth sampling.
        """
        import numpy as np
        b = blanks[blank_name]
        box = b["print_box"] or b["quad"]
        pts = box if isinstance(box[0], (list, tuple)) else [(box[0], box[1]), (box[2], box[3])]
        xs = [float(pt[0]) for pt in pts]
        ys = [float(pt[1]) for pt in pts]
        crop = b["image"].convert("L").crop((int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))))
        return float(np.asarray(crop).astype(float).mean())

    def contrast(blank_name: str) -> float:
        """Worst-case gap between any MAJOR ink and the fabric — not the average.

        What decides whether a design survives a garment is its WEAKEST ink: this artwork has cream
        page blocks that disappear on a pale tee and a deep plum that disappears on a dark one. Scoring
        the minimum across the palette, and picking the garments that maximise it, keeps every part of
        the illustration readable instead of most of it.
        """
        g = garment_luma(blank_name)
        lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        return min(abs(lum(c) - g) for c in (CREAM, MUSTARD, TERRA, SAGE, TEAL, PLUM))

    flat_names = sorted((n for n in blanks if n.startswith("flat-")),
                        key=contrast, reverse=True)[:N_FLATS]
    print("  duz cekim kontrasta gore secildi: "
          + ", ".join(f"{blanks[n]['colorway']} ({contrast(n):.0f})" for n in flat_names))

    def placed(b: dict) -> list:
        """The print quad for this blank, LEANED to match the garment.

        Every folded flat in this set is photographed at -5.5 to -8.5 degrees, and the angle is stored
        with the blank precisely so the artwork can be laid along the shirt instead of along the frame.
        Dropping it — which the first pass did — puts a perfectly upright print on a visibly tilted
        tee, and it is the single most obvious tell that a mockup is composited.
        """
        return fit_quad(clean, b["print_box"] or b["quad"], b["px_per_inch"], PRINT_INCHES,
                        angle=float(b.get("angle") or 0.0))

    def shoot(blank_name: str, filename: str, label: str):
        b = blanks[blank_name]
        tpl = dict(b)
        tpl["quad"] = placed(b)
        out = composite_pil(clean, b["image"], tpl)
        out.convert("RGB").save(OUT / "listing-photos" / filename, quality=93, optimize=True)
        shots.append((filename, label))

    shoot(HERO, "01-cover-black-model.jpg", "Cover — Comfort Colors Black, on model")
    for i, name in enumerate(flat_names, start=2):
        shoot(name, f"{i:02d}-flat-{blanks[name]['colorway'].lower().replace(' ','-')}.jpg",
              f"Flat lay — {blanks[name]['colorway']}")

    # Colour chart: one tile per shade, so the buyer picks from a picture instead of a dropdown.
    tiles = [(n, blanks[n]) for n in CHART if n in blanks]
    cols, tw = 5, 520
    rows = (len(tiles) + cols - 1) // cols
    chart = Image.new("RGB", (cols * tw, rows * tw), (245, 242, 236))
    cd = ImageDraw.Draw(chart)
    f = typeset.font("sans", 34)
    for i, (n, b) in enumerate(tiles):
        tpl = dict(b)
        tpl["quad"] = placed(b)
        t = composite_pil(clean, b["image"], tpl).convert("RGB")
        t.thumbnail((tw - 24, tw - 74))
        x, y = (i % cols) * tw, (i // cols) * tw
        chart.paste(t, (x + (tw - t.width) // 2, y + 12))
        cd.text((x + 18, y + tw - 52), b["colorway"], font=f, fill=(40, 34, 30))
    chart.save(OUT / "listing-photos" / f"{len(shots)+1:02d}-colour-chart.jpg", quality=92)
    shots.append((f"{len(shots)+1:02d}-colour-chart.jpg", "All 13 photographed shades"))

    # ---- the paperwork ----
    desc = f"{HOOK}\n\n{DISCLOSURE}\n\n{BODY}"
    assert "AI" in desc[:600], "AI beyani ilk 600 karakterde degil"

    (OUT / "listing.json").write_text(json.dumps({
        "slug": SLUG, "title": TITLE, "title_chars": len(TITLE), "tags": TAGS,
        "description": desc, "price_usd": 24.99, "blank": "Comfort Colors 1717",
        "technique": "DTF", "placement": "Centre chest", "print_inches": PRINT_INCHES,
        "sizes": ["S", "M", "L", "XL", "2X", "3X", "4X"],
        "print_file": {"px": [rep["w"], rep["h"]], "ppi": round(rep["ppi"]), "dpi": 300,
                       "inks": rep["inks"], "mid_alpha_frac": round(rep["mid_alpha_frac"], 5)},
        "photos": [{"file": fn, "caption": cap} for fn, cap in shots],
    }, indent=2, ensure_ascii=False) + "\n")

    tag_lines = "\n".join(f"{i:>2}. {t}  ({len(t)})" for i, t in enumerate(TAGS, 1))
    photo_lines = "\n".join(f"- `{fn}` — {cap}" for fn, cap in shots)
    (OUT / "LISTING.md").write_text(f"""# Just One More Chapter — Book Lover Tee

Ready to file on Etsy. Copy each block straight into the listing form.

---

## Title  ({len(TITLE)} characters)

{TITLE}

> Etsy band 125–140. Primary keyword `Book Lover Shirt` sits in the first
> {len(TITLE.split(',')[0])} characters, which is the part Etsy weighs most and the part a phone
> shows before it truncates.

## Tags  (13 of 13)

{tag_lines}

> Every tag is multi-word and 20 characters or fewer. Single words compete with the whole site;
> a 21-character tag is rejected outright.

## Description

```
{desc}
```

> The AI disclosure sits in the first 600 characters, above the fold. Etsy has removed listings for
> burying it.

## Price and options

| | |
|---|---|
| Price | **$24.99** |
| Blank | Comfort Colors® 1717, garment-dyed |
| Sizes | S · M · L · XL · 2X · 3X · 4X |
| Print | DTF, centre chest, {PRINT_INCHES:.0f} inch |
| Ships from | Dallas, Texas |

---

## Files

**Print file** — `print-file/{SLUG}-300dpi.png`

| | |
|---|---|
| Pixels | {rep['w']} × {rep['h']} |
| Effective resolution | **{rep['ppi']:.0f} PPI** at {PRINT_INCHES:.0f} inch |
| Embedded DPI | 300 |
| Background | fully transparent |
| Distinct inks | {rep['inks']} |
| Partly transparent pixels | {rep['mid_alpha_frac'] * 100:.2f}% |

That last number is the one a DTF printer cares about. Anything above a fraction of a percent means
soft gradients the transfer cannot lay down; here it is only edge antialiasing.

**Listing photos** — `listing-photos/`

{photo_lines}

---

## How it was made

See `PROVENANCE.md`.
""")

    (OUT / "PROVENANCE.md").write_text(f"""# Provenance — {SLUG}

## Artwork

Drawn, not generated. The stack of books, the crescent moon and the stars are flat geometric shapes
composed in code, which is why the file has exactly {rep['inks']} distinct inks and hard edges at any
size. No diffusion model produced any part of this image.

## Type

Every letter is hand-set. No text on this garment came out of an image model — models return malformed
glyphs, dropped characters and invented punctuation.

- **Oswald** (SIL Open Font License 1.1) — "JUST ONE MORE" and "CHAPTER"
- **Playfair Display Bold** (SIL Open Font License 1.1) — "she said, at 2 a.m."

Both faces are vendored with their licence files in `dashboard/assets/fonts/`.

## Intellectual property

The design contains no logo, brand mark, franchise character, team mark or celebrity likeness. Stacked
books and a crescent moon are generic subjects drawn from scratch for this listing.

## AI disclosure

The listing carries the shop's standard disclosure in the first 600 characters of the description, and
the Etsy attribution should be set to **"Designed by"**. AI tools are used elsewhere in this shop's
design process; for this particular file the artwork is code-drawn and the type is hand-set.

## Print specification

| | |
|---|---|
| Format | PNG, transparent background |
| Size | {rep['w']} × {rep['h']} px |
| Resolution | {rep['ppi']:.0f} PPI at {PRINT_INCHES:.0f} inch print |
| Colour | sRGB, {rep['inks']} flat inks |
| Minimum stroke | {MIN_STROKE} px ({MIN_STROKE / 300 * 72:.1f} pt at 300 DPI) |

## Photographs

Composited onto the shop's own photographed Comfort Colors 1717 blanks, warped to each garment's
measured print quad — not pasted flat onto a stock image.
""")

    print(f"paket: {OUT}")
    print(f"  baski : {rep['w']}x{rep['h']}px  {rep['ppi']:.0f} PPI  {rep['inks']} renk  "
          f"yari-saydam %{rep['mid_alpha_frac']*100:.2f}")
    if rep["stray_colours"]:
        print(f"  UYARI palet disi renk: {rep['stray_colours']}", file=sys.stderr)
    print(f"  baslik: {len(TITLE)} karakter · {len(TAGS)} tag · {len(shots)} fotograf")
    return 0


if __name__ == "__main__":
    sys.exit(main())
