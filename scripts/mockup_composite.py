#!/usr/bin/env python3
"""Place a design onto our own blank-garment photographs, the way Placeit and AllPodi do.

Printful's renders are free and honest but they are 3D renders on a studio ghost, and every shop
using Printful ships the identical photograph. A real photo of a real person in a real room is what
separates a listing that looks like a shop from one that looks like a print-on-demand feed. The
photographs are licensed blanks; this only puts our artwork on them.

Two things make a composite read as printed rather than pasted:

- **Perspective.** The chest is not a rectangle facing the camera. The design is warped into a quad
  whose corners are set once per photograph, so it leans and tapers with the body.
- **The garment's own light.** The design is multiplied by the shirt's luminance, so every fold,
  shadow and highlight under it shows through. Skipping this is what makes a mockup look like a
  sticker; it is one line and it is the whole difference.

Calibration is per photograph and lives in templates.json next to the images. `--calibrate` guesses a
starting quad by finding the garment, then you nudge four numbers rather than measuring by hand.

    python3 scripts/mockup_composite.py --calibrate blanks/C1717BlackTrendy3.jpg
    python3 scripts/mockup_composite.py --design .../final.png --template C1717BlackTrendy3
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BLANKS = Path("/Users/omer/Documents/code/etsy/pipeline/blanks")
CONFIG = BLANKS / "templates.json"


def load_config() -> dict:
    return json.loads(CONFIG.read_text()) if CONFIG.exists() else {}


def save_config(cfg: dict) -> None:
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(cfg, indent=1, ensure_ascii=False))


def guess_quad(path: Path) -> dict:
    """A starting square over the chest, derived from the garment's own silhouette.

    The first attempt anchored on the widest row of garment-coloured pixels, which on a seated model
    is the hem, not the chest — the print landed on her lap. Anchoring on the TOP of the garment mass
    and working down is stable across poses: the neckline is always near the top, and the print sits
    just under it at a little over a third of the shoulder width.

    Numbers come from the one template calibrated by eye (model-Pepper): print width 0.36 of the
    frame, top 0.25 down it. They are a starting point per photograph, not a measurement.
    """
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    core = a[int(h * 0.30):int(h * 0.55), int(w * 0.35):int(w * 0.65)]
    garment = np.median(core.reshape(-1, 3), axis=0)
    close = np.abs(a - garment).max(axis=2) < 46
    rows = close.sum(axis=1)
    body = np.where(rows > w * 0.10)[0]
    if body.size < 20:
        raise SystemExit(f"{path.name}: kumas bulunamadi, koseleri elle gir")
    top = int(body.min())

    # Take the RUN OF GARMENT THAT CONTAINS THE TORSO, not the full extent of garment-coloured
    # pixels on the row. Hair, a raised arm and a second sleeve all match the shirt's colour and
    # dragged the centre sideways — the print ended up on a hip on five of eight photographs.
    centres, widths = [], []
    for y in range(top + int(h * 0.10), min(top + int(h * 0.26), h - 1), 12):
        xs = np.where(close[y])[0]
        if xs.size < 40:
            continue
        splits = np.split(xs, np.where(np.diff(xs) > w * 0.02)[0] + 1)
        run = max(splits, key=len)
        centres.append((run.min() + run.max()) / 2)
        widths.append(run.max() - run.min())
    if not centres:
        raise SystemExit(f"{path.name}: govde bulunamadi, koseleri elle gir")
    cx = int(np.median(centres))
    side = int(np.median(widths) * 0.60)
    y0 = top + int(h * 0.11)
    return {"quad": [[cx - side // 2, y0], [cx + side // 2, y0],
                     [cx + side // 2, y0 + side], [cx - side // 2, y0 + side]],
            "opacity": 0.94, "shade": 0.85}


def rotate_quad(quad, deg: float) -> list:
    """Turn the quad about its own centre so the print lies along the garment, not the frame.

    Every folded flat in this set is shot at about -8 degrees. A print laid square to the image sits
    visibly crooked on a shirt that is not — the most obvious tell in the first test set.
    """
    import math
    pts = [(float(x), float(y)) for x, y in quad]
    cx = sum(p[0] for p in pts) / 4
    cy = sum(p[1] for p in pts) / 4
    r = math.radians(deg)
    cos, sin = math.cos(r), math.sin(r)
    return [[int(cx + (x - cx) * cos - (y - cy) * sin),
             int(cy + (x - cx) * sin + (y - cy) * cos)] for x, y in pts]


def fit_quad(design: Image.Image, box, px_per_inch: float, inches: float,
             angle: float = 0.0, x_frac: float | None = None,
             y_frac: float | None = None) -> list:
    """Size a quad inside the MEASURED print rectangle, keeping the artwork's own proportions.

    Two things this exists to prevent, both of which shipped:

    - A square quad stretches a tall design to fill it. The producer handed the artwork's four corners
      straight to a square area, so a portrait design came out squashed on every listing.
    - Size has to come from inches and a measured pixels-per-inch, not from a fraction of the garment.
      `print_box` is the exact rectangle a real printed mockup of this same photograph occupies,
      recovered by diffing that mockup against our blank; when it is present nothing else gets a vote.

    x_frac/y_frac place a smaller badge inside the box (embroidery); omitted, the print is centred at
    the top of the box the way a full-front print sits.
    """
    bb = design.getbbox() or (0, 0, design.width, design.height)
    aw, ah = bb[2] - bb[0], bb[3] - bb[1]
    long_px = inches * px_per_inch
    w = long_px if aw >= ah else long_px * aw / ah
    h = long_px if ah > aw else long_px * ah / aw

    bx, by, bx1, by1 = [float(v) for v in box]
    bw, bh = bx1 - bx, by1 - by
    # Never exceed the printable rectangle: the physical area is 12x16 inches and a quad larger than
    # the measured box is a print that cannot be produced.
    fit = min(bw / w, bh / h, 1.0)
    w, h = w * fit, h * fit

    cx = bx + bw / 2 if x_frac is None else bx + bw * x_frac
    top = by if y_frac is None else by + bh * y_frac
    quad = [[cx - w / 2, top], [cx + w / 2, top], [cx + w / 2, top + h], [cx - w / 2, top + h]]
    return rotate_quad(quad, angle) if angle else [[int(x), int(y)] for x, y in quad]


def decontaminate(design: Image.Image) -> Image.Image:
    """Push design colour into the transparent region so nothing else can bleed out of it.

    A cutout only clears ALPHA. The RGB of every cleared pixel still holds the background the generator
    drew — pure white for the embroidery renders, a solid green or blue field for the print files. That
    colour is invisible until geometry runs: `resize`, `transform` and `displace` all interpolate RGB
    and alpha independently (PIL has no premultiplied mode), so edge pixels come out as a blend of ink
    and background, and the final blend `base*(1-a) + art*a` paints that blend onto the garment. On an
    Ivory tee a white fringe is invisible; on rust or Pepper it is a halo round every letter, and a
    green-backed print file haloes green.

    Flooding the cleared area with the nearest opaque colour makes the interpolation harmless: what
    bleeds is the ink itself, which is what a real print does as it sinks into the weave.

    Run once per design, not per image — the distance transform is the expensive part of a composite.
    """
    a = np.array(design.convert("RGBA"))
    opaque = a[:, :, 3] > 8
    if not opaque.any() or opaque.all():
        return design
    from scipy import ndimage
    idx = ndimage.distance_transform_edt(~opaque, return_distances=False, return_indices=True)
    a[:, :, :3] = a[:, :, :3][idx[0], idx[1]]
    return Image.fromarray(a, "RGBA")


def warp(design: Image.Image, quad, size) -> Image.Image:
    """Map the design's corners onto the quad. PIL wants the inverse transform's coefficients."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = [(float(x), float(y)) for x, y in quad]

    # Reduce with an AREA filter before warping. Image.transform samples the source through a small
    # kernel with no mip-mapping, so a 3600px design squeezed into a 940px quad is point-sampled at
    # roughly every fourth pixel. On flat shapes that merely softens; on the halftone dot screens these
    # designs are built from it aliases catastrophically — a pink dotted face collapses into a dark
    # clump and the whole print reads as a muddy smear. Resampling to about the destination size first
    # averages each dot cluster into the mid-tone it is supposed to represent.
    dst_w = max(x0, x1, x2, x3) - min(x0, x1, x2, x3)
    dst_h = max(y0, y1, y2, y3) - min(y0, y1, y2, y3)
    k = min(design.size[0] / max(dst_w, 1.0), design.size[1] / max(dst_h, 1.0))
    if k > 1.2:
        # 1.15x the destination leaves the warp a little detail to work with without re-aliasing.
        design = design.resize((max(1, round(design.size[0] / k * 1.15)),
                                max(1, round(design.size[1] / k * 1.15))), Image.LANCZOS)
    w, h = design.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(x0, y0), (x1, y1), (x2, y2), (x3, y3)]
    A = []
    for (sx, sy), (dx, dy) in zip(src, dst):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    coeffs = np.linalg.solve(np.array(A, float), np.array(sum(src, ()), float).reshape(8))
    return design.transform(size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def composite(design_path: Path, blank_path: Path, tpl: dict, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    composite_pil(Image.open(design_path).convert("RGBA"),
                  Image.open(blank_path).convert("RGB"), tpl).save(out, quality=92)
    return out


def displace(placed: Image.Image, blank: Image.Image, strength_px: float) -> Image.Image:
    """Push the artwork around by the cloth's own folds.

    This is what separates a mockup from a sticker, and no amount of shading substitutes for it. A
    print lies ON the fabric: where the cloth rises the ink rides up with it, where it creases the
    ink bends into the crease. Shading alone paints a shadow over a shape that is still perfectly
    flat and perfectly circular, which is exactly what "looks like paint" means.

    The displacement field is the gradient of the garment's blurred luminance — folds are where
    luminance changes fastest — and the artwork is resampled through it.
    """
    from scipy import ndimage

    lum = np.asarray(blank.convert("L")).astype(float)
    soft = ndimage.gaussian_filter(lum, sigma=max(2.0, strength_px * 1.5))
    gy, gx = np.gradient(soft)
    scale = strength_px / max(float(np.percentile(np.hypot(gx, gy), 97)), 1e-3)
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xx + gx * scale, 0, w - 1)
    sy = np.clip(yy + gy * scale, 0, h - 1)

    a = np.asarray(placed).astype(np.float32)
    out = np.empty_like(a)
    for c in range(4):
        out[:, :, c] = ndimage.map_coordinates(a[:, :, c], [sy, sx], order=1, mode="nearest")
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def composite_pil(design: Image.Image, blank: Image.Image, tpl: dict) -> Image.Image:
    """The composite itself, on already-decoded images — callers that loop should decode once."""
    placed = warp(design, tpl["quad"], blank.size)
    placed = displace(placed, blank, float(tpl.get("displace", 6.0)))

    art = np.asarray(placed).astype(float)
    # A print does not have a die-cut edge. Ink bleeds a fraction of a millimetre into the weave, so
    # a perfectly hard alpha is the single strongest tell that the artwork was pasted on rather than
    # printed. One pixel of blur at this resolution is about that bleed.
    soft = Image.fromarray(art[:, :, 3].astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    art[:, :, 3] = np.asarray(soft).astype(float)
    alpha = art[:, :, 3:4] / 255.0 * float(tpl.get("opacity", 0.94))
    base = np.asarray(blank).astype(float)

    # Light the print with the garment's SHADING, not its darkness. Dividing luminance by a fixed
    # white point meant a Pepper tee (luminance 65) multiplied the artwork by 0.39 — gold came out
    # olive and white came out grey, on a print that in reality is opaque ink sitting on top of the
    # cloth. Normalising by the garment's own median makes a flat area 1.0, so only folds, shadows
    # and the weave move the print — which is the part that stops it looking pasted on.
    shade = float(tpl.get("shade", 0.85))
    lum = (0.2126 * base[:, :, 0] + 0.7152 * base[:, :, 1] + 0.0722 * base[:, :, 2])[:, :, None]
    inside = alpha[:, :, 0] > 0.5
    ref = float(np.median(lum[:, :, 0][inside])) if inside.any() else float(np.median(lum))
    # Texture must be scaled by ABSOLUTE deviation, not relative. Cloth of every shade has roughly
    # the same grain in absolute terms, but dividing by the garment's own mean makes that grain four
    # times stronger on Pepper (mean 65) than on Ivory (mean 247) — which is exactly what showed up:
    # a clean print on the light shirt and a woven-through one on the dark.
    # Normalise by the garment's OWN texture amplitude, not by its brightness and not by a fixed
    # number. Measured on these photographs the weave is 0.7% of mean on Ivory and 22.9% on Pepper —
    # they were shot differently, and any shared multiplier leaves one clean and the other woven
    # through. Dividing by each garment's standard deviation gives every shade the same subtle grain,
    # which is what a print actually looks like.
    sd = float(np.std(lum[:, :, 0][inside])) if inside.any() else float(np.std(lum))
    # The divisor cannot be the standard deviation alone. A cleanly lit Ivory tee has sd ≈ 1.7 levels,
    # so an ordinary five-level ripple became grain = -3, and with shade 0.85 the multiplier went
    # NEGATIVE and clipped to zero: the garment's own sensor noise punched black holes through the
    # print. Flooring the divisor at a few percent of the garment's brightness keeps folds visible on
    # cloth that genuinely has them and stops noise being amplified on cloth that does not.
    denom = max(sd, 0.06 * ref, 1.0)
    grain = (lum - ref) / denom                            # in units of this cloth's own variation
    # Bound the MODULATION, not the grain. Per-template `shade` values run to 0.85, so clamping grain
    # alone still let the product go negative and clip to black. Ink on cloth loses at most about half
    # its value in a deep fold and gains a little on a highlight; outside that range the result is not
    # a shaded print, it is a hole.
    mod = np.clip(grain * shade, -0.45, 0.30)
    lit = np.clip(art[:, :, :3] * (1.0 + mod), 0, 255)

    return Image.fromarray(np.clip(base * (1 - alpha) + lit * alpha, 0, 255).astype(np.uint8))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", help="blank image path; writes a starting quad to templates.json")
    ap.add_argument("--design")
    ap.add_argument("--template", help="template name from templates.json")
    ap.add_argument("--all", action="store_true", help="render the design on every template")
    ap.add_argument("--out", default="/tmp/composite")
    a = ap.parse_args()
    cfg = load_config()

    if a.calibrate:
        p = Path(a.calibrate)
        tpl = guess_quad(p)
        tpl["file"] = p.name
        cfg[p.stem] = tpl
        save_config(cfg)
        print(f"{p.stem}: {json.dumps(tpl['quad'])}")
        print(f"-> {CONFIG}  (koseleri elle ayarlayabilirsin)")
        return

    if not a.design:
        raise SystemExit("--design gerekli")
    names = list(cfg) if a.all else [a.template]
    for n in names:
        tpl = cfg.get(n)
        if not tpl:
            print(f"{n}: sablon yok"); continue
        out = Path(a.out) / f"{Path(a.design).parent.name}-{n}.jpg"
        composite(Path(a.design), BLANKS / tpl["file"], tpl, out)
        print(f"  {n:28} -> {out}")


if __name__ == "__main__":
    main()
