#!/usr/bin/env python3
"""The blood-moon drawing system for the August 27, 2026 eclipse collection.

Why this is drawn and not generated
-----------------------------------
The brief asks for one specific moon — 96% covered, with a thin bright silver sliver at the limb — and
asks for it to be the SAME moon across the flagship, the state series and the crew tee, so the collection
reads as a family. A diffusion model returns a different moon every call, which is the one thing that
requirement rules out. It also cannot be told "96%" and be believed.

Every DTF rule in the brief points the same way:

  NO FADE TO TRANSPARENCY   a generated glow is a soft alpha ramp, which is exactly what DTF cannot
                            print. Here the glow is stepped rings and halftone dots — solid pixels only.
  MINIMUM STROKE            enforced in code (MIN_STROKE), not hoped for.
  SOLID SATURATED COLOUR    the palette is a fixed list; nothing else can enter the file.
  DARK-ON-BLACK             `outline_for_black` exists so no element is left invisible on the garment.

So the moon is geometry. The 96% is measured, not eyeballed: `eclipse_masks` binary-searches the umbra
offset until the lit area really is 4% of the disc.

Sizes follow OUR system, not the brief's: the producer prints 10 inches, so the working canvas is the
shop's own and the file is cropped to its bounding box like every other print here.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import typeset                                                     # noqa: E402

# ── palette ──────────────────────────────────────────────────────────────────────────────────────
# The brief's core palette, and the only colours allowed into a file. `assert_palette` enforces it.
ORANGE = (0xE8, 0x5D, 0x26)
COPPER = (0xC1, 0x44, 0x0E)
RUST = (0x8A, 0x2E, 0x0B)
SILVER = (0xE8, 0xE8, 0xE8)
WHITE = (0xFF, 0xFF, 0xFF)
CREAM = (0xF5, 0xE6, 0xC8)
NIGHT = (0x1B, 0x24, 0x40)

PALETTE = [ORANGE, COPPER, RUST, SILVER, WHITE, CREAM, NIGHT]

# Working canvas. Portrait, because every composition in the collection is a stacked poster.
#
# The file is cropped to its bbox before it is stored, so unused canvas costs nothing and the height is
# set generously on purpose: at 3600 the state series ran its phase strip off the bottom edge and the
# evergreen design lost "la luna" and its last two phases — silently, because content drawn past the
# edge is discarded without an error. Height is the cheapest guard against that.
W, H = 3000, 4400

# 10 px at 300 DPI is the brief's 2.5 pt floor. Nothing thinner may be drawn.
MIN_STROKE = 10

# 4% of the disc stays outside the umbra. This is the signature of THIS eclipse and the reason the
# collection can honestly say "96%".
LIT_FRACTION = 0.04
# Earth's umbra at the Moon's distance is roughly 2.6 lunar diameters across. Drawing it at the right
# relative size is what makes the shadow edge curve correctly instead of looking like a bitten cookie.
UMBRA_RATIO = 2.6


def assert_palette(im: Image.Image) -> None:
    """Fail loudly if anything outside the palette reached the file.

    Antialiased edges are the exception and are excluded by only inspecting fully opaque pixels that
    make up a meaningful share of the image; a stray blend colour on a boundary is not a palette breach,
    a whole region in an unplanned hue is.
    """
    counts: dict[tuple[int, int, int], int] = {}
    px = im.convert("RGBA").getdata()
    for r, g, b, a in px:
        if a == 255:
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    total = sum(counts.values()) or 1
    for col, n in counts.items():
        if n / total > 0.005 and col not in PALETTE:
            raise AssertionError(f"palet disi renk {col} ({n/total:.1%} alan)")


def alpha_report(im: Image.Image) -> dict:
    """Measure the thing DTF actually fails on: pixels that are partly transparent.

    A soft glow shows up here as a large mid-alpha population. Edge antialiasing shows up as a small one.
    The number is reported per design so the compromise line in the delivery notes is measured.
    """
    a = im.getchannel("A")
    hist = a.histogram()
    total = sum(hist) or 1
    mid = sum(hist[8:248])
    return {"mid_alpha_frac": mid / total, "opaque_frac": hist[255] / total}


# ── geometry ─────────────────────────────────────────────────────────────────────────────────────
def _disc(size: int, cx: float, cy: float, r: float, ss: int = 4) -> Image.Image:
    """A supersampled filled circle as an "L" mask. Supersampling keeps the limb smooth at print size."""
    big = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(big).ellipse(
        [(cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss], fill=255)
    return big.resize((size, size), Image.LANCZOS)


def eclipse_masks(size: int, angle_deg: float = 108.0) -> tuple[Image.Image, Image.Image]:
    """Return (moon, lit) masks where `lit` is measured to be LIT_FRACTION of the disc.

    `angle_deg` is where on the limb the sliver sits, measured counter-clockwise from east; the default
    puts it on the upper edge as the brief specifies.
    """
    r = size * 0.5 - MIN_STROKE
    cx = cy = size / 2
    moon = _disc(size, cx, cy, r)
    moon_area = sum(moon.point(lambda v: 255 if v > 127 else 0).getdata()) / 255

    ur = r * UMBRA_RATIO
    ang = math.radians(angle_deg)

    # The umbra slides along `ang` until exactly LIT_FRACTION of the disc is left outside it. Solving the
    # circle-circle lens area analytically is possible; searching the rasterised masks is exact for the
    # image that actually ships, which is the one that matters.
    lo, hi = 0.0, r + ur
    lit = None
    for _ in range(24):
        d = (lo + hi) / 2
        umbra = _disc(size, cx - d * math.cos(ang), cy + d * math.sin(ang), ur)
        cand = Image.composite(moon, Image.new("L", (size, size), 0),
                               umbra.point(lambda v: 255 if v < 128 else 0))
        frac = (sum(cand.point(lambda v: 255 if v > 127 else 0).getdata()) / 255) / max(moon_area, 1)
        lit = cand
        if frac < LIT_FRACTION:
            lo = d          # umbra too far in — pull it back
        else:
            hi = d
    return moon, lit


def _halftone(size: int, mask: Image.Image, seed: int, density: float = 0.055,
              rmin: int = 7, rmax: int = 34) -> Image.Image:
    """Solid dots inside `mask`, on a jittered grid — the print-safe stand-in for texture and glow.

    Dot radii start at 7 px because a halftone dot is a filled shape, not a stroke: the stroke floor
    governs lines, and a 14 px-wide dot clears any transfer this shop uses.
    """
    rng = random.Random(seed)
    out = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(out)
    step = int(size * 0.028)
    for y in range(0, size, step):
        for x in range(0, size, step):
            if rng.random() > density * (step * step) / 400:
                continue
            jx = x + rng.randint(-step // 2, step // 2)
            jy = y + rng.randint(-step // 2, step // 2)
            rr = rng.randint(rmin, rmax)
            d.ellipse([jx - rr, jy - rr, jx + rr, jy + rr], fill=255)
    return Image.composite(out, Image.new("L", (size, size), 0), mask)


def _uncovered(size: int, angle_deg: float, d: float) -> Image.Image:
    """The part of the disc left outside an umbra sitting `d` away along `angle_deg`."""
    r = size * 0.5 - MIN_STROKE
    cx = cy = size / 2
    ang = math.radians(angle_deg)
    moon = _disc(size, cx, cy, r)
    umbra = _disc(size, cx - d * math.cos(ang), cy + d * math.sin(ang), r * UMBRA_RATIO)
    return Image.composite(moon, Image.new("L", (size, size), 0),
                           umbra.point(lambda v: 255 if v < 128 else 0))


def _lit_distance(size: int, angle_deg: float, want: float = LIT_FRACTION) -> float:
    """The umbra offset that leaves exactly `want` of the disc uncovered. Measured, not assumed."""
    r = size * 0.5 - MIN_STROKE
    moon = _disc(size, size / 2, size / 2, r)
    moon_area = sum(moon.point(lambda v: 255 if v > 127 else 0).get_flattened_data()) / 255
    lo, hi = 0.0, r * (1 + UMBRA_RATIO)
    for _ in range(24):
        d = (lo + hi) / 2
        cand = _uncovered(size, angle_deg, d)
        frac = (sum(cand.point(lambda v: 255 if v > 127 else 0).get_flattened_data()) / 255) / max(moon_area, 1)
        if frac < want:
            lo = d
        else:
            hi = d
    return (lo + hi) / 2


def blood_moon(size: int, angle_deg: float = 108.0, seed: int = 827,
               craters: bool = True, sliver: bool = True,
               lit_frac: float = LIT_FRACTION) -> Image.Image:
    """The collection's moon: stepped copper bands, halftone craters, bright silver sliver at the limb.

    The bands follow the UMBRA edge, not the disc centre. That distinction is the whole look: concentric
    rings around the middle read as a bullseye, while bands parallel to the shadow edge read as a sphere
    with a shadow on it, which is what the eye is being asked to believe. They are stepped on purpose —
    a smooth ramp is what DTF bands anyway, so the steps are placed deliberately instead of accidentally.
    """
    moon = _disc(size, size / 2, size / 2, size * 0.5 - MIN_STROKE)
    d_lit = _lit_distance(size, angle_deg, lit_frac)
    r = size * 0.5 - MIN_STROKE
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    def fill(mask, col):
        im.paste(Image.new("RGBA", (size, size), (*col, 255)), (0, 0), mask)

    # Deepest umbra first, then each brighter band nearer the lit limb painted over it.
    fill(moon, RUST)
    fill(_uncovered(size, angle_deg, d_lit + r * 1.30), COPPER)
    fill(_uncovered(size, angle_deg, d_lit + r * 0.55), ORANGE)

    # A crater is a rim plus a floor, so it needs room for both above the stroke floor. Below that the
    # detail cannot be printed at all and drawing it anyway inverted the ellipse box and crashed; small
    # moons — the phase strip, the diagram — are simply drawn plain.
    rmin, rmax = int(size * 0.010), int(size * 0.032)
    if craters and rmin > MIN_STROKE * 2:
        rng = random.Random(seed)
        blank = Image.new("L", (size, size), 0)
        cx = cy = size / 2
        # Craters read as rings, not blobs: a lighter rim with a darker floor inside it. Drawn small and
        # numerous — the first pass used discs up to 7.5% of the disc and they merged into cow spots.
        for _ in range(34):
            a = rng.uniform(0, math.tau)
            rad = rng.uniform(0, r * 0.86)
            cxx, cyy = cx + math.cos(a) * rad, cy + math.sin(a) * rad
            rr = rng.randint(rmin, rmax)
            layer = Image.new("L", (size, size), 0)
            ImageDraw.Draw(layer).ellipse([cxx - rr, cyy - rr, cxx + rr, cyy + rr], fill=255)
            fill(Image.composite(layer, blank, moon), RUST)
            inner = max(MIN_STROKE, int(rr * 0.42))
            if rr - inner > MIN_STROKE:
                layer2 = Image.new("L", (size, size), 0)
                ImageDraw.Draw(layer2).ellipse(
                    [cxx - rr + inner, cyy - rr + inner, cxx + rr - inner, cyy + rr - inner], fill=255)
                fill(Image.composite(layer2, blank, moon), COPPER)
        # Fine halftone grain so the copper is not a flat plate. Small dots only — big ones become spots.
        fill(_halftone(size, moon, seed + 1, density=0.04, rmin=7, rmax=13), RUST)

    if sliver:
        # The lit part. Silver body with a white inner edge so it still separates on a light garment.
        lit = _uncovered(size, angle_deg, d_lit)
        fill(lit, SILVER)
        fill(lit.filter(ImageFilter.MinFilter(9)), WHITE)

    return im


def phase_moon(size: int, lit_frac: float, seed: int = 827) -> Image.Image:
    """One moon at a given coverage — the unit the phase strip is built from.

    A fully lit moon is silver all over, not a copper disc with a silver rim: at 100% there is no umbra
    on it at all. Special-casing the ends is what makes the strip read as a sequence.
    """
    if lit_frac >= 0.995:
        m = _disc(size, size / 2, size / 2, size * 0.5 - MIN_STROKE)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(Image.new("RGBA", (size, size), (*SILVER, 255)), (0, 0), m)
        return out
    return blood_moon(size, seed=seed, craters=False, lit_frac=lit_frac)


def phase_strip(width: int, n: int = 7, seed: int = 4210) -> Image.Image:
    """Full → eclipsed → full: the shadow eating the disc and giving it back.

    The coverage of each step is set explicitly rather than left to look different by accident. The
    first attempt drew the same 96% moon at every step, so the strip read as six identical dots.
    """
    gap = int(width / (n * 5))
    d = int((width - gap * (n - 1)) / n)
    out = Image.new("RGBA", (width, d), (0, 0, 0, 0))
    mid = (n - 1) / 2
    for i in range(n):
        t = 1 - abs(i - mid) / mid            # 0 at the ends, 1 at maximum eclipse
        lit = 1.0 + t * (LIT_FRACTION - 1.0)  # 100% lit at the ends, 4% in the middle
        moon = phase_moon(d, lit, seed=seed + i)
        out.paste(moon, (i * (d + gap), 0), moon)
    return out


def stars(size_w: int, size_h: int, n: int, seed: int, rmin: int = 6, rmax: int = 16,
          avoid: tuple[int, int, int] | None = None, col=CREAM, margin: int = 90) -> Image.Image:
    """A star field of SOLID dots. No twinkle gradients — those are alpha fades by another name.

    Held off the edges by `margin`. Stars that run to the canvas edge print as if the design were cut
    off, and they also defeat the overflow check in the builder by making every star field look like
    clipped artwork.
    """
    rng = random.Random(seed)
    out = Image.new("RGBA", (size_w, size_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    placed = 0
    guard = 0
    lo_x, hi_x = margin + rmax * 2, size_w - margin - rmax * 2
    lo_y, hi_y = margin + rmax * 2, size_h - margin - rmax * 2
    while placed < n and guard < n * 40:
        guard += 1
        x, y = rng.randint(lo_x, max(lo_x, hi_x)), rng.randint(lo_y, max(lo_y, hi_y))
        if avoid:
            ax, ay, ar = avoid
            if (x - ax) ** 2 + (y - ay) ** 2 < (ar + rmax * 3) ** 2:
                continue
        r = rng.randint(rmin, rmax)
        if rng.random() < 0.16:
            # A few four-point sparkles, drawn as thick bars so they survive the transfer.
            t = max(MIN_STROKE, r // 2)
            d.rectangle([x - r * 2, y - t // 2, x + r * 2, y + t // 2], fill=(*col, 255))
            d.rectangle([x - t // 2, y - r * 2, x + t // 2, y + r * 2], fill=(*col, 255))
        else:
            d.ellipse([x - r, y - r, x + r, y + r], fill=(*col, 255))
        placed += 1
    return out


def ring_glow(size: int, cx: int, cy: int, r0: int, rings: int = 4, col=COPPER,
              step: int | None = None) -> Image.Image:
    """Stepped concentric rings instead of a soft halo. Each ring is a solid stroke above the floor."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    step = step or int(r0 * 0.085)
    for i in range(rings):
        rr = r0 + step * (i + 1) * 1.7
        wdt = max(MIN_STROKE, int(step * (0.85 ** i) * 0.55))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(*col, 255), width=wdt)
    return out


def outline_for_black(mask: Image.Image, px: int = 14, col=CREAM) -> Image.Image:
    """Ring a dark shape so it does not vanish on a black tee — the brief's rule, applied mechanically."""
    grown = mask.filter(ImageFilter.MaxFilter(px * 2 + 1))
    edge = Image.composite(grown, Image.new("L", mask.size, 0),
                           mask.point(lambda v: 255 if v < 128 else 0))
    out = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", mask.size, (*col, 255)), (0, 0), edge)
    return out


# ── type helpers ─────────────────────────────────────────────────────────────────────────────────
def fit(text: str, role: str, max_w: int, max_h: int, track: float = 0.0):
    """Largest size of `role` where `text` fits the box, tracking included."""
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    size = max_h
    while size > 14:
        f = typeset.font(role, size)
        w = typeset.text_width(probe, text, f, track)
        b = probe.textbbox((0, 0), text, font=f)
        if w <= max_w and (b[3] - b[1]) <= max_h:
            return f, w, b
        size -= 6
    f = typeset.font(role, 14)
    return f, typeset.text_width(probe, text, f, track), probe.textbbox((0, 0), text, font=f)


def line(im: Image.Image, text: str, role: str, cx: int, top: int, max_w: int, max_h: int,
         col=CREAM, track: float = 0.0) -> int:
    """Set one centred line, return the y its box ends at."""
    f, w, b = fit(text, role, max_w, max_h, track)
    d = ImageDraw.Draw(im)
    typeset.draw_tracked(d, (cx - w // 2, top - b[1]), text, f, (*col, 255), track)
    return top + (b[3] - b[1])


def rule(im: Image.Image, cx: int, y: int, w: int, col=COPPER, thick: int = MIN_STROKE + 4) -> None:
    ImageDraw.Draw(im).rectangle([cx - w // 2, y, cx + w // 2, y + thick], fill=(*col, 255))
