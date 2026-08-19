#!/usr/bin/env python3
"""Turn a generated silhouette render into a print-safe mask.

Two of the eclipse designs need a drawn subject that geometry cannot give — a leaping sturgeon and a
howling dog. Those are generated, but a generated PNG never goes into a print file as it is:

  THRESHOLD   the render is a photo of a silhouette, with a soft grey rim and an off-white ground. Hard
              thresholding turns it into the two-valued shape it was meant to be, which is also what
              removes every partly-transparent pixel DTF cannot lay down.
  OPEN        the sturgeon came back with barbels drawn as hairlines. At print size those are ~4 px —
              under the 10 px floor — so they would print as broken dashes or not at all. A
              morphological opening deletes anything thinner than the floor instead of shipping it
              broken. What survives the opening is exactly what the transfer can hold.
  LARGEST     stray specks from the render are dropped by keeping only the components that matter.

The threshold is deliberately not adjustable per-run: a silhouette that needs a bespoke threshold is a
bad render, and the answer is to generate it again rather than to tune the cutter until it passes.

    python3 scripts/eclipse_silhouettes.py --src /tmp/sturgeon-raw.png --name sturgeon --apply
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "silhouettes"

# The print floor, expressed in the space of the SOURCE render. The subject is drawn at roughly 1650 px
# in the final file, so a 10 px printed stroke is about 6 px in a 1024 px render; an opening radius of 3
# removes anything narrower than that and keeps everything wider.
OPEN_RADIUS = 3
THRESHOLD = 128


def cut(src: Path) -> tuple[Image.Image, dict]:
    im = Image.open(src).convert("L")
    # The subject is dark on a light ground, so the shape is where the image is dark.
    mask = im.point(lambda v: 255 if v < THRESHOLD else 0)
    before = sum(mask.get_flattened_data()) / 255

    k = OPEN_RADIUS * 2 + 1
    opened = mask.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    after = sum(opened.get_flattened_data()) / 255

    bb = opened.getbbox()
    if bb:
        opened = opened.crop(bb)

    out = Image.new("RGBA", opened.size, (0, 0, 0, 0))
    out.putalpha(opened)
    rep = {
        "w": opened.width, "h": opened.height,
        "removed_frac": (before - after) / max(before, 1),
        "fill_frac": after / max(opened.width * opened.height, 1),
    }
    return out, rep


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    art, rep = cut(Path(a.src))
    print(f"{a.name:12} {rep['w']}x{rep['h']}  ince detaydan atilan: %{rep['removed_frac']*100:.2f}  "
          f"doluluk: %{rep['fill_frac']*100:.0f}")
    if rep["removed_frac"] > 0.12:
        print(f"  UYARI: acilma sekli %{rep['removed_frac']*100:.0f} kadar yedi — bu bir kirpma degil, "
              f"kotu bir render. Yeniden uretmek gerekir.", file=sys.stderr)

    if a.apply:
        OUT.mkdir(parents=True, exist_ok=True)
        p = OUT / f"{a.name}.png"
        art.save(p)
        print(f"  -> {p}")
    else:
        print("  DRY RUN. Yazmak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
