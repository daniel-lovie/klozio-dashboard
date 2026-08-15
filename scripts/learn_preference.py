#!/usr/bin/env python3
"""Turn the votes into a scorer — and say honestly whether they carried any signal.

386 human judgements exist. The question this answers is not "what shall we build with them" but the one
that has to come first: do the things we can MEASURE about a print file predict whether people liked it?
If they do not, a learned scorer is a way of dressing up noise, and design_score's physical rubric is
already the better answer.

Two corrections the raw votes need before anything is fitted:

  PER-RATER NORMALISATION. Accept rates were 68%, 51% and 41%. Summing raw votes lets the most generous
  rater decide the ranking, so each person's votes are centred on their own mean — what is being learned
  is "liked MORE THAN THIS RATER'S AVERAGE", which is comparable across people.

  HONEST VALIDATION. With ~90 rated designs and a handful of features, a model can memorise the set and
  report a beautiful number. Every score below is out-of-fold: the design being predicted was never in
  the data the coefficients came from. An in-sample number here would be a lie with a decimal point.

    python3 scripts/learn_preference.py            # fit, validate, report
    python3 scripts/learn_preference.py --write    # store coefficients for design_score to use
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import design_score                                               # noqa: E402

COEFF_PATH = HERE.parent / "assets" / "preference-model.json"

# What we can measure about a finished print file. Deliberately few: with this many examples, every extra
# feature is another chance to fit the raters' Tuesday rather than their taste.
FEATURES = ["ink_lum", "colourfulness", "colour_count", "coverage", "aspect", "detail"]


def measure(blob: bytes) -> dict | None:
    """One definition, imported. A fitter and a scorer with separate copies of "what a feature is" are
    two different models wearing the same name."""
    return design_score.features_of(Image.open(io.BytesIO(bytes(blob))))


def load_rows() -> tuple[np.ndarray, np.ndarray, list[str]]:
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    # Per-rater centring, done in SQL so the arithmetic is visible rather than buried in a loop.
    k.execute("""
        WITH v AS (
            SELECT f.product_id, f.rater,
                   (f.verdict = 'accepted')::int AS liked
              FROM design_feedback f
              JOIN products p ON p.id = f.product_id
             WHERE f.source = 'operator' AND p.technique <> 'embroidery'),
        m AS (SELECT rater, avg(liked) AS mean FROM v GROUP BY 1),
        s AS (SELECT v.product_id, avg(v.liked - m.mean) AS score, count(*) AS n
                FROM v JOIN m ON m.rater = v.rater GROUP BY 1)
        SELECT s.product_id, s.score, s.n, p.slug, p.print_file
          FROM s JOIN products p ON p.id = s.product_id
         WHERE p.print_file IS NOT NULL AND s.n >= 2
         ORDER BY s.product_id""")
    rows = k.fetchall()
    c.close()

    X, y, slugs = [], [], []
    for _pid, score, _n, slug, blob in rows:
        f = measure(bytes(blob))
        if not f:
            continue
        X.append([f[k2] for k2 in FEATURES])
        y.append(float(score))
        slugs.append(slug)
    return np.array(X), np.array(y), slugs


def fit(X: np.ndarray, y: np.ndarray, ridge: float = 1.0) -> np.ndarray:
    """Ridge regression, closed form. Regularised because six features and ninety rows is not a lot."""
    Xb = np.hstack([X, np.ones((len(X), 1))])
    A = Xb.T @ Xb + ridge * np.eye(Xb.shape[1])
    A[-1, -1] -= ridge                                             # never penalise the intercept
    return np.linalg.solve(A, Xb.T @ y)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    X, y, slugs = load_rows()
    print(f"{len(X)} tasarim, her biri 2+ oy almis, {len(FEATURES)} olculen ozellik\n")
    if len(X) < 40:
        print("cok az veri — model kurmak yerine oy toplamaya devam")
        return 1

    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd

    # Leave-one-out: every prediction comes from coefficients that never saw that design.
    preds = np.zeros(len(Z))
    for i in range(len(Z)):
        m = np.ones(len(Z), bool)
        m[i] = False
        w = fit(Z[m], y[m])
        preds[i] = np.hstack([Z[i], 1.0]) @ w

    # Correlation of out-of-fold prediction with the human score. Spearman on ranks, because what the
    # scorer is for is ORDERING candidates, not predicting a number.
    def rank(v):
        o = v.argsort()
        r = np.empty(len(v))
        r[o] = np.arange(len(v))
        return r
    rp, ry = rank(preds), rank(y)
    rho = float(np.corrcoef(rp, ry)[0, 1])
    # Pairwise accuracy: given two designs, how often does it put the better-liked one on top?
    idx = [(i, j) for i in range(len(y)) for j in range(i + 1, len(y)) if abs(y[i] - y[j]) > 1e-9]
    acc = float(np.mean([(preds[i] > preds[j]) == (y[i] > y[j]) for i, j in idx]))

    # Bootstrap over DESIGNS, not over pairs: the pairs are not independent — 91 designs generate about
    # 4000 of them — so a confidence interval computed on pairs would be far too narrow and would make a
    # coin flip look decisive.
    rng = np.random.default_rng(0)
    boots = []
    for _ in range(400):
        pick = rng.integers(0, len(y), len(y))
        pi_, yi = preds[pick], y[pick]
        pr = [(i, j) for i in range(len(yi)) for j in range(i + 1, len(yi)) if abs(yi[i] - yi[j]) > 1e-9]
        if pr:
            boots.append(np.mean([(pi_[i] > pi_[j]) == (yi[i] > yi[j]) for i, j in pr]))
    lo, hi = (float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))) if boots else (0.0, 1.0)

    print(f"fold disi Spearman  : {rho:+.3f}")
    print(f"ikili siralama dogru: %{acc*100:.1f}  (sans = %50, %95 aralik %{lo*100:.1f}-%{hi*100:.1f})")
    w = fit(Z, y)
    print("\nkatsayilar (standartlastirilmis, isaret = yonu):")
    for name, coef in sorted(zip(FEATURES, w[:-1]), key=lambda t: -abs(t[1])):
        print(f"   {name:14} {coef:+.4f}")

    # The interval, not the point estimate, decides. A 60.6% that could be 49% is not a finding.
    if lo <= 0.52:
        print("\nSONUC: guven araligi sansi iceriyor — bu veriyle ogrenilmis bir skor kurulmaz.")
        print("Nokta tahmini sansin ustunde ama ayirt edilebilir degil; daha cok oy gerekiyor.")
        return 2
    if acc < 0.60:
        print("\nSONUC: bu ozelliklerle begeni tahmin edilemiyor (ikili dogruluk %60 altinda).")
        print("Olculen seyler — parlaklik, doygunluk, kaplama — begeninin surdugu yer degil.")
        print("Skoru degistirme; ya daha cok oy topla ya da KONU/konsept ozelliklerine bak.")
        return 2

    print("\nSONUC: sinyal var. best-of-N secimi bunu kullanabilir.")
    if a.write:
        COEFF_PATH.parent.mkdir(parents=True, exist_ok=True)
        COEFF_PATH.write_text(json.dumps({
            "features": FEATURES, "mean": mu.tolist(), "std": sd.tolist(),
            "weights": w.tolist(), "pairwise_accuracy": round(acc, 4),
            "spearman": round(rho, 4), "n": len(X),
        }, indent=2))
        print(f"katsayilar yazildi: {COEFF_PATH.relative_to(HERE.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
