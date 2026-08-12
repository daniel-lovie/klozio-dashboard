#!/usr/bin/env python3
"""Hand-set the words on a design, the way the designs that actually sell do it.

Why this module exists
----------------------
Measured on 40 non-personalised Comfort Colors tees selling 150-1300/month, nearly every winner has
text, and the text is *part of the composition*: a serif caption in caps under a straight-faced
engraving ("TUMMY HURTS"), a title arched over a character ("THE DESPERADO CLUB"), a phrase framing an
illustration top and bottom ("ALL PLANTS ARE EDIBLE" / "SOME ONLY ONCE"). Our own designs went out as
wordless emblems, which is the single clearest reason they looked weak beside them.

The old `stage_slogan` set one flat line under the emblem in Impact, from a hardcoded macOS font path
with no fallback — so on the deployed Alpine image it would have raised OSError, and the server-side
producer never called it at all. Products built on the server therefore had no words on them.

Two rules kept from the old code because they are still true:
  · The model never draws letters. It returns malformed glyphs, dropped characters and invented
    punctuation. Every word ships from here.
  · The phrase has to read in a 170px Etsy grid tile, not just at full size.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Font roles, in preference order. macOS paths first so local work uses the good faces; the Alpine
# packages next (ttf-liberation carries a Times clone and a genuinely condensed Sans Narrow, which are
# the two shapes the winners use); DejaVu last. A generic fallback is announced, never silent — type set
# in the wrong face is the kind of defect that looks like nothing and reads as cheap.
FONT_ROLES: dict[str, list[str]] = {
    "serif": [
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf",
    ],
    "condensed": [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/usr/share/fonts/liberation-sans-narrow/LiberationSansNarrow-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSansNarrow-Bold.ttf",
        "/usr/share/fonts/liberation2/LiberationSansNarrow-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSansCondensed-Bold.ttf",
    ],
    "sans": [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    ],
}
_warned: set[str] = set()


def font(role: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_ROLES.get(role, FONT_ROLES["sans"]):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    if role not in _warned:
        _warned.add(role)
        print(f"UYARI typeset: '{role}' icin uygun font yok, bitmap yedegine dusuldu — "
              f"yazi kalitesi bozulur (Dockerfile'a ttf-liberation ekli mi?)", file=sys.stderr)
    return ImageFont.load_default()


def _fit(draw: ImageDraw.ImageDraw, text: str, f_role: str, max_w: int, max_h: int,
         track: float = 0.0) -> tuple[ImageFont.FreeTypeFont, int]:
    """Largest size where the line fits both the width and the height budget."""
    lo, hi, best = 8, max_h * 2, None
    while lo <= hi:
        mid = (lo + hi) // 2
        f = font(f_role, mid)
        w = text_width(draw, text, f, track)
        t, b = draw.textbbox((0, 0), text, font=f)[1::2]
        if w <= max_w and (b - t) <= max_h:
            best = (f, mid); lo = mid + 1
        else:
            hi = mid - 1
    return best or (font(f_role, 8), 8)


def text_width(draw: ImageDraw.ImageDraw, text: str, f, track: float) -> int:
    """Width including letter-spacing. PIL has no tracking, so it is applied per character."""
    if not track:
        l, _, r, _ = draw.textbbox((0, 0), text, font=f)
        return r - l
    return sum(draw.textbbox((0, 0), ch, font=f)[2] for ch in text) + int(track * f.size * (len(text) - 1))


def draw_tracked(draw: ImageDraw.ImageDraw, xy, text: str, f, fill, track: float) -> None:
    """Draw with letter-spacing. Caps with air between them is what makes a caption look set, not typed."""
    x, y = xy
    if not track:
        draw.text((x, y), text, font=f, fill=fill)
        return
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textbbox((0, 0), ch, font=f)[2] + track * f.size


def draw_arc(canvas: Image.Image, text: str, f, fill, cx: int, cy: int, radius: int,
             spread_deg: float = 110.0) -> None:
    """Set text along an upward arc — the shape over "THE DESPERADO CLUB".

    Each glyph is rendered on its own transparent tile and rotated, because PIL cannot draw curved
    baselines. Rotating a whole rendered word instead would shear the letters.
    """
    d = ImageDraw.Draw(canvas)
    widths = [d.textbbox((0, 0), ch, font=f)[2] for ch in text]
    total = sum(widths) or 1
    ang = -spread_deg / 2
    for ch, w in zip(text, widths):
        step = spread_deg * (w / total)
        a = math.radians(ang + step / 2)
        tile = Image.new("RGBA", (w + f.size, int(f.size * 1.6)), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((f.size // 2, 0), ch, font=f, fill=fill)
        tile = tile.rotate(-math.degrees(a), resample=Image.BICUBIC, expand=True)
        x = cx + int(radius * math.sin(a)) - tile.width // 2
        y = cy - int(radius * math.cos(a)) - tile.height // 2
        canvas.alpha_composite(tile, (x, y))
        ang += step


def _wrap(draw: ImageDraw.ImageDraw, text: str, f_role: str, size: int, max_w: int,
          track: float, max_lines: int = 3) -> list[str]:
    """Wrap to at most `max_lines`, shrinking the trial size until every word fits.

    The first version sliced the result (`[:2]`) and silently dropped the rest — "MEMENTO MORI, BUT MAKE
    IT CASUAL" shipped as "MEMENTO MORI, BUT". A caption that says something other than what was approved
    is worse than one that is small.
    """
    for trial in range(size, 7, -max(1, size // 24)):
        lines = _wrap_at(draw, text, f_role, trial, max_w, track)
        if len(lines) <= max_lines:
            return lines
    return _wrap_at(draw, text, f_role, 8, max_w, track)


def _wrap_at(draw: ImageDraw.ImageDraw, text: str, f_role: str, size: int, max_w: int,
             track: float) -> list[str]:
    f = font(f_role, size)
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_width(draw, trial, f, track) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


# Which layout each design style gets. Straight from what sells: the engraving and plate formulas put a
# serif caption underneath, the character formula arches a title over the top, retro stacks poster type.
STYLE_LAYOUT = {
    "engraving": "caption",
    "plate": "frame",
    "collection": "frame",
    "character": "arc",
    "retro": "poster",
    "minimal": "small",
}


def compose(art: Image.Image, text: str | None, style: str = "engraving",
            ink: str = "#F2E8D5", size: int = 2048) -> tuple[Image.Image, int, Image.Image]:
    """Place the artwork and set the words. Returns the canvas, how many lines were drawn, and a MASK of
    the type itself.

    The mask exists so a caller can measure the type it just set. Inferring which pixels are type by
    diffing the canvas against the original artwork does not work: the artwork is resized and repositioned
    here, so the difference is mostly moved illustration — measured that way, cream type read as luminance
    186 instead of 242. Drawing the words on their own layer makes the answer exact.

    `ink` defaults to the warm cream the winners print on dark garment-dyed cotton; pass a dark value
    for light shirts. Nothing is drawn when there is no text — a wordless design is still valid, it is
    just weaker.
    """
    art = art.convert("RGBA")
    art = art.crop(art.getbbox() or (0, 0, art.width, art.height))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Type goes on its own layer, composited at the end; its alpha is the mask returned to the caller.
    type_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(type_layer)
    fill = tuple(int(ink.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    pad = int(size * 0.03)
    inner = size - 2 * pad

    if not text:
        s = min(inner / art.width, inner / art.height)
        art = art.resize((int(art.width * s), int(art.height * s)), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
        return canvas, 0, type_layer.getchannel("A")

    words = text.strip().upper()
    layout = STYLE_LAYOUT.get(style, "caption")
    drawn = 0

    if layout == "arc":
        # Title curves over the character; art sits below the arc.
        f, _ = _fit(d, words, "serif", int(inner * 0.95), int(size * 0.11), track=0.06)
        band = int(size * 0.20)
        s = min(inner / art.width, (inner - band) / art.height)
        art = art.resize((int(art.width * s), int(art.height * s)), Image.LANCZOS)
        ax = (size - art.width) // 2
        canvas.alpha_composite(art, (ax, pad + band))
        radius = int(size * 0.46)
        draw_arc(type_layer, words, f, fill, size // 2, pad + radius + int(f.size * 0.2),
                 radius=radius, spread_deg=86.0)
        drawn = 1
    elif layout == "frame":
        # Half the phrase above, half below — the botanical-plate formula.
        parts = words.split(" ")
        mid = max(1, len(parts) // 2)
        top, bottom = " ".join(parts[:mid]), " ".join(parts[mid:])
        band = int(size * 0.11)
        s = min(inner / art.width, (size - 2 * band - 4 * pad) / art.height)
        art = art.resize((int(art.width * s), int(art.height * s)), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, pad + band + pad))
        for line, y in ((top, pad), (bottom, size - pad - band)):
            if not line:
                continue
            f, _ = _fit(d, line, "serif", inner, band, track=0.10)
            w = text_width(d, line, f, 0.10)
            t = d.textbbox((0, 0), line, font=f)[1]
            draw_tracked(d, ((size - w) // 2, y - t), line, f, fill, 0.10)
            drawn += 1
    elif layout == "poster":
        # Big condensed type IS the design; art tucks under it.
        lines = _wrap(d, words, "condensed", int(size * 0.16), inner, 0.0)[:3]
        band = int(size * 0.15) * len(lines)
        s = min(inner / art.width, (size - band - 4 * pad) / art.height)
        art = art.resize((int(art.width * s), int(art.height * s)), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, pad + band + pad))
        y = pad
        for line in lines:
            f, _ = _fit(d, line, "condensed", inner, int(size * 0.15), track=0.0)
            w = text_width(d, line, f, 0.0)
            t = d.textbbox((0, 0), line, font=f)[1]
            d.text(((size - w) // 2, y - t), line, font=f, fill=fill)
            y += int(size * 0.145)
            drawn += 1
    else:
        # caption / small: serif caps under the illustration, letter-spaced. The strongest formula.
        # The text band is capped for the WHOLE caption, not per line. Charging 10.5% of the canvas per
        # line meant a three-line hook ate a third of the print and left the illustration small — the
        # winners are the other way round: image dominant, caption a quiet strip beneath it. Lines share
        # the cap and shrink to fit instead of pushing the artwork out.
        cap_total = size * (0.14 if layout == "small" else 0.22)
        width_budget = int(inner * (0.62 if layout == "small" else 1.0))
        lines = _wrap(d, words, "serif", int(size * 0.09), width_budget, 0.10, max_lines=3)
        band_h = int(cap_total / max(1, len(lines)))
        band = band_h * len(lines)
        s = min(inner / art.width, (size - band - 5 * pad) / art.height)
        art = art.resize((int(art.width * s), int(art.height * s)), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, pad))
        y = pad + art.height + int(size * 0.03)
        for line in lines:
            f, _ = _fit(d, line, "serif", width_budget, band_h, track=0.10)
            w = text_width(d, line, f, 0.10)
            t = d.textbbox((0, 0), line, font=f)[1]
            draw_tracked(d, ((size - w) // 2, y - t), line, f, fill, 0.10)
            y += band_h
            drawn += 1

    # Type over artwork: the layer is composited last so the words are never buried by the illustration.
    canvas.alpha_composite(type_layer)
    return canvas, drawn, type_layer.getchannel("A")
