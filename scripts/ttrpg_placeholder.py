#!/usr/bin/env python3
"""Put a placeholder name in the crest's ribbon so the personalizer has a token to swap.

The personalizer works by REPLACING existing lettering in the base print file: it reads
products.personalization_placeholder as the registry value, confirms it by vision on the base image,
then asks Higgsfield to swap that token for the buyer's text. A design with an empty ribbon gives it
nothing to find — the order would fail with "cannot identify design's text token" and land in
needs_human. Ads are already driving traffic to the personalised crest, so this has to exist before
the first order does.

The token is hand-set (never generated), same rule as the "20": AI must not render type.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import psycopg2
import os

DIR = Path("/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild")
TOKEN = "KAELEN"          # 6 chars, typical fantasy character name, unambiguous for vision detection
CHARCOAL = (26, 24, 22)

FILES = [
    ("B2_shield_emb.png",   "B2_shield_emb_ph.png",   "h-emb-c9-v1"),
    ("B2_shield_final.png", "B2_shield_final_ph.png", "h-a1-c8-v1"),
]


def font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", px)


def ribbon_box(im: Image.Image):
    """Largest light band in the lower part of the badge = the ribbon."""
    a = np.asarray(im.convert("RGBA")).astype(int)
    h, w, _ = a.shape
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    light = (alpha > 120) & (rgb.min(axis=2) > 200)     # white or cream
    light[: int(h * 0.60), :] = False                   # ribbon sits low
    ys, xs = np.where(light)
    if ys.size == 0:
        raise SystemExit("kurdele bulunamadi")
    # The ribbon's INTERIOR, not the whole light region: the flared tails and the shield's pale
    # bottom edge also read as light, and including them puts the type over the ribbon's top outline.
    # Anchor on the widest light row, then keep only the contiguous run that stays nearly as wide.
    rows = np.bincount(ys, minlength=h)
    peak = int(rows.argmax())

    # 0.80 assumes a parallel-sided banner. A scroll that tapers, or one drawn as an outline rather
    # than a filled band, collapses to a single row at that threshold — and a zero-height box then
    # produced `font size must be greater than 0`, which reads like a font bug and is not one.
    # Loosen progressively, and if the band is still too thin to carry a stitched name, say exactly
    # that: a 3px scroll cannot hold type and no font size rescues it.
    def band(frac: float) -> tuple[int, int]:
        t = rows[peak] * frac
        a0 = a1 = peak
        while a0 > 0 and rows[a0 - 1] >= t:
            a0 -= 1
        while a1 < h - 1 and rows[a1 + 1] >= t:
            a1 += 1
        return a0, a1

    for frac in (0.80, 0.50, 0.35):
        y0, y1 = band(frac)
        if y1 - y0 >= h * 0.02:
            break
    if y1 - y0 < h * 0.015:
        raise SystemExit(f"kurdele cok ince ({y1 - y0}px) — isim dikilemez, dolu bir bant gerekiyor")
    cols = np.where(light[y0:y1 + 1].any(axis=0))[0]
    return int(cols.min()), y0, int(cols.max()), y1


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    for src, dst, slug in FILES:
        im = Image.open(DIR / src).convert("RGBA")
        x0, y0, x1, y1 = ribbon_box(im)
        bw, bh = x1 - x0, y1 - y0
        d = ImageDraw.Draw(im)
        size = int(bh * 0.58)
        f = font(size)
        while d.textlength(TOKEN, font=f) > bw * 0.66 and size > 40:
            size -= 6
            f = font(size)
        l, t, r, b = d.textbbox((0, 0), TOKEN, font=f)
        d.text((x0 + (bw - (r - l)) / 2 - l, y0 + (bh - (b - t)) / 2 - t), TOKEN, font=f, fill=CHARCOAL + (255,))
        im.save(DIR / dst)

        cur.execute("""UPDATE products SET print_file=%s, print_file_name=%s,
                              personalization_placeholder=%s, updated_at=now()
                        WHERE slug=%s""",
                    (psycopg2.Binary((DIR / dst).read_bytes()), dst, TOKEN, slug))
        print(f"  {slug:14} kurdele x{x0}-{x1} y{y0}-{y1} · '{TOKEN}' punto {size} · registry='{TOKEN}'")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
