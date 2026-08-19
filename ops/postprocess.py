#!/usr/bin/env python3
"""Turn a generated image into a print file this shop will actually accept.

The source spec set the target as "4500x5400 px, passes Printify validation". Neither applies here:
there is no POD platform in the Etsy path — a manual partner prints the file — and the real gate is
the one the rest of this codebase already enforces.

  EFFECTIVE PPI IS MEASURED ON THE ARTWORK, NOT THE CANVAS. `getbbox()` first. Measuring the canvas
  is a bug this repo shipped once and it passed 95 files that were not fine.

  4500x5400 IS A CEILING. The producer prints ten inches; a file larger than that is not more
  resolution, it is a bigger number in a database.

  FLATNESS IS THE DTF GATE. Partly-transparent pixels are what a transfer cannot lay down. The drawn
  files here run 0.02-0.48%, which is edge antialiasing. A generated one after background removal is
  the risk, so it is measured and reported rather than hoped for.

    python3 ~/factory/postprocess.py in.png out.png
"""
from __future__ import annotations

import io, sys
from pathlib import Path

from PIL import Image

PRINT_INCHES = 10.0
FLOOR_PPI = 300
MAX_MID_ALPHA = 0.02


def upscale(im: Image.Image, factor: int = 4) -> Image.Image:
    # LANCZOS rather than the ESRGAN node: for the flat, hard-edged art this shop prints, a learned
    # upscaler invents texture that then has to be flattened back out. If a future design needs
    # photographic detail this is the line to revisit.
    return im.resize((im.width * factor, im.height * factor), Image.LANCZOS)


def cut_background(im: Image.Image) -> Image.Image:
    from rembg import remove
    out = remove(im)
    # rembg leaves a soft matte. DTF cannot print a 40%-opaque pixel, so alpha is driven to two
    # values with a narrow ramp kept only at the very edge for antialiasing.
    a = out.getchannel("A").point(lambda v: 0 if v < 96 else (255 if v > 168 else v))
    out.putalpha(a)
    return out


def report(im: Image.Image) -> dict:
    bb = im.getbbox() or (0, 0, im.width, im.height)
    art = im.crop(bb)
    long_px = max(art.size)
    hist = art.getchannel("A").histogram()
    mid = sum(hist[8:248]) / max(sum(hist), 1)
    return {"w": art.width, "h": art.height, "ppi": long_px / PRINT_INCHES, "mid_alpha": mid}


def main() -> int:
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    im = Image.open(src).convert("RGBA")
    im = cut_background(im)
    im = upscale(im)
    im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
    r = report(im)
    im.save(dst, format="PNG", dpi=(300, 300))
    ok = r["ppi"] >= FLOOR_PPI and r["mid_alpha"] < MAX_MID_ALPHA
    print(f"{dst.name}: {r[chr(119)]}x{r[chr(104)]}px  {r[chr(112)+chr(112)+chr(105)]:.0f} PPI  "
          f"yari-saydam %{r[chr(109)+chr(105)+chr(100)+chr(95)+chr(97)+chr(108)+chr(112)+chr(104)+chr(97)]*100:.2f}  "
          f"{chr(71)+chr(69)+chr(67)+chr(84)+chr(73) if ok else chr(75)+chr(65)+chr(76)+chr(68)+chr(73)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
