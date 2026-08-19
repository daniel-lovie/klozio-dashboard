#!/usr/bin/env python3
"""Build the AI/coding print files from the mascot and hand-set type — no image generation at all.

These five designs are a pixel mascot and a line of text. Neither needs a diffusion model: the mascot is
a grid (scripts/pixel_mascot.py) and the type is hand-set in a licensed font (scripts/typeset.py). Asking
a generator for them would cost credits, return a DIFFERENT creature every time — which defeats the point
of a mascot — and produce soft approximations of pixels that DTF then prints as mush.

So this composes the print file directly. It is deterministic, free, and it works while the Higgsfield
session is down, which is how these got built at all.

Layout follows the reference the operator supplied: mascot above, one line of type below for the big
centre prints; mascot alone for the small chest patch; type alone with the mascot as a leading mark for
the one-liners.

    python3 scripts/build_vibe_prints.py            # dry run
    python3 scripts/build_vibe_prints.py --apply
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pixel_mascot                                                # noqa: E402
import typeset                                                     # noqa: E402
import produce_images as pi                                        # noqa: E402

INK = (232, 155, 114)          # terracotta, the line's single accent
CANVAS = 3000                  # the print envelope: 10 inches at 300 PPI

# slug -> layout. "stack" = mascot over text, "inline" = mascot then text on one line, "mark" = mascot only.
LAYOUT = {
    "vibe-tokens-v1": "stack",
    "vibe-pixelpet-v1": "mark",
    "vibe-hallucinating-v1": "inline",
    "vibe-absolutely-right-v1": "inline",
    "vibe-no-mistakes-v1": "inline",
}


def mascot(px: int) -> Image.Image:
    return pixel_mascot.render(px, INK, None)


def fit_text(text: str, max_w: int, target_h: int, role: str = "mono"):
    """Largest size of the face whose line fits the width AND the height.

    Monospace by default: this is a coding line and the joke in "Hallucinating..." is that it reads like
    machine output. A condensed poster face says nothing about terminals.
    """
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    size = target_h
    while size > 12:
        f = typeset.font(role, size)
        b = probe.textbbox((0, 0), text, font=f)
        if (b[2] - b[0]) <= max_w and (b[3] - b[1]) <= target_h:
            return f, b
        size -= 4
    f = typeset.font(role, 12)
    return f, probe.textbbox((0, 0), text, font=f)


def compose(layout: str, text: str) -> Image.Image:
    im = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    if layout == "mark":
        m = mascot(int(CANVAS * 0.86))
        im.paste(m, ((CANVAS - m.width) // 2, (CANVAS - m.height) // 2), m)
        return im.crop(im.getbbox())

    if layout == "stack":
        m = mascot(int(CANVAS * 0.62))
        gap = int(CANVAS * 0.06)
        f, b = fit_text(text, int(CANVAS * 0.92), int(CANVAS * 0.15))
        tw, th = b[2] - b[0], b[3] - b[1]
        total = m.height + gap + th
        y = (CANVAS - total) // 2
        im.paste(m, ((CANVAS - m.width) // 2, y), m)
        d.text(((CANVAS - tw) // 2 - b[0], y + m.height + gap - b[1]), text, font=f, fill=INK)
        return im.crop(im.getbbox())

    # inline: the mascot takes the place the reference gave the logo — a leading mark before the words.
    #
    # The mascot's width depends on the FINAL text height, and the text's budget depends on the mascot's
    # width, so a single pass cannot solve it. Computing the mascot from the target height instead
    # collapsed the text budget to 673px and produced a 94 PPI file. Two passes converge: guess, measure,
    # re-budget, refit.
    MASCOT_RATIO = 18 / 15                       # the grid is 18 cells wide by 15 tall
    margin = int(CANVAS * 0.04)
    th = int(CANVAS * 0.18)                      # first guess at the cap height
    f = b = None
    for _ in range(2):
        mascot_w = int(th * 1.9 * MASCOT_RATIO)
        gap = int(th * 0.55)
        budget = CANVAS - mascot_w - gap - margin
        # Height is left generous on purpose so WIDTH is what binds: a one-line design prints at its long
        # side, and capping the height is what made an 8 inch print come out at 252 PPI.
        f, b = fit_text(text, budget, int(CANVAS * 0.30))
        th = b[3] - b[1]
    tw = b[2] - b[0]
    m = mascot(int(th * 1.9))
    gap = int(th * 0.55)
    x = max(0, (CANVAS - (m.width + gap + tw)) // 2)
    cy = CANVAS // 2
    im.paste(m, (x, cy - m.height // 2), m)
    d.text((x + m.width + gap - b[0], cy - th // 2 - b[1]), text, font=f, fill=INK)
    return im.crop(im.getbbox())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT id, slug, hook, design_params FROM products
                  WHERE slug = ANY(%s) ORDER BY slug""", (list(LAYOUT),))
    rows = k.fetchall()

    for pid, slug, hook, dp in rows:
        want_in = pi.print_placement(dp)["inches"]
        art = compose(LAYOUT[slug], (hook or "").strip())
        long_side = max(art.size)
        ppi = long_side / max(want_in, 0.1)
        print(f"{slug:26} {LAYOUT[slug]:7} {art.width}x{art.height}px  {want_in:g}in -> {ppi:.0f} PPI"
              f"  {'OK' if ppi >= 285 else 'DUSUK'}")
        if a.apply:
            buf = io.BytesIO()
            art.save(buf, format="PNG", dpi=(300, 300))
            blob = buf.getvalue()
            k.execute("""UPDATE products SET print_file=%s, print_file_name=%s, print_file_w=%s,
                                print_file_h=%s, print_dpi=%s, design_model='pixel_mascot+typeset',
                                design_state=NULL, updated_at=now()
                          WHERE id=%s""",
                      (psycopg2.Binary(blob), f"{slug}-print.png", art.width, art.height,
                       round(ppi), pid))
    if a.apply:
        c.commit()
        print(f"\n{len(rows)} baski dosyasi yazildi. Sirada: produce_images ile ilan gorselleri.")
    else:
        print("\nDRY RUN. Yazmak icin --apply")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
