#!/usr/bin/env python3
"""Etsy cover formula: turn a mood mockup into a thumbnail that SELLS.

Winner patterns (see .claude/skills/listing-covers): offer text ON the image,
design large in frame, bright; crisp text is rendered here in PIL (never by the
image model — model text goes soft at thumbnail size).

Usage: make_cover.py in.jpg out.jpg --banner "TEXT" --strip "TEXT" [--brightness 1.12]
"""
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BRICK = (179, 62, 52)
DARK = (38, 32, 28)
CREAM = (240, 230, 215)

def font(px, bold=True):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", px, index=1 if bold else 0)
    except OSError:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", px)

def fit_font(draw, text, max_w, start_px, bold=True):
    px = start_px
    while px > 18:
        f = font(px, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        px -= 2
    return font(px, bold)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--banner", required=True)
    ap.add_argument("--strip", required=True)
    ap.add_argument("--brightness", type=float, default=1.12)
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGB")
    w, h = im.size
    # tighter frame: drop prop-heavy top band, keep design dominant
    im = im.crop((int(w*0.07), int(h*0.12), int(w*0.93), int(h*0.97)))
    im = ImageEnhance.Brightness(im).enhance(a.brightness)
    im = ImageEnhance.Color(im).enhance(1.06)

    W, H = im.size
    d = ImageDraw.Draw(im)
    bh = int(W * 0.082)
    d.rectangle([0, 0, W, bh], fill=BRICK)
    f1 = fit_font(d, a.banner, W * 0.93, int(bh * 0.52))
    d.text(((W - d.textlength(a.banner, font=f1)) / 2, (bh - f1.size) / 2 - int(bh*0.03)), a.banner, font=f1, fill="white")

    sh = int(W * 0.062)
    d.rectangle([0, H - sh, W, H], fill=DARK)
    f2 = fit_font(d, a.strip, W * 0.93, int(sh * 0.5))
    d.text(((W - d.textlength(a.strip, font=f2)) / 2, H - sh + (sh - f2.size) / 2), a.strip, font=f2, fill=CREAM)

    im.save(a.dst, quality=92)
    print(f"cover {im.size} -> {a.dst}")

if __name__ == "__main__":
    main()
