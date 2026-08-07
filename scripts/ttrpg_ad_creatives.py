#!/usr/bin/env python3
"""Cut the TTRPG mockups into the two ad ratios Meta actually serves.

4:5 (1080x1350) is the feed format; 9:16 (1080x1920) is Reels, which was by far our cheapest real
landing source on the previous campaign. A square upload gets letterboxed in Reels and loses reach,
so each creative ships in both.

Reels safe area matters: the app puts the profile row, caption and buttons over the bottom of the
frame and a header over the top. The product sits in the middle band and the headline goes above it,
never in the bottom fifth.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SRC = Path("/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild/mockups")
OUT = Path.home() / "Desktop" / "ttrpg-ads"
CHARCOAL = (34, 31, 28)
CREAM = (243, 237, 226)

ADS = [
    ("AD_T1_crest_stitched", "B_emb_macro", "YOUR CHARACTER,\nSTITCHED IN THREAD"),
    ("AD_T2_crest_table",    "B_emb_life",  "THE NAME ON YOUR\nCHARACTER SHEET"),
    ("AD_T3_d20_stitched",   "A_emb_macro", "REAL EMBROIDERY.\nNOT A PRINT."),
    ("AD_T4_crest_print",    "B_dtf_front", "SAME CREST.\nPRINTED, FROM $19.99"),
]


def font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", px)


def fit(draw, text, max_w, start):
    px = start
    while px > 30:
        f = font(px)
        if max(draw.textlength(l, font=f) for l in text.split("\n")) <= max_w:
            return f
        px -= 4
    return font(px)


def four_by_five(src: Image.Image) -> Image.Image:
    """Crop the square's sides — the emblem is centred in every shot, so nothing important is lost."""
    w, h = src.size
    new_w = int(h * 0.8)
    left = (w - new_w) // 2
    return src.crop((left, 0, left + new_w, h)).resize((1080, 1350), Image.LANCZOS)


def nine_by_sixteen(src: Image.Image, headline: str) -> Image.Image:
    canvas = Image.new("RGB", (1080, 1920), CHARCOAL)
    photo = src.resize((1080, 1080), Image.LANCZOS)
    canvas.paste(photo, (0, 520))
    d = ImageDraw.Draw(canvas)
    f = fit(d, headline, 900, 96)
    lines = headline.split("\n")
    y = 260
    for line in lines:
        d.text(((1080 - d.textlength(line, font=f)) / 2, y), line, font=f, fill=CREAM)
        y += int(f.size * 1.18)
    # nothing below y=1600: Reels puts its caption and buttons there
    fs = font(46)
    tag = "Comfort Colors® · made to order in the USA"
    d.text(((1080 - d.textlength(tag, font=fs)) / 2, 1660), tag, font=fs, fill=(168, 160, 148))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, mock, headline in ADS:
        src = Image.open(SRC / f"{mock}.png").convert("RGB")
        four_by_five(src).save(OUT / f"{name}_4x5.jpg", quality=92)
        nine_by_sixteen(src, headline).save(OUT / f"{name}_9x16.jpg", quality=92)
        print(f"  {name}: 4x5 + 9x16")


if __name__ == "__main__":
    main()
