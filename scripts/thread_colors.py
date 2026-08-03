#!/usr/bin/env python3
"""Pick embroidery thread colors for a design PNG from Printful's allowed palette.

Maps every opaque pixel to its nearest allowed thread color, keeps colors covering
>=3% of the design (max 6 — embroidery machines carry limited threads), prints a
comma-separated hex list. Usage: thread_colors.py <design.png>
"""
import sys
from collections import Counter
from PIL import Image

PALETTE_HEX = ["#FFFFFF", "#000000", "#96A1A8", "#A67843", "#FFCC00", "#E25C27",
               "#CC3366", "#CC3333", "#660000", "#333366", "#005397", "#3399FF",
               "#6B5294", "#01784E", "#7BA35A"]
PALETTE = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) for h in PALETTE_HEX]

im = Image.open(sys.argv[1]).convert("RGBA")
im.thumbnail((512, 512))
counts = Counter()
for r, g, b, a in im.getdata():
    if a < 128:
        continue
    best = min(PALETTE, key=lambda p: (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2)
    counts[best] += 1

total = sum(counts.values()) or 1
picks = [c for c, n in counts.most_common() if n / total >= 0.03][:6]
if not picks:
    picks = [c for c, _ in counts.most_common(1)]
print(",".join("#%02X%02X%02X" % c for c in picks))
