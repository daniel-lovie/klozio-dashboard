#!/usr/bin/env python3
"""Render a design as actual embroidery, by drawing the stitches we would send to the machine.

Every attempt so far tried to make flat artwork *look* stitched — diagonal banding, a rim shadow, a
ragged edge. It never convinced, and it could not: a filter over a vector shape is still a vector
shape with a filter over it, and the eye reads thread by its direction. Real satin runs across a
shape and turns with it; real fill runs in rows you can count.

We already generate that geometry, because we digitise in-house. So this draws it: every stitch as a
short thread-coloured stroke with a highlight along one edge and a shadow along the other, in the
order and direction the machine would lay them. The picture is embroidery because the path is.

    python3 scripts/stitch_render.py <product_id> [--inches 6] [--out out.png]
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from digitize import digitize                                   # noqa: E402
from thread_palettes import palette                             # noqa: E402

import pyembroidery                                             # noqa: E402


def render(dst_path: Path, colours: list, px_per_mm: float = 12.0) -> Image.Image:
    """Draw the stitch file as thread. Returns RGBA with a transparent background."""
    p = pyembroidery.read(str(dst_path))
    pts = [(s[0] / 10.0, s[1] / 10.0, s[2]) for s in p.stitches]   # DST is 0.1mm units
    xs = [x for x, _, _ in pts]
    ys = [y for _, y, _ in pts]
    minx, miny = min(xs), min(ys)
    w = int((max(xs) - minx) * px_per_mm) + 40
    h = int((max(ys) - miny) * px_per_mm) + 40

    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    order = [c["hex"] for c in colours]
    ci, last = 0, None
    # A thread lies about 0.4mm wide and sits proud of the cloth, so each stitch carries a light
    # edge on one side and a dark one on the other. Drawn per stitch rather than per shape, that is
    # what produces the grain of real embroidery instead of a texture pasted over a silhouette.
    tw = max(2, int(0.42 * px_per_mm))
    for x, y, cmd in pts:
        px, py = (x - minx) * px_per_mm + 20, (y - miny) * px_per_mm + 20
        if cmd == pyembroidery.COLOR_CHANGE:
            ci, last = ci + 1, None
            continue
        if cmd != pyembroidery.STITCH:
            last = None
            continue
        if last is not None:
            hx = order[ci] if ci < len(order) else "#333333"
            base = tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))
            hi = tuple(min(255, int(c * 1.35 + 26)) for c in base)
            lo = tuple(int(c * 0.62) for c in base)
            d.line([(last[0] + 1, last[1] + 1), (px + 1, py + 1)], fill=lo + (255,), width=tw)
            d.line([(last[0] - 1, last[1] - 1), (px - 1, py - 1)], fill=hi + (255,), width=max(1, tw - 1))
            d.line([last, (px, py)], fill=base + (255,), width=max(1, tw - 1))
        last = (px, py)

    # the whole badge stands off the cloth; a soft shadow under it is what sells the relief
    alpha = np.asarray(im.split()[3]).astype(float)
    shadow = Image.fromarray((alpha * 0.55).astype(np.uint8)).filter(ImageFilter.GaussianBlur(tw * 1.4))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (w, h), (25, 20, 15, 255)), (int(tw * 0.7), int(tw * 0.9)), shadow)
    out.alpha_composite(im)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("product_id", type=int)
    ap.add_argument("--inches", type=float, default=6.0)
    ap.add_argument("--supplier", default="customzon")
    ap.add_argument("--out", default="/tmp/stitch.png")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT slug, print_file FROM products WHERE id=%s", (a.product_id,))
    slug, blob = cur.fetchone()
    design = Image.open(io.BytesIO(bytes(blob)))
    dst = Path(f"/tmp/{slug}-render.dst")
    info = digitize(design, a.supplier, a.inches, dst)
    im = render(dst, info["colours"])
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out)
    print(f"{slug}: {info['stitches']} dikis -> {a.out}  ({im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    main()
