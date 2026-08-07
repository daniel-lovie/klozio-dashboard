#!/usr/bin/env python3
"""Build the square info cards that sit after the mockups in a listing.

Two hard-won rules are baked in here so they stop being rediscovered:

1. **Safe zone.** Etsy crops the main listing image to a portrait frame, losing roughly 10% off each
   side. All type is laid out inside the centre 76% of the width; only background bands run full
   width. A card whose text touches the edges reads as truncated on the listing page.
2. **No decorative glyphs.** Arial and Helvetica have no ✓ ✕ → in the faces we load, so PIL renders
   them as empty boxes — invisible locally, obvious once uploaded. Numbered discs and drawn marks
   are used instead of characters.

Usage:
    make_info_cards.py <out_dir> <card.json>

card.json: [{"file": "how-to.jpg", "title": "HOW TO PERSONALIZE", "footer": "REAL EMBROIDERY",
             "steps": [["Pick colour & size", "22 shades, S-4XL"], ...]}]
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE = 2000
BG = (245, 242, 236)
INK = (28, 26, 24)
MUTED = (96, 90, 84)
ACCENT = (168, 58, 44)
DISC = (110, 128, 96)
FOOTER_BG = (32, 29, 26)
SAFE = 0.76


def font(px: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    path = ("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
            else "/System/Library/Fonts/Supplemental/Arial.ttf")
    return ImageFont.truetype(path, px)


def fit(draw: ImageDraw.ImageDraw, text: str, max_w: int, start: int, bold: bool = True):
    px = start
    while px > 20:
        f = font(px, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        px -= 4
    return font(px, bold)


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_w: int):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=f) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def card(spec: dict, out: Path) -> None:
    im = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(im)
    safe_w = int(SIZE * SAFE)
    left = (SIZE - safe_w) // 2

    ft = fit(d, spec["title"], safe_w, 150)
    d.text(((SIZE - d.textlength(spec["title"], font=ft)) / 2, 130), spec["title"], font=ft, fill=ACCENT)
    rule_y = 130 + ft.size + 60
    d.rectangle([left, rule_y, left + safe_w, rule_y + 6], fill=INK)

    y = rule_y + 130
    n_steps = len(spec["steps"])
    block = (SIZE - 300 - y) // max(n_steps, 1)
    for i, (head, sub) in enumerate(spec["steps"], start=1):
        if spec.get("numbered", True):
            r = 62
            cx, cy = left + r, y + r
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DISC)
            fn = font(int(r * 1.05))
            d.text((cx - d.textlength(str(i), font=fn) / 2, cy - fn.size * 0.62), str(i), font=fn, fill=(255, 255, 255))
            tx = left + r * 2 + 55
        else:
            # a drawn square bullet — never a glyph
            d.rectangle([left, y + 34, left + 34, y + 68], fill=DISC)
            tx = left + 90

        fh = fit(d, head, left + safe_w - tx, 96)
        d.text((tx, y + 6), head, font=fh, fill=INK)
        fs = font(58, bold=False)
        ly = y + fh.size + 26
        for line in wrap(d, sub, fs, left + safe_w - tx):
            d.text((tx, ly), line, font=fs, fill=MUTED)
            ly += int(fs.size * 1.32)
        y += block

    if spec.get("footer"):
        fh_h = 190
        d.rectangle([0, SIZE - fh_h, SIZE, SIZE], fill=FOOTER_BG)
        ff = fit(d, spec["footer"], safe_w, 92)
        d.text(((SIZE - d.textlength(spec["footer"], font=ff)) / 2,
                SIZE - fh_h + (fh_h - ff.size) / 2 - 8), spec["footer"], font=ff, fill=(242, 236, 226))

    im.save(out, quality=93)
    print(f"  {out.name}")


def main() -> None:
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for spec in json.loads(Path(sys.argv[2]).read_text()):
        card(spec, out_dir / spec["file"])


if __name__ == "__main__":
    main()
