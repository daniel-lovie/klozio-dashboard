#!/usr/bin/env python3
"""The pixel mascot, drawn from a grid rather than generated.

The operator asked for this creature to appear on every design in the AI/coding line. That only works
if it is the SAME creature every time, and describing it to an image model produces a different one on
every call — which is the opposite of a mascot. So it is defined here as a grid of blocks and rendered
deterministically.

Three things follow from that, all of them wins:

  IT IS IDENTICAL every time, so it can actually accumulate recognition.
  IT IS FREE — no generation credit, and it still renders when the Higgsfield session is down.
  IT IS ACTUALLY PIXEL ART. A diffusion model produces soft, slightly irregular "pixels"; a grid
  produces hard edges at any size, which is also what survives DTF printing.

It is our own grid, drawn from scratch. A blocky sprite with eyes and legs identifies nobody and is not
protectable — unlike a company logo, which is why the starburst was refused and this was not.

    python3 scripts/pixel_mascot.py --out /tmp/mascot.png --size 2400 --ink E89B72 --bg 3C3C3E
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

# One character per cell. '#' is ink, '.' is empty. Read it and you can see the creature — which is the
# point: the mascot is editable by anyone who can count squares, with no tooling.
GRID = """
..................
...############...
..##############..
..##############..
..#.##########.#..
..#.##########.#..
..##############..
.################.
.################.
..##############..
..##############..
..##############..
...##.##...##.##..
...##.##...##.##..
..................
"""


def cells() -> list[str]:
    rows = [r for r in GRID.strip("\n").split("\n") if r.strip()]
    w = max(len(r) for r in rows)
    return [r.ljust(w, ".") for r in rows]


def render(size: int, ink: tuple[int, int, int], bg: tuple[int, int, int] | None) -> Image.Image:
    rows = cells()
    h, w = len(rows), len(rows[0])
    # Draw at 1 pixel per cell, then scale with NEAREST. Any other resampling softens the edges, which
    # is the one thing pixel art cannot survive.
    small = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = small.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = (*ink, 255)
    scale = max(1, size // max(w, h))
    out = small.resize((w * scale, h * scale), Image.NEAREST)
    if bg is not None:
        flat = Image.new("RGB", out.size, bg)
        flat.paste(out, (0, 0), out)
        return flat.convert("RGBA")
    return out


def hexcol(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/mascot.png")
    ap.add_argument("--size", type=int, default=2400, help="uzun kenar, piksel")
    ap.add_argument("--ink", default="E89B72", help="yaratigin rengi, hex")
    ap.add_argument("--bg", default="", help="bos birakilirsa saydam")
    a = ap.parse_args()

    im = render(a.size, hexcol(a.ink), hexcol(a.bg) if a.bg else None)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out)
    rows = cells()
    print(f"{len(rows[0])}x{len(rows)} hucre -> {im.width}x{im.height} px -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
