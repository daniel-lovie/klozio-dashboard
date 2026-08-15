#!/usr/bin/env python3
"""Score a cut design from what was measured, so a generation can be CHOSEN rather than merely allowed.

The pipeline has only ever asked one question — is this file shippable? — and taken the first answer that
was not "no". That treats a design scraping past every gate and a design comfortably clear of all of them
as the same product. They are not, and the difference is free: the generator is stochastic, so a second
draw of the same prompt is a different design at the price of one more generation.

This is the cheap half of "own your intelligence": no training, no weights, no dataset. A rubric written
from measurements the pipeline already takes, used to pick the best of N.

Two rules kept it honest:

  1. Nothing here is a preference. Every term is a physical property of a print — resolution, edge safety,
     contamination, ink coverage, contrast against the garment it will be printed on. Taste belongs to the
     operator and is recorded in design_feedback, not asserted here.
  2. A score is not a gate. Gates still refuse defects; this only ranks what already passed. Ranking on a
     scale that also decides shippability is how a scorer starts approving things to raise its own number.

Reward hacking is a real risk the moment a score drives generation: a rubric that rewards "more opaque
area" is satisfied by a solid rectangle. Every term below is therefore BOUNDED and several are penalties
that cannot be gamed upward — the maximum is a clean, correctly-sized, well-contrasted print, which is
the actual goal rather than a proxy for it.

    python3 scripts/design_score.py <product_id>      # score the stored print file
"""
from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import produce_images as pi                                        # noqa: E402

# What a t-shirt print is judged on, and what each is worth. The weights are deliberately blunt: this
# ranks two draws of the same concept, so it only has to order them, not price them.
WEIGHTS = {
    "resolution": 30,     # real PPI at the size it prints — the defect that took 37 live listings
    "cleanliness": 25,    # key-colour contamination, holes, halo
    "composition": 20,    # ink coverage in a sane band, not touching the edge
    "contrast": 25,       # readable on the garment it is going onto
}


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# The learned half, kept apart from the physical half on purpose.
#
# assets/preference-model.json is fitted by learn_preference.py from the operator votes, per-rater
# centred and validated out-of-fold. It orders two designs correctly about 61% of the time (95% interval
# 55-67%), which is a real signal and a small one — so it is worth a MINORITY of the score. Weighting it
# like the physical terms would be pretending 61% is taste.
#
# It only ever RANKS. Nothing here can refuse a design: the gates in produce_product decide what ships,
# and a learned score that could also gate is how a model starts approving things to raise its own
# number. If the file is missing, the rubric simply runs without this term.
PREF_WEIGHT = 15


def _preference(feats: dict | None) -> float:
    if not feats:
        return 0.5
    try:
        m = json.loads((Path(__file__).resolve().parent.parent / "assets" / "preference-model.json")
                       .read_text())
    except (OSError, ValueError):
        return 0.5
    z = [(feats.get(n, 0.0) - mu) / sd for n, mu, sd in zip(m["features"], m["mean"], m["std"])]
    raw = sum(a * b for a, b in zip(z, m["weights"][:-1])) + m["weights"][-1]
    # The target was a centred like-rate in roughly [-0.5, 0.5], so this maps back to 0-1 rather than
    # inventing a scale.
    return _clamp(raw + 0.5)


def features_of(im: "Image.Image") -> dict | None:
    """The learned model's inputs. Lives HERE, next to the scorer that consumes them, and is imported
    by learn_preference — two copies of a feature definition is two models."""
    im = im.convert("RGBA")
    a = np.asarray(im)
    opaque = a[..., 3] > 128
    if opaque.sum() < 1000:
        return None
    rgb = a[..., :3][opaque].astype(float)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    ys, xs = np.nonzero(opaque)
    w = xs.max() - xs.min() + 1
    h = ys.max() - ys.min() + 1
    # Colourfulness: mean saturation of the ink. This is the axis the operator changed the palette on, so
    # it is the one worth knowing about.
    mx, mn = rgb.max(axis=1), rgb.min(axis=1)
    sat = np.divide(mx - mn, np.maximum(mx, 1e-6))
    # Distinct colours, quantised — a proxy for "flat and few" against "busy".
    q = (rgb // 32).astype(int)
    ncol = len(np.unique(q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]))
    # Detail: how much of the ink is edge. A fine-hatched engraving scores high, a flat emblem low.
    small = np.asarray(Image.fromarray((opaque * 255).astype(np.uint8)).resize((256, 256)))
    edge = np.abs(np.diff(small.astype(int), axis=0)).mean() + np.abs(np.diff(small.astype(int), axis=1)).mean()
    return {
        "ink_lum": float(lum.mean()) / 255.0,
        "colourfulness": float(sat.mean()),
        "colour_count": min(ncol, 60) / 60.0,
        "coverage": float(opaque.mean()),
        "aspect": float(min(w, h)) / float(max(w, h)),
        "detail": float(edge) / 255.0,
    }


def score(rep: dict, ink_luminance: float | None = None,
          garment_luminance: float | None = None) -> tuple[float, dict]:
    """0-100 and the breakdown. `rep` is a key_cutout report."""
    parts: dict[str, float] = {}

    # Resolution: full marks at 300 PPI, nothing below 200. Capped, so a needlessly huge file earns no
    # more than a correctly-sized one — otherwise the rubric would push every design to the maximum
    # canvas for points it does not deserve.
    ppi = float(rep.get("ppi") or 0.0)
    parts["resolution"] = WEIGHTS["resolution"] * _clamp((ppi - 200.0) / 100.0)

    # Cleanliness: three contamination measures, each with a budget. All are penalties from a full score.
    dirty = (_clamp(float(rep.get("leftover_frac", 0)) / 0.002)
             + _clamp(float(rep.get("holes_frac", 0)) / 0.005)
             + _clamp(float(rep.get("halo_frac", 0)) / 0.5)) / 3.0
    parts["cleanliness"] = WEIGHTS["cleanliness"] * (1.0 - dirty)

    # Composition: ink coverage inside a sane band, and nothing running off the canvas. A design that is
    # 5% ink is a speck on a shirt; one that is 90% is a printed rectangle. 25-70% is where the winners
    # sit, and the term is flat across that range so it cannot be farmed by adding ink.
    op = float(rep.get("opaque_frac", 0))
    if op < 0.25:
        cover = _clamp(op / 0.25)
    elif op > 0.70:
        cover = _clamp((0.95 - op) / 0.25)
    else:
        cover = 1.0
    edge = 1.0 - _clamp(float(rep.get("edge_contact", 0)) / 0.06)
    parts["composition"] = WEIGHTS["composition"] * (0.6 * cover + 0.4 * edge)

    # Contrast: the one thing that decides whether the design is visible on the shirt it ships on. 35 is
    # the floor the image builder already uses before it drops a model shot as unreadable.
    if ink_luminance is None or garment_luminance is None:
        parts["contrast"] = WEIGHTS["contrast"] * 0.5      # unknown, not zero: absence is not a defect
    else:
        parts["contrast"] = WEIGHTS["contrast"] * _clamp(abs(ink_luminance - garment_luminance) / 90.0)

    parts["preference"] = PREF_WEIGHT * _preference(rep.get("features"))
    total = round(sum(parts.values()), 1)
    return total, {k: round(v, 1) for k, v in parts.items()}


def score_file(path_or_bytes, want_in: float, garment_luminance: float | None = None) -> tuple[float, dict]:
    """Measure a finished RGBA print file and score it, without re-running the cut."""
    data = path_or_bytes if isinstance(path_or_bytes, (bytes, bytearray)) else Path(path_or_bytes).read_bytes()
    im = Image.open(io.BytesIO(bytes(data))).convert("RGBA")
    a = np.asarray(im)
    opaque = a[..., 3] > 128
    if not opaque.any():
        return 0.0, {"error": "opak piksel yok"}
    ys, xs = np.nonzero(opaque)
    art = int(max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))
    lum = a[..., :3][opaque].astype(float) @ np.array([0.2126, 0.7152, 0.0722])
    rep = {
        "ppi": art / max(want_in, 0.1),
        "opaque_frac": float(opaque.mean()),
        "edge_contact": max(float(b.mean()) for b in
                            (opaque[:2, :], opaque[-2:, :], opaque[:, :2], opaque[:, -2:])),
        # A finished file has already been cleaned, so contamination is measured as zero here rather than
        # guessed: the cut report is the authority on it and is passed in by the producer.
        "leftover_frac": 0.0, "holes_frac": 0.0, "halo_frac": 0.0,
        # Without this the learned term silently fell back to its neutral default on every real call —
        # the model was wired in and never actually consulted.
        "features": features_of(im),
    }
    return score(rep, float(lum.mean()), garment_luminance)


def main() -> int:
    if len(sys.argv) < 2:
        return int(bool(sys.stderr.write("kullanim: design_score.py <product_id>\n")))
    import psycopg2                                                # noqa: PLC0415
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)
    k = c.cursor()
    k.execute("SELECT slug, print_file, design_params, hero_colorway FROM products WHERE id=%s",
              (int(sys.argv[1]),))
    row = k.fetchone()
    c.close()
    if not row or not row[1]:
        return int(bool(sys.stderr.write("baski dosyasi yok\n")))
    slug, blob, dp, hero = row
    want = pi.print_placement(dp)["inches"]
    total, parts = score_file(bytes(blob), want)
    print(f"{slug}: {total}/100  {parts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
