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


def warp(design: Image.Image, quad, size) -> Image.Image:
    """Map the design's corners onto the quad. PIL wants the inverse transform's coefficients."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = [(float(x), float(y)) for x, y in quad]
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
    blank = Image.open(blank_path).convert("RGB")
    design = Image.open(design_path).convert("RGBA")
    placed = warp(design, tpl["quad"], blank.size)

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
    ratio = lum / max(ref, 1.0)
    lit = np.clip(art[:, :, :3] * (ratio * shade + (1 - shade)), 0, 255)

    out_arr = base * (1 - alpha) + lit * alpha
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(out_arr, 0, 255).astype(np.uint8)).save(out, quality=92)
    return out


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
