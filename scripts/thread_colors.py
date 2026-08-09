#!/usr/bin/env python3
"""Pick embroidery thread colors for a design PNG from Printful's allowed palette.

Maps every opaque pixel to its nearest allowed thread color, keeps colors covering
>=3% of the design (max 6 — embroidery machines carry limited threads), prints a
comma-separated hex list. Usage: thread_colors.py <design.png>

⚠️ Nearest-match is ADVISORY ONLY, never authoritative. "Nearest" is nearest in RGB, which is
not nearest to the eye: dusty blue lands on #6B5294 (purple) and muted gold on #A67843 (brown),
and the stitched garment then does not look like the photo. The batch runner therefore takes the
thread list from the concept spec and uses `coverage()` below only to cross-check it — see
batch_runner.py gate 2.
"""
import sys

import numpy as np
from PIL import Image

# Customzon's rack, not Printful's. Both run Madeira Polyneon, but they stock different cones —
# only 1800 black and 1801 white are common to the two — so a design snapped to the old palette
# names threads the new supplier does not have, and the digitiser substitutes whatever is closest.
from thread_palettes import CUSTOMZON

PALETTE_HEX = list(CUSTOMZON)
PALETTE = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PALETTE_HEX]
MAX_THREADS = 6
MIN_COVERAGE = 0.03


def nearest(rgb, palette=PALETTE):
    r, g, b = rgb
    return min(palette, key=lambda p: (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2)


def coverage(path, palette=PALETTE):
    """{'#RRGGBB': fraction of opaque pixels} after snapping each pixel to `palette`, most first.

    Vectorised because batch_runner.py calls this on every embroidery design as a QA gate; the
    per-pixel loop this replaced took seconds per 4k file.
    """
    im = Image.open(path).convert("RGBA")
    # NEAREST, not the default LANCZOS: a smoothing resample averages neighbouring pixels and so
    # invents colours that are in no thread and in no design — it turned a 0.7% black/gold border
    # into a 1.9% "tan brown element" and failed the gate on artwork that was clean.
    im.thumbnail((512, 512), Image.NEAREST)
    a = np.asarray(im).astype(np.int32)
    px = a[:, :, :3][a[:, :, 3] >= 128]
    if not px.size:
        return {}
    pal = np.array(palette, dtype=np.int32)
    idx = np.argmin(((px[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2), axis=1)
    counts = np.bincount(idx, minlength=len(pal))
    total = int(counts.sum()) or 1
    order = np.argsort(-counts)
    return {"#%02X%02X%02X" % tuple(pal[i]): int(counts[i]) / total
            for i in order if counts[i] > 0}


def pick(path):
    cov = coverage(path)
    picks = [h for h, f in cov.items() if f >= MIN_COVERAGE][:MAX_THREADS]
    return picks or list(cov)[:1]


if __name__ == "__main__":
    print(",".join(pick(sys.argv[1])))
