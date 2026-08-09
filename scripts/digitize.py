#!/usr/bin/env python3
"""Turn a flat-colour design into a machine embroidery file. No per-design digitising fee.

    python3 scripts/digitize.py <product_id> [--out out.dst] [--inches 4]

Auto-digitising is hard in general and easy in our particular case, and the difference is the work
already done upstream: every embroidery design here is snapped to the supplier's exact thread hexes,
so it is 2-6 flat regions with no gradients, no anti-aliasing and no photographic detail. There is
nothing left to interpret — each region is one colour of thread, and the only question is how to
cover it in stitches.

What this generates per colour, in the order a machine wants it:

  1. a running-stitch underlay just inside the edge, which anchors the fabric so the fill does not
     drag it into a pucker
  2. a tatami fill — parallel rows walked boustrophedon, each row broken into stitches no longer
     than the machine's safe maximum
  3. a colour change

Rows are laid at 45 degrees rather than straight across. A fill parallel to the weave sinks into it
and reads as a stripe; a diagonal one covers.

Limits worth knowing before trusting it: this fills regions, it does not generate satin borders, so
a design whose outline should be a raised satin cord will come out flat. Small counters below the
minimum stitch length are dropped rather than stitched into a knot. Both are visible in the preview
this writes next to the file.
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from thread_palettes import palette, describe                      # noqa: E402

import pyembroidery                                                # noqa: E402

# Machine and thread constraints, in millimetres. These are not style choices: below MIN_STITCH the
# needle perforates the same hole and the thread breaks; above MAX_STITCH the float snags in wear.
ROW_SPACING = 0.40
MAX_STITCH = 4.0
MIN_STITCH = 1.0
UNDERLAY_INSET = 0.8
UNDERLAY_STEP = 2.5
FILL_ANGLE_DEG = 45.0
MIN_REGION_MM2 = 4.0        # smaller than this cannot be stitched cleanly; report, do not attempt


def rotate(pts: np.ndarray, deg: float) -> np.ndarray:
    r = np.deg2rad(deg)
    m = np.array([[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]])
    return pts @ m.T


def fill_region(mask: np.ndarray, mm_per_px: float) -> list:
    """Tatami fill: rows across the region at FILL_ANGLE_DEG, walked alternately left and right."""
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        return []
    pts = np.stack([xs, ys], axis=1).astype(float)
    rot = rotate(pts, -FILL_ANGLE_DEG)                     # work in a frame where rows are horizontal
    lo, hi = rot.min(axis=0), rot.max(axis=0)
    step = ROW_SPACING / mm_per_px
    runs: list = []
    flip = False
    v = lo[1]
    gap = max(step, 1.5 / mm_per_px)          # a break wider than this is outside the shape
    while v <= hi[1]:
        band = rot[(rot[:, 1] >= v) & (rot[:, 1] < v + step)]
        if band.shape[0] >= 2:
            # A row crosses the shape as SEGMENTS, not as one span. Taking min and max stitched
            # straight across the hole in a ring and filled every counter solid — the whole badge
            # came out as a disc. Split the row wherever it leaves the mask.
            xsr = np.sort(band[:, 0])
            cuts = np.nonzero(np.diff(xsr) > gap)[0]
            for seg in np.split(xsr, cuts + 1):
                if seg.size < 2:
                    continue
                a, b = float(seg[0]), float(seg[-1])
                if (b - a) * mm_per_px < MIN_STITCH:
                    continue
                x0, x1 = (b, a) if flip else (a, b)
                n = max(1, int(abs(x1 - x0) * mm_per_px / MAX_STITCH))
                row = [[x0 + (x1 - x0) * i / n, v + step / 2] for i in range(n + 1)]
                runs.append(rotate(np.array(row), FILL_ANGLE_DEG).tolist())
                flip = not flip
        v += step
    return runs


def underlay(mask: np.ndarray, mm_per_px: float) -> list:
    """A running stitch just inside the edge. Without it the fill pulls the cloth into a pucker."""
    from scipy import ndimage
    inset = max(1, int(UNDERLAY_INSET / mm_per_px))
    inner = ndimage.binary_erosion(mask, np.ones((inset * 2 + 1, inset * 2 + 1)))
    edge = inner & ~ndimage.binary_erosion(inner, np.ones((3, 3)))
    ys, xs = np.nonzero(edge)
    if xs.size < 8:
        return []
    pts = np.stack([xs, ys], axis=1).astype(float)
    # walk the outline nearest-neighbour; the contour is thin so this traces it in order
    step = max(1, int(UNDERLAY_STEP / mm_per_px))
    pts = pts[::step]
    out = [pts[0]]
    remaining = list(range(1, len(pts)))
    while remaining:
        cur = out[-1]
        j = min(remaining, key=lambda i: (pts[i][0] - cur[0]) ** 2 + (pts[i][1] - cur[1]) ** 2)
        if np.hypot(*(pts[j] - cur)) * mm_per_px > MAX_STITCH * 3:
            break                                           # jumped to a different island; stop
        out.append(pts[j])
        remaining.remove(j)
    return [p.tolist() for p in out]


def digitize(design: Image.Image, supplier: str, inches: float, out: Path) -> dict:
    pal = palette(supplier)
    a = np.asarray(design.convert("RGBA"))
    opaque = a[:, :, 3] > 128
    long_px = max(design.size)
    mm_per_px = inches * 25.4 / long_px

    colours = {}
    for hx in pal:
        rgb = tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))
        m = opaque & np.all(a[:, :, :3] == rgb, axis=2)
        if m.sum() * (mm_per_px ** 2) >= MIN_REGION_MM2:
            colours[hx] = m

    if not colours:
        raise SystemExit("tasarimda paletten hicbir renk yok — once snap edilmeli")

    pattern = pyembroidery.EmbPattern()
    report, total = [], 0
    # Largest area first: broad shapes go down before the detail that sits on top of them.
    for hx, mask in sorted(colours.items(), key=lambda kv: -kv[1].sum()):
        under = underlay(mask, mm_per_px)
        runs = ([under] if under else []) + fill_region(mask, mm_per_px)
        if not runs:
            continue
        pattern.add_thread({"hex": hx, "description": describe(supplier, hx)})
        n = 0
        for ri, run in enumerate(runs):
            for si, (x, y) in enumerate(run):
                # Between disjoint runs the needle must TRAVEL, not stitch. Stitching across drags
                # thread over the face of the badge — the long diagonal streaks in the first preview.
                kind = pyembroidery.JUMP if (si == 0 and ri > 0) else pyembroidery.STITCH
                pattern.add_stitch_absolute(kind, x * mm_per_px * 10, y * mm_per_px * 10)
                n += 1
        pattern.color_change()
        report.append({"thread": describe(supplier, hx), "hex": hx, "stitches": n,
                       "area_mm2": round(float(mask.sum()) * mm_per_px ** 2, 1)})
        total += n

    pattern.end()
    out.parent.mkdir(parents=True, exist_ok=True)
    pyembroidery.write(pattern, str(out))
    return {"file": str(out), "stitches": total, "size_in": round(inches, 2), "colours": report}


def preview(pattern_path: Path, out: Path, px: int = 900) -> Path:
    """Draw the stitches back. A stitch file that looks wrong here will look wrong on cloth."""
    p = pyembroidery.read(str(pattern_path))
    pts = [(s[0], s[1]) for s in p.stitches]
    if not pts:
        raise SystemExit("desende dikis yok")
    xs, ys = zip(*pts)
    w, h = max(xs) - min(xs) or 1, max(ys) - min(ys) or 1
    sc = px / max(w, h)
    im = Image.new("RGB", (int(w * sc) + 20, int(h * sc) + 20), (250, 249, 246))
    d = ImageDraw.Draw(im)
    # Draw each block in its own thread colour. A single-colour preview hides the defect that
    # matters most — one colour's fill spilling into another's territory.
    def thex(t):
        for attr in ("hex_color", "get_hex_color"):
            if hasattr(t, attr):
                try:
                    v = getattr(t, attr)()
                    return v if str(v).startswith("#") else f"#{v}"
                except Exception:
                    pass
        return "#333333"
    threads = [thex(t) for t in p.threadlist] or ["#333333"]
    ci, last = 0, None
    for s in p.stitches:
        x, y = (s[0] - min(xs)) * sc + 10, (s[1] - min(ys)) * sc + 10
        if s[2] == pyembroidery.COLOR_CHANGE:
            ci, last = ci + 1, None
            continue
        col = threads[ci] if ci < len(threads) else "#333333"
        if s[2] == pyembroidery.STITCH and last:
            d.line([last, (x, y)], fill=col, width=1)
        last = (x, y) if s[2] == pyembroidery.STITCH else None
    im.save(out, quality=92)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("product_id", type=int)
    ap.add_argument("--inches", type=float, default=4.0)
    ap.add_argument("--supplier", default="customzon")
    ap.add_argument("--out")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT slug, technique, print_file FROM products WHERE id=%s", (a.product_id,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"urun {a.product_id} yok")
    slug, technique, blob = row
    if technique != "embroidery":
        sys.exit(f"{slug}: nakis urunu degil")
    design = Image.open(io.BytesIO(bytes(blob)))
    out = Path(a.out or f"/tmp/digitize/{slug}.dst")
    info = digitize(design, a.supplier, a.inches, out)
    prev = preview(out, out.with_suffix(".preview.jpg"))

    print(f"{slug}  {info['size_in']}\"  {info['stitches']} dikis")
    for c in info["colours"]:
        print(f"   {c['thread']:24} {c['stitches']:>6} dikis  {c['area_mm2']:>7} mm2")
    print(f"\n  dosya   : {info['file']}")
    print(f"  onizleme: {prev}")


if __name__ == "__main__":
    main()
