#!/usr/bin/env python3
"""Make the cover a real photograph: our design composited onto a licensed blank.

Printful's render is honest but it is a studio ghost, and every shop on Printful ships the same one.
A photograph of a person in a room is what makes a listing look like a shop. The Printful shots stay
as supporting images — they are the proof that the garment and placement are real.

The constraint that shapes this: a blank photograph IS a particular colour of shirt. Showing an
Ivory photograph on a product listed as Butter is the same defect as showing a DTG print on an
embroidered tee, so the colourway is chosen FROM the colours we hold a photograph of, and the
product row is updated to match. All eight are real Comfort Colors shades with Printful variants, so
nothing becomes unfulfillable — the choice is narrowed, not faked.

Within those eight the pick is by measured contrast, exactly as before: a design that disappears into
the cloth is not improved by being photographed on a person.
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
from mockup_composite import load_config, composite, BLANKS  # noqa: E402

PIPELINE = Path("/Users/omer/Documents/code/etsy/pipeline")
# blank template -> the Comfort Colors shade it actually photographs
MODEL_COLORWAY = {
    "model-IvoryTrendy4": ("Ivory", (255, 244, 217)),
    "model-White": ("White", (255, 255, 255)),
    "model-Bay2": ("Bay", (184, 191, 171)),
    "model-Yam": ("Yam", (219, 100, 47)),
    "model-Moss": ("Moss", (107, 112, 83)),
    "model-Pepper": ("Pepper", (81, 79, 76)),
    "model-Navy": ("True Navy", (30, 44, 74)),
    "model-Black": ("Black", (27, 27, 28)),
}
BADGE_FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def pick_template(design: Path) -> tuple[str, str, float]:
    im = Image.open(design).convert("RGBA")
    im.thumbnail((256, 256))
    a = np.asarray(im)
    op = a[:, :, 3] > 128
    if not op.any():
        raise ValueError("bos tasarim")
    pl = luma(a[:, :, :3][op].astype(float))
    best = None
    for tpl, (name, rgb) in MODEL_COLORWAY.items():
        vis = float((np.abs(pl - luma(np.array(rgb, float))) > 60).mean())
        if best is None or vis > best[2]:
            best = (tpl, name, vis)
    return best


def chest_left(quad) -> list:
    """Shrink the full-front quad down to the 4-inch badge we actually stitch.

    An embroidered product is fulfilled at embroidery_chest_left. Compositing its artwork across the
    whole chest advertises a large print and ships a patch — the same mismatch the Printful mockups
    had before they were asked for the right technique, reintroduced here by a compositor that only
    knew one placement. On a front-facing photograph the wearer's left chest sits right of centre.
    """
    (x0, y0), (x1, _), _, (_, y3) = [tuple(pt) for pt in quad]
    w, h = x1 - x0, y3 - y0
    side = int(w * 0.30)
    cx = int(x0 + w * 0.50 + w * 0.28)
    top = int(y0 + h * 0.06)
    return [[cx - side // 2, top], [cx + side // 2, top],
            [cx + side // 2, top + side], [cx - side // 2, top + side]]


def badge(img: Image.Image, colorway: str) -> Image.Image:
    """The colour name, stamped in the corner. Buyers ask which shade this is; this answers it."""
    w, h = img.size
    pad = int(w * 0.03)
    d = ImageDraw.Draw(img, "RGBA")
    f1 = ImageFont.truetype(BADGE_FONT, int(w * 0.028))
    f2 = ImageFont.truetype(BADGE_FONT, int(w * 0.046))
    top, bot = "COMFORT COLORS", colorway.upper()
    tw = max(d.textbbox((0, 0), top, font=f1)[2], d.textbbox((0, 0), bot, font=f2)[2])
    bw, bh = tw + pad * 2, int(w * 0.115)
    x, y = pad, h - bh - pad
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=int(bh * 0.28), fill=(20, 20, 20, 205))
    d.text((x + (bw - d.textbbox((0, 0), top, font=f1)[2]) / 2, y + bh * 0.16), top,
           font=f1, fill=(235, 232, 226, 255))
    d.text((x + (bw - d.textbbox((0, 0), bot, font=f2)[2]) / 2, y + bh * 0.44), bot,
           font=f2, fill=(255, 255, 255, 255))
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    cfg = load_config()
    root = PIPELINE / a.campaign / "designs"
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    dirs = [d for d in sorted(root.iterdir()) if d.is_dir() and (d / "final.png").exists()]
    if a.only:
        dirs = [d for d in dirs if d.name == a.only]
    if a.limit:
        dirs = dirs[:a.limit]

    done = 0
    for d in dirs:
        cur.execute("SELECT id, hero_colorway, technique FROM products WHERE slug=%s", (d.name,))
        row = cur.fetchone()
        if not row:
            print(f"  {d.name:14} urun satiri yok")
            continue
        pid, was, technique = row
        try:
            tpl, colorway, vis = pick_template(d / "final.png")
        except Exception as e:
            print(f"  {d.name:14} {e}")
            continue
        out = d / "covers" / f"{d.name}-blank-cover.jpg"
        note = "" if colorway == was else f"  kumas {was} -> {colorway}"
        print(f"  {d.name:14} {tpl:20} gorunur %{vis*100:.0f}{note}")
        if not a.apply:
            continue

        spec = dict(cfg[tpl])
        if technique == "embroidery":
            spec["quad"] = chest_left(spec["quad"])
        composite(d / "final.png", BLANKS / spec["file"], spec, out)
        im = badge(Image.open(out).convert("RGB"), colorway)
        im.save(out, quality=93)

        # rank 1 is the cover; everything already there shifts down rather than being replaced, so
        # the Printful shots survive as the proof that the placement is real.
        cur.execute("UPDATE products SET hero_colorway=%s WHERE id=%s", (colorway, pid))
        cur.execute("DELETE FROM product_images WHERE product_id=%s AND filename=%s",
                    (pid, out.name))
        # (product_id, rank) is unique, so a single +1 collides with the row above it mid-update;
        # park everything out of range first, then bring it back one lower.
        cur.execute("UPDATE product_images SET rank = rank + 1000 WHERE product_id=%s", (pid,))
        cur.execute("UPDATE product_images SET rank = rank - 999 WHERE product_id=%s", (pid,))
        cur.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                       VALUES (%s, 1, %s, 'image/jpeg', %s)""",
                    (pid, out.name, psycopg2.Binary(out.read_bytes())))
        conn.commit()
        done += 1

    print(f"\n{done} urunun kapagi degistirildi" + ("" if a.apply else "   (--apply verilmedi)"))


if __name__ == "__main__":
    main()
