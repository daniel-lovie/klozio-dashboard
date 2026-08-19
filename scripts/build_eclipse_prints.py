#!/usr/bin/env python3
"""Compose the August 27, 2026 lunar eclipse collection into print files.

Everything here is drawn from `eclipse_art` primitives and type set in vendored OFL faces. Nothing is
generated, for the reasons in that module: the brief demands ONE moon shared across the family, an exact
96% coverage claim, and DTF rules that a diffusion model breaks by construction.

Three designs need a drawn subject rather than geometry — the leaping sturgeon, the howling dog and the
celestial frame. Those come in as SILHOUETTES from `eclipse_silhouettes.py`, thresholded to solid black
before they are allowed near a print file, so they inherit the same no-soft-alpha guarantee.

Sizes are the shop's, not the brief's: the producer prints 10 inches, so the file is cropped to its
bounding box and the listing carries `print_inches`, exactly like every other design here.

    python3 scripts/build_eclipse_prints.py --only eclipse-commemorative-classic --preview
    python3 scripts/build_eclipse_prints.py --apply
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import eclipse_art as ea                                            # noqa: E402
import typeset                                                     # noqa: E402

W, H = ea.W, ea.H
CX = W // 2
GEO = HERE.parent / "assets" / "geo" / "us-states.json"
SIL_DIR = HERE.parent / "assets" / "silhouettes"

DATE_LONG = "AUGUST 27, 2026"
DATE_SHORT = "8.27.26"

# The glow rings stand off the moon by `RING_N * RING_STEP * 1.7` of its diameter, so the type above and
# below has to clear exactly that much or a ring is struck through a headline — which is what the first
# pass did to both of them. Derived, not eyeballed, so changing the rings cannot silently break the type.
RING_N, RING_STEP = 2, 0.035
RING_CLEAR = int(ea.W * 0.54 * RING_STEP * RING_N * 1.7) + 110


# ── state silhouettes ────────────────────────────────────────────────────────────────────────────
def state_mask(name: str, box: int) -> Image.Image:
    """Raster a state outline as an "L" mask, fitted to `box`, drawn from Census boundary geometry.

    Only the outline. A state's seal or flag is a protected mark; its shape is a geographic fact.
    """
    feats = json.loads(GEO.read_text())["features"]
    f = next(x for x in feats if x["properties"]["name"].lower() == name.lower())
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = [r for p in polys for r in p]

    xs = [pt[0] for r in rings for pt in r]
    ys = [pt[1] for r in rings for pt in r]
    lon0, lon1, lat0, lat1 = min(xs), max(xs), min(ys), max(ys)
    # Cylindrical-equal-area-ish correction: without the cos(lat) factor every state looks stretched.
    kx = math.cos(math.radians((lat0 + lat1) / 2))
    ww, hh = (lon1 - lon0) * kx, (lat1 - lat0)
    scale = box / max(ww, hh)

    ss = 4
    im = Image.new("L", (box * ss, box * ss), 0)
    d = ImageDraw.Draw(im)
    ox = (box - ww * scale) / 2
    oy = (box - hh * scale) / 2
    for r in rings:
        pts = [(((x - lon0) * kx * scale + ox) * ss,
                ((lat1 - y) * scale + oy) * ss) for x, y in r]
        if len(pts) > 2:
            d.polygon(pts, fill=255)
    return im.resize((box, box), Image.LANCZOS)


def silhouette(name: str, box: int) -> Image.Image | None:
    """Load a pre-cut silhouette as an "L" mask. Hard-thresholded: a silhouette has no soft edge."""
    p = SIL_DIR / f"{name}.png"
    if not p.exists():
        return None
    im = Image.open(p).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v > 140 else 0)
    bb = a.getbbox()
    if bb:
        a = a.crop(bb)
    a.thumbnail((box, box), Image.LANCZOS)
    return a.point(lambda v: 255 if v > 140 else 0)


def paste_mask(im: Image.Image, mask: Image.Image, xy, col) -> None:
    layer = Image.new("RGBA", mask.size, (*col, 255))
    im.paste(layer, xy, mask)


# Diagnostics a design wants to report to the builder. The design functions return only an image, and
# threading a second return value through sixteen builders to carry one number is not worth it.
LAST_DIAG: dict = {}


def _arc_clearance(cy: float, radius: float, spread_deg: float,
                   mcx: float, mcy: float, mr: float) -> float:
    """Smallest gap between the arc's baseline and the moon's edge, in pixels. Negative means overlap.

    Sampled along the same path `typeset.draw_arc` walks, so it measures the type that is actually set
    rather than an idealised curve.
    """
    worst = float("inf")
    steps = 48
    for i in range(steps + 1):
        a = math.radians(-spread_deg / 2 + spread_deg * i / steps)
        x = CX + radius * math.sin(a)
        y = cy - radius * math.cos(a)
        worst = min(worst, math.hypot(x - mcx, y - mcy) - mr)
    return worst


# ── the designs ──────────────────────────────────────────────────────────────────────────────────
def d_commemorative(state: str | None = None) -> Image.Image:
    """#1 flagship, and #2 the state series — the same composition, which is the point of the family."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    top = 170

    if state:
        # The arc sits above the moon, so its radius is measured from a centre BELOW the text, not from
        # the moon's own centre — an arc struck through the artwork is what the first pass produced.
        # The sweep is set from the character count, not fixed: a fixed 76° packed "CALIFORNIA • BLOOD
        # MOON • 8.27.26" into the same arc as a short state name and the glyphs collided.
        head = f"{state.upper()} • BLOOD MOON • {DATE_SHORT}"
        f, w, b = ea.fit(head, "condensed", int(W * 0.70), 120, track=0.06)
        arc_cy, arc_r = top + 1060, 1060
        arc_spread = min(104, 5.2 * len(head))
        typeset.draw_arc(im, head, f, (*ea.CREAM, 255), CX, arc_cy, arc_r, spread_deg=arc_spread)
        top += 430
    else:
        top = ea.line(im, "TOTAL-ISH LUNAR ECLIPSE", "condensed", CX, top,
                      int(W * 0.74), 130, ea.CREAM, track=0.30) + RING_CLEAR

    # A state version gives the moon less of the frame, because the state is what the buyer is searching
    # for. At the flagship's 0.54 the disc sat on Texas like a lid and left only the panhandle and the
    # southern tip showing — which is not a state anyone recognises. The moon moves up and right instead,
    # so the outline reads whole and the two shapes overlap rather than one erasing the other.
    md = int(W * (0.34 if state else 0.54))
    if state:
        # The state has to read as THAT state or the design has no reason to exist: drawn big, given a
        # cream edge that separates it from a black shirt, and NOT wrapped in the glow rings — the rings
        # cut across the outline and turned every state into an unrecognisable blob.
        sm = state_mask(state, int(W * 0.60))
        sx, sy = CX - sm.width // 2, top
        rim = ea.outline_for_black(sm, 15, ea.CREAM)
        im.paste(rim, (sx, sy), rim)
        paste_mask(im, sm, (sx, sy), ea.RUST)
        mx, my = CX + int(W * 0.09) - md // 2, sy - int(md * 0.16)
        block_bottom = max(sy + sm.height, my + md)
        # The arc's far end runs down the right side, straight into where the moon sits. Checked rather
        # than eyeballed: at the old size "8.27.26" was buried behind the disc, and nothing in the build
        # said so. Clearance is measured against the moon circle and reported when it fails.
        LAST_DIAG["arc_clear"] = _arc_clearance(arc_cy, arc_r, arc_spread,
                                                mx + md / 2, my + md / 2, md / 2)
    else:
        mx, my = CX - md // 2, top
        block_bottom = my + md
        # Stepped rings for the glow — solid strokes, never an alpha halo. Kept INSIDE the type above
        # and below: the first pass drew them at 1.7× the moon and they ran through both headlines.
        glow = ea.ring_glow(md * 2, md, md, md // 2, rings=RING_N, col=ea.COPPER,
                            step=int(md * RING_STEP))
        im.paste(glow, (CX - md, my + md // 2 - md), glow)

    moon = ea.blood_moon(md)
    im.paste(moon, (mx, my), moon)
    # Measured from whichever of the two shapes reaches lowest — with the state now taller than the
    # moon, clearing only the disc would have run the headline through Florida's panhandle.
    y = block_bottom + (200 if state else RING_CLEAR)

    y = ea.line(im, "BLOOD MOON", "condensed", CX, y, int(W * 0.88), 400, ea.ORANGE, track=0.02) + 70
    ea.rule(im, CX, y, int(W * 0.58))
    y += 80
    y = ea.line(im, DATE_LONG, "condensed", CX, y, int(W * 0.62), 120, ea.CREAM, track=0.22) + 130

    strip = ea.phase_strip(int(W * 0.76))
    im.paste(strip, (CX - strip.width // 2, y), strip)
    return im


def d_eclipse_crew(kid: bool = False) -> Image.Image:
    """#3 — the family/group set. Athletic arc, solid star dots."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    field = ea.stars(W, H, 46, seed=331, avoid=(CX, 1750, int(W * 0.36)))
    im.alpha_composite(field)

    head = "MY FIRST" if kid else "ECLIPSE CREW"
    # Arc sweep scaled to the character count, and type sized so the glyphs do not touch — "ECLIPSE CREW"
    # at a fixed 64° ran its letters into each other.
    f, w, b = ea.fit(head, "condensed", int(W * 0.80), 250, track=0.04)
    typeset.draw_arc(im, head, f, (*ea.CREAM, 255), CX, 1420, 1140, spread_deg=min(96, 7.4 * len(head)))

    # The block is laid out from the BOTTOM of the canvas upward, so the closing lines cannot run off it.
    # Both of these previously lost their last line to the canvas edge.
    md = int(W * 0.52)
    my = 1280
    moon = ea.blood_moon(md, seed=99 if kid else 827, craters=not kid)
    im.paste(moon, (CX - md // 2, my), moon)

    y = my + md + 120
    y = ea.line(im, "ECLIPSE" if kid else "2026", "condensed", CX, y,
                int(W * 0.72), 280, ea.ORANGE, track=0.06) + 110
    ea.line(im, DATE_LONG, "condensed", CX, y, int(W * 0.56), 110, ea.CREAM, track=0.20)
    return im


def d_almost_totality() -> Image.Image:
    """#4 — the humour piece that only works for THIS eclipse."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = ea.line(im, "96% TOTAL.", "condensed", CX, 210, int(W * 0.86), 380, ea.CREAM, track=0.02)
    y = ea.line(im, "100% WORTH IT.", "condensed", CX, y + 40, int(W * 0.86), 380, ea.ORANGE, track=0.02)

    md = int(W * 0.62)
    my = y + 190
    moon = ea.blood_moon(md)
    im.paste(moon, (CX - md // 2, my), moon)

    # The arrow pointing at the sliver. Solid bars and a filled head — no thin leader lines.
    #
    # The label sits ABOVE the arrow's tail rather than to its left. Hung off the left it ran past the
    # canvas edge and shipped as "he 4%" — the joke depends on the label, so it is placed where the
    # width is bounded by the canvas instead of by whatever the type happened to measure.
    d = ImageDraw.Draw(im)
    tipx, tipy = CX - int(md * 0.20), my + int(md * 0.045)
    # The tail hangs BELOW the moon's top edge, to the left. Placed above it the label landed inside
    # "100% WORTH IT." — the arrow needs its own air, not the headline's.
    ex, ey = CX - int(md * 0.66), my + int(md * 0.40)
    # Weight set against the headline beside it, not against the stroke floor. At 16 px the leader read
    # as a scratch on the shirt next to 300 px type, and the head was too small to see at all.
    d.line([(ex, ey), (tipx, tipy)], fill=(*ea.CREAM, 255), width=34)
    ang = math.atan2(tipy - ey, tipx - ex)
    hl = 128
    d.polygon([(tipx, tipy),
               (tipx - hl * math.cos(ang - 0.42), tipy - hl * math.sin(ang - 0.42)),
               (tipx - hl * math.cos(ang + 0.42), tipy - hl * math.sin(ang + 0.42))],
              fill=(*ea.CREAM, 255))
    f, w, b = ea.fit("the 4%", "display", int(W * 0.34), 130)
    lx = min(max(ex - w // 2, 20), W - w - 20)
    d.text((lx, ey + 55 - b[1]), "the 4%", font=f, fill=(*ea.SILVER, 255))

    ea.line(im, "LUNAR ECLIPSE • " + DATE_SHORT, "condensed", CX, my + md + 110,
            int(W * 0.60), 110, ea.CREAM, track=0.20)
    return im


def d_stayed_up() -> Image.Image:
    """#5 — typography-led, dry. Negative space is the design, so the moon stays small."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    md = int(W * 0.30)
    im.paste(ea.blood_moon(md), (CX - md // 2, 300), ea.blood_moon(md))
    zz = ea.stars(W, 620, 12, seed=77, rmin=7, rmax=13, avoid=(CX, 300 + md // 2, md))
    im.alpha_composite(zz, (0, 240))

    # The lines are set to the full measure. Dry humour wants air around the block, not small type: the
    # first pass left 200 px of unused canvas on both sides and the file landed at 280 PPI.
    y = 300 + md + 230
    for part, col in (("I STAYED UP", ea.CREAM), ("PAST MIDNIGHT", ea.CREAM),
                      ("TO WATCH", ea.CREAM), ("A SHADOW", ea.ORANGE)):
        y = ea.line(im, part, "condensed", CX, y, int(W * 0.96), 340, col, track=0.02) + 46

    y += 80
    ea.rule(im, CX, y, int(W * 0.38), ea.COPPER)
    y += 80
    ea.line(im, "Lunar Eclipse • Aug 27–28, 2026 • Worth It.", "display", CX, y,
            int(W * 0.92), 115, ea.SILVER)
    return im


def d_sturgeon() -> Image.Image:
    """#6 — retro fishing tee. Distress is built from solid halftone, never from transparency."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = ea.line(im, "STURGEON", "slab", CX, 200, int(W * 0.90), 420, ea.CREAM)
    y = ea.line(im, "MOON RISING", "slab", CX, y + 30, int(W * 0.90), 300, ea.ORANGE)

    md = int(W * 0.70)
    my = y + 150
    moon = ea.blood_moon(md)
    im.paste(moon, (CX - md // 2, my), moon)

    fish = silhouette("sturgeon", int(md * 1.06))
    if fish is not None:
        # Cream body, rust edge. Measured: a rust silhouette on this moon is 1.00–2.43 contrast — it
        # vanished into the copper. Cream never drops below 2.8 on any band and the rust rim separates
        # it on the brightest one, so the fish reads wherever it crosses the disc.
        fx, fy = CX - fish.width // 2, my + md // 2 - fish.height // 2
        rim = ea.outline_for_black(fish, 13, ea.RUST)
        im.paste(rim, (fx, fy), rim)
        paste_mask(im, fish, (fx, fy), ea.CREAM)

    # Water: solid stepped bars, decreasing length. A "ripple" made of fading lines is an alpha ramp.
    d = ImageDraw.Draw(im)
    wy = my + md + 60
    for i, frac in enumerate((0.78, 0.62, 0.46, 0.30)):
        t = max(ea.MIN_STROKE, 26 - i * 4)
        d.rectangle([CX - int(W * frac / 2), wy, CX + int(W * frac / 2), wy + t], fill=(*ea.COPPER, 255))
        wy += t + 34

    ea.line(im, DATE_LONG, "slab", CX, wy + 40, int(W * 0.58), 120, ea.CREAM)
    return im


def d_dog_howl() -> Image.Image:
    """#7 — warm, giftable. A generic mixed-breed silhouette; no recognisable breed logo."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = ea.line(im, "MY DOG HOWLED", "condensed", CX, 200, int(W * 0.90), 330, ea.CREAM, track=0.02)
    y = ea.line(im, "AT THE BLOOD MOON", "condensed", CX, y + 30, int(W * 0.94), 280, ea.ORANGE, track=0.02)

    md = int(W * 0.66)
    my = y + 170
    im.alpha_composite(ea.stars(W, md, 20, seed=613, avoid=(CX, md // 2, md // 2 + 40)), (0, my))
    moon = ea.blood_moon(md)
    im.paste(moon, (CX - md // 2, my), moon)

    dog = silhouette("dog-howl", int(md * 0.80))
    if dog is not None:
        # Same contrast finding as the sturgeon: cream body, rust edge, so the dog reads on every band
        # of the moon and on the black shirt below it.
        dx, dy = CX - dog.width // 2, my + md - dog.height + int(md * 0.10)
        rim = ea.outline_for_black(dog, 13, ea.RUST)
        im.paste(rim, (dx, dy), rim)
        paste_mask(im, dog, (dx, dy), ea.CREAM)

    # Cleared below the dog's paws, which hang past the moon by design — the date used to run through
    # its front legs.
    ea.line(im, "LUNAR ECLIPSE • " + DATE_LONG, "condensed", CX, my + md + int(md * 0.10) + 150,
            int(W * 0.74), 110, ea.CREAM, track=0.18)
    return im


def d_team_umbra() -> Image.Image:
    """#8 — the diagram. Single line weight, at the floor, so it reads as drafting rather than doodle."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = ea.line(im, "TEAM UMBRA", "condensed", CX, 210, int(W * 0.86), 380, ea.ORANGE, track=0.04)
    y += 180

    lw = ea.MIN_STROKE + 2
    # The diagram is drawn edge to edge. Sized to the canvas rather than to a comfortable-looking box:
    # the file's long side sets its print resolution, and a composition floating in the middle of the
    # canvas came out at 242 PPI — under the shop's floor purely because it was drawn small.
    sun_x, earth_x, moon_x = int(W * 0.06), int(W * 0.42), int(W * 0.88)
    axis = y + 760

    # Sun: an arc at the left edge with solid rays.
    d.arc([sun_x - 520, axis - 520, sun_x + 520, axis + 520], 300, 60, fill=(*ea.CREAM, 255), width=lw)
    for a in range(-55, 56, 22):
        ar = math.radians(a)
        d.line([(sun_x + 535 * math.cos(ar), axis + 535 * math.sin(ar)),
                (sun_x + 690 * math.cos(ar), axis + 690 * math.sin(ar))],
               fill=(*ea.CREAM, 255), width=lw)

    er = 215
    d.ellipse([earth_x - er, axis - er, earth_x + er, axis + er], outline=(*ea.CREAM, 255), width=lw)

    # Umbra and penumbra cones, drawn as open outlines so the shirt colour shows through.
    tip = W - int(W * 0.02)
    for dy_ in (er, -er):
        d.line([(earth_x, axis + dy_), (tip, axis + dy_ * 0.10)], fill=(*ea.COPPER, 255), width=lw)
        d.line([(earth_x, axis + dy_), (tip, axis + dy_ * 2.2)], fill=(*ea.SILVER, 255), width=lw)

    mr = 150
    mm = ea.blood_moon(mr * 2)
    im.paste(mm, (moon_x - mr, axis - mr), mm)

    for label, x, col in (("SUN", sun_x + 250, ea.CREAM), ("EARTH", earth_x, ea.CREAM),
                          ("MOON", moon_x, ea.ORANGE)):
        f, w, b = ea.fit(label, "condensed", 460, 90, track=0.24)
        typeset.draw_tracked(d, (x - w // 2, axis + 830 - b[1]), label, f, (*col, 255), 0.24)

    # The cone labels get leader dots down to clear air below the diagram. Set inside the cones they
    # were struck through by the very lines they name, and copper-on-black at that size did not read.
    for label, ry, col in (("UMBRA", axis + 330, ea.COPPER), ("PENUMBRA", axis + 560, ea.SILVER)):
        f, w, b = ea.fit(label, "condensed", 640, 86, track=0.24)
        lx = int(W * 0.30) - w // 2
        d.rectangle([lx - 40, ry - b[1] - 26, lx + w + 40, ry + (b[3] - b[1]) + 22], fill=(0, 0, 0, 0))
        typeset.draw_tracked(d, (lx, ry - b[1]), label, f, (*col, 255), 0.24)
        d.rectangle([lx + w + 70, ry + (b[3] - b[1]) // 2 - ea.MIN_STROKE // 2,
                     lx + w + 190, ry + (b[3] - b[1]) // 2 + ea.MIN_STROKE // 2], fill=(*col, 255))

    ea.line(im, "LUNAR ECLIPSE • " + DATE_LONG, "condensed", CX, axis + 1030,
            int(W * 0.78), 110, ea.CREAM, track=0.18)
    return im


def d_sorry_blood_moon() -> Image.Image:
    """#9 — witchy / dark academia. Ornate frame drawn from solid strokes and phase discs."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # Phase arc across the top: the ornament is the moon's own cycle, which keeps it on-subject.
    n, r = 7, 92
    span = int(W * 0.78)
    for i in range(n):
        x = CX - span // 2 + int(span * i / (n - 1))
        yy = 380 - int(math.cos(math.pi * i / (n - 1)) * 150)
        if i == n // 2:
            bm = ea.blood_moon(r * 2, craters=False)
            im.paste(bm, (x - r, yy - r), bm)
        else:
            d.ellipse([x - r, yy - r, x + r, yy + r], outline=(*ea.CREAM, 255), width=ea.MIN_STROKE + 2)
            frac = abs(i - (n - 1) / 2) / ((n - 1) / 2)
            cw = int(r * (1 - frac))
            if cw > ea.MIN_STROKE:
                d.ellipse([x - cw, yy - r, x + cw, yy + r], fill=(*ea.CREAM, 255))

    y = 700
    for part, role, col, cap in (("SORRY FOR", "display", ea.CREAM, 300),
                                 ("WHAT I SAID", "display", ea.CREAM, 300),
                                 ("DURING THE", "display", ea.SILVER, 210),
                                 ("BLOOD MOON", "display", ea.ORANGE, 360)):
        y = ea.line(im, part, role, CX, y, int(W * 0.88), cap, col) + 46

    y += 60
    ea.rule(im, CX, y, int(W * 0.46), ea.COPPER)

    # Botanical flourish: solid tapering leaves, mirrored. Built from filled shapes, not hairlines.
    y += 120
    for side in (-1, 1):
        for k in range(5):
            t = k / 4
            lx = CX + side * int(140 + t * 430)
            ly = y + int(math.sin(t * math.pi) * -120)
            ln = int(150 - t * 60)
            d.polygon([(lx, ly - ln // 2), (lx + side * 46, ly), (lx, ly + ln // 2),
                       (lx - side * 24, ly)], fill=(*ea.COPPER, 255))
    d.ellipse([CX - 34, y - 34, CX + 34, y + 34], fill=(*ea.ORANGE, 255))

    im.alpha_composite(ea.stars(W, 420, 16, seed=909, rmin=7, rmax=14, col=ea.SILVER), (0, y + 170))
    return im


def d_moon_phases(light: bool = False) -> Image.Image:
    """#10 — evergreen celestial. No date, so it sells all year; the only design with a light variant."""
    ink = ea.NIGHT if light else ea.CREAM
    accent = ea.COPPER if light else ea.ORANGE
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    n, r = 8, 155
    top = 420
    gap = 118
    for i in range(n):
        yy = top + i * (r * 2 + gap)
        if i == 4:
            bm = ea.blood_moon(r * 2)
            im.paste(bm, (CX - r, yy - r), bm)
            continue
        d.ellipse([CX - r, yy - r, CX + r, yy + r], outline=(*ink, 255), width=ea.MIN_STROKE + 3)
        frac = 1 - abs(i - 3.5) / 3.5
        cw = int(r * frac)
        if cw > ea.MIN_STROKE:
            d.ellipse([CX - cw, yy - r, CX + cw, yy + r], fill=(*ink, 255))

    im.alpha_composite(ea.stars(W, H, 34, seed=1010, rmin=6, rmax=15,
                                avoid=(CX, H // 2, int(W * 0.24)), col=ink))
    f, w, b = ea.fit("la luna", "display", int(W * 0.42), 190)
    d.text((CX - w // 2, top + n * (r * 2 + gap) - 40 - b[1]), "la luna", font=f, fill=(*accent, 255))
    return im


DESIGNS = {
    # slug                                 builder                              inches  hero
    "eclipse-commemorative-classic":      (lambda: d_commemorative(), 10.0, "Black"),
    "eclipse-texas":                      (lambda: d_commemorative("Texas"), 10.0, "Black"),
    "eclipse-ohio":                       (lambda: d_commemorative("Ohio"), 10.0, "Black"),
    "eclipse-california":                 (lambda: d_commemorative("California"), 10.0, "Black"),
    "eclipse-florida":                    (lambda: d_commemorative("Florida"), 10.0, "Black"),
    "eclipse-new-york":                   (lambda: d_commemorative("New York"), 10.0, "Black"),
    "eclipse-crew":                       (lambda: d_eclipse_crew(), 10.0, "Black"),
    "eclipse-my-first":                   (lambda: d_eclipse_crew(kid=True), 9.0, "Black"),
    "eclipse-almost-totality":            (d_almost_totality, 10.0, "Black"),
    "eclipse-stayed-up":                  (d_stayed_up, 10.0, "Black"),
    "eclipse-sturgeon-moon":              (d_sturgeon, 10.0, "Black"),
    "eclipse-dog-howl":                   (d_dog_howl, 10.0, "Black"),
    "eclipse-team-umbra":                 (d_team_umbra, 10.0, "Black"),
    "eclipse-sorry-blood-moon":           (d_sorry_blood_moon, 10.0, "Black"),
    "eclipse-moon-phases":                (lambda: d_moon_phases(), 10.0, "Black"),
    "eclipse-moon-phases-light":          (lambda: d_moon_phases(light=True), 10.0, "White"),
}


FLOOR_PPI = 300


# Half a glyph tile plus air. Below this the arc's type touches the moon even though its baseline does
# not — which is exactly how "8.27.26" ended up behind the disc on all five state designs.
ARC_MIN_CLEAR = 130


def build(slug: str) -> tuple[Image.Image, dict]:
    fn, inches, _hero = DESIGNS[slug]
    LAST_DIAG.clear()
    art = fn()

    # PIL discards anything drawn past the canvas without raising, so a layout that overflows loses its
    # last line and still reports success. That is how the state series shipped without its phase strip
    # and the evergreen design without "la luna". Artwork touching an edge is the signature; catch it.
    bb = art.getbbox()
    touching = [n for n, hit in (("ust", bb[1] <= 0), ("sol", bb[0] <= 0),
                                 ("sag", bb[2] >= W), ("alt", bb[3] >= H)) if hit]
    art = art.crop(bb)
    ea.assert_palette(art)
    rep = ea.alpha_report(art)
    rep["clipped"] = touching
    rep["arc_clear"] = LAST_DIAG.get("arc_clear")

    # The print is sized to what the file actually carries. A design whose composition does not fill the
    # canvas is printed a little smaller rather than upscaled: resampling a flat-colour graphic to reach
    # a number invents no detail, it only softens the hard edges DTF depends on. So the inches give way,
    # never the resolution — and the shrink is reported, because a 9.3" chest print is a real change.
    want = inches
    inches = min(inches, max(art.size) / FLOOR_PPI)
    rep.update(w=art.width, h=art.height, inches=inches, requested_inches=want,
               ppi=max(art.size) / inches, shrunk=inches < want - 0.05)
    return art, rep


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", help="tek slug")
    ap.add_argument("--preview", help="onizleme klasoru")
    a = ap.parse_args()

    slugs = [a.only] if a.only else list(DESIGNS)
    bad = [s for s in slugs if s not in DESIGNS]
    if bad:
        print(f"bilinmeyen slug: {bad}", file=sys.stderr)
        return 1

    c = k = None
    if a.apply:
        c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
        k = c.cursor()

    for slug in slugs:
        art, rep = build(slug)
        ok = rep["ppi"] >= FLOOR_PPI - 1 and rep["mid_alpha_frac"] < 0.02 and not rep["clipped"]
        note = f"  (istenen {rep['requested_inches']:g}in kucultuldu)" if rep["shrunk"] else ""
        if rep["clipped"]:
            note += f"  TUVAL KENARINA DEGIYOR: {','.join(rep['clipped'])} — icerik kesilmis olabilir"
        ac = rep["arc_clear"]
        if ac is not None:
            note += f"  yay-ay bosluk {ac:.0f}px"
            if ac < ARC_MIN_CLEAR:
                ok = False
                note += f" — YETERSIZ (en az {ARC_MIN_CLEAR})"
        print(f"{slug:32} {rep['w']}x{rep['h']}px  {rep['inches']:.1f}in -> {rep['ppi']:.0f} PPI  "
              f"yari-saydam %{rep['mid_alpha_frac']*100:.2f}  {'OK' if ok else 'BAK'}{note}")

        if a.preview:
            out = Path(a.preview)
            out.mkdir(parents=True, exist_ok=True)
            ground = (17, 17, 17, 255) if "light" not in slug else (243, 240, 232, 255)
            Image.alpha_composite(Image.new("RGBA", art.size, ground), art).convert("RGB").save(
                out / f"{slug}.jpg", quality=92)

        if a.apply:
            buf = io.BytesIO()
            art.save(buf, format="PNG", dpi=(300, 300))
            k.execute("""UPDATE products SET print_file=%s, print_file_name=%s, print_file_w=%s,
                                print_file_h=%s, print_dpi=%s, design_model='eclipse_art+typeset',
                                design_state=NULL, updated_at=now()
                          WHERE slug=%s""",
                      (psycopg2.Binary(buf.getvalue()), f"{slug}-dark.png", art.width, art.height,
                       round(rep["ppi"]), slug))
            if k.rowcount == 0:
                print(f"  UYARI: {slug} veritabaninda yok, once seed_eclipse.py calistir", file=sys.stderr)

    if a.apply:
        c.commit()
        c.close()
        print(f"\n{len(slugs)} baski dosyasi yazildi.")
    else:
        print("\nDRY RUN. Yazmak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
