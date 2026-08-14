#!/usr/bin/env python3
"""Prove the cutout gates can actually fire.

Three of them could not. `leftover_key_px` was `(bg & keep).sum()` where `keep = erosion(~bg)` — disjoint
from `bg` by construction, so it returned 0 for every input that has ever existed. `edge_contact` sampled
the outer two rows of `keep`, which `binary_erosion` zeroes because it defaults to `border_value=0`. And
`size_in_at_300` measured the canvas, while the producer prints the bounding box, so the transparent
margin the prompt asks for was counted as resolution.

Each of those was guarded by a `raise` in produce_product.py, and each of those raises was unreachable.
The comment above one of them read "measured across 30 shipped files: 0 touch" — which was the artifact of
the bug, not evidence about the files.

A gate nobody can trip is not a gate, and a comment is not a test. This builds the defect on purpose and
asserts the number moves.

    python3 scripts/check_cutout_gates.py        # no database, no network, no cost
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402

KEY = tuple(int(br.KEY_COLOR[i:i + 2], 16) for i in (1, 3, 5))
failures = 0


def check(name: str, ok: bool, detail: object = "") -> None:
    global failures
    if ok:
        print(f"  ok   {name}")
        return
    failures += 1
    print(f"  FAIL {name} — {detail}", file=sys.stderr)


def cut(img: Image.Image) -> dict:
    with tempfile.TemporaryDirectory() as d:
        raw, out = Path(d) / "raw.png", Path(d) / "out.png"
        img.save(raw)
        return br.key_cutout(raw, out)[1]


def canvas(size: int = 900) -> Image.Image:
    return Image.new("RGB", (size, size), KEY)


print("leftover_key_px · key-coloured pixels INSIDE the artwork")
im = canvas()
d = ImageDraw.Draw(im)
d.ellipse([250, 250, 650, 650], fill=(30, 40, 60))
clean = cut(im)
check("a clean cut reports none", clean["leftover_key_px"] == 0, clean)

im2 = im.copy()
ImageDraw.Draw(im2).ellipse([400, 400, 500, 500], fill=KEY)      # a key-coloured blob in the middle
dirty = cut(im2)
# It does NOT come back as leftover ink: the blob matches the key, so it is cut away and leaves a HOLE.
# The first version of this fix counted key-coloured opaque pixels and reported 0 here — the right number
# for the wrong question. A hole is transparent; you have to look for the hole.
check("key colour inside the artwork punches a hole that is counted", dirty["holes_px"] > 200, dirty)
check("a clean cut has no enclosed holes", clean["holes_px"] == 0, clean)

drift = Image.new("RGB", (900, 900), tuple(min(255, c + 90) for c in KEY))   # matte drifted off key
ImageDraw.Draw(drift).ellipse([250, 250, 650, 650], fill=(30, 40, 60))
drifted = cut(drift)
check("a matte that drifted off the key is caught as ink", drifted["halo_frac"] > 0.2, drifted)

print("halo_frac · a blended glow survives the distance test and must not survive this one")
glow = Image.new("L", (900, 900), 0)
ImageDraw.Draw(glow).ellipse([250, 250, 650, 650], fill=255)
soft = glow.filter(ImageFilter.GaussianBlur(25))
base = Image.new("RGB", (900, 900), (30, 40, 60))
im3 = Image.composite(base, canvas(), soft)                       # ink fading into the matte
halo = cut(im3)
check("a soft glow is caught by hue", halo["halo_frac"] > 0.02, halo)
check("a hard-edged design is not", clean["halo_frac"] < 0.005, clean)

print("edge_contact · artwork running off the canvas")
im4 = canvas()
ImageDraw.Draw(im4).rectangle([0, 300, 899, 500], fill=(30, 40, 60))   # a band, edge to edge
cropped = cut(im4)
check("a band touching both edges is caught", cropped["edge_contact"] > 0.02, cropped)
check("a centred design is not", clean["edge_contact"] <= 0.02, clean)

im5 = Image.new("RGB", (900, 900), (30, 40, 60))                  # no background at all
allink = cut(im5)
check("a frame with no matte at all is caught", allink["edge_contact"] > 0.02, allink)

print("size_in_at_300 · the artwork, not the canvas")
small = canvas(3000)
ImageDraw.Draw(small).ellipse([650, 650, 2350, 2350], fill=(30, 40, 60))   # 1700px art on a 3000px canvas
rep = cut(small)
check("margin is not counted as resolution", rep["size_in_at_300"] < 6.0, rep)
check("art_px measures the bounding box", 1650 <= rep["art_px"] <= 1750, rep)

full = canvas(3000)
ImageDraw.Draw(full).ellipse([60, 60, 2940, 2940], fill=(30, 40, 60))
repf = cut(full)
check("a full-bleed design still reports ~10 inches", repf["size_in_at_300"] >= 9.0, repf)

print(f"\n{failures} check(s) failed" if failures else "\nall cutout gates fire")
sys.exit(1 if failures else 0)
