#!/usr/bin/env python3
"""Rank the rated designs across every rater, and say how much the raters actually agree.

Four people have now voted, and a straight accept-rate ranking would be decided by whichever of them
is most generous: the raw rates are 69%, 68%, 51% and 41%. A design seen mostly by the lenient rater
would outrank a better one seen mostly by the strict one, purely from who happened to open it.

So this fits a Rasch model — one parameter per design, one per rater:

    P(rater r likes design d) = sigmoid(quality_d - threshold_r)

`threshold_r` absorbs leniency, leaving `quality_d` comparable across designs that different people
saw. It is the standard tool for exactly this shape of data (unbalanced overlap, binary judgements)
and it is four lines of gradient descent, not a dependency.

Two things it deliberately reports rather than hides:

  AGREEMENT. If the raters do not agree with each other on the designs they BOTH saw, then no ranking
  built from their votes means anything, however elegant the model. The pairwise agreement table comes
  before the winners list for that reason.

  CONFIDENCE. A design one person liked is not evidence. Every row carries how many raters saw it, and
  the winners list is drawn only from designs with at least two.

    python3 scripts/design_winners.py
    python3 scripts/design_winners.py --write     # write output/design-winners.{md,json}
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2

OUT = Path(__file__).resolve().parent.parent / "output"
MIN_RATERS = 2
L2 = 0.35          # keeps a design seen once from being pushed to +/- infinity


def load():
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""
        SELECT f.rater, f.product_id, p.slug, COALESCE(p.title, ''),
               (f.verdict = 'accepted')::int AS liked
          FROM design_feedback f
          JOIN products p ON p.id = f.product_id
         WHERE f.rater IS NOT NULL AND f.verdict IN ('accepted', 'rejected')""")
    rows = k.fetchall()
    c.close()
    # One vote per (rater, design): a second look is a correction, not a second opinion.
    latest: dict = {}
    meta: dict = {}
    for rater, pid, slug, title, liked in rows:
        latest[(rater, pid)] = liked
        meta[pid] = (slug, title)
    return latest, meta


def rasch(votes: dict, raters: list, designs: list, iters: int = 4000, lr: float = 0.25):
    ri = {r: i for i, r in enumerate(raters)}
    di = {d: i for i, d in enumerate(designs)}
    R = np.array([ri[r] for (r, _d) in votes])
    D = np.array([di[d] for (_r, d) in votes])
    y = np.array(list(votes.values()), dtype=float)

    q = np.zeros(len(designs))
    t = np.zeros(len(raters))
    for _ in range(iters):
        p = 1.0 / (1.0 + np.exp(-(q[D] - t[R])))
        err = y - p
        gq = np.bincount(D, weights=err, minlength=len(designs)) - L2 * q
        gt = -np.bincount(R, weights=err, minlength=len(raters)) - L2 * t
        q += lr * gq / max(1, len(votes) / len(designs))
        t += lr * gt / max(1, len(votes) / len(raters))
    # Thresholds are only meaningful relative to each other; centre them so quality reads as an
    # absolute-ish scale instead of drifting with whoever voted most.
    shift = t.mean()
    return q - shift, t - shift


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    votes, meta = load()
    raters = sorted({r for r, _ in votes})
    designs = sorted({d for _, d in votes})
    seen: dict = {}
    for (r, d), liked in votes.items():
        seen.setdefault(d, {})[r] = liked

    print(f"{len(votes)} oy · {len(raters)} oylayan · {len(designs)} tasarim\n")

    # ---- agreement first: without it the ranking is decoration ----
    print("ORTAK GORULEN TASARIMLARDA UYUM")
    print(f"  {'cift':22} {'ortak':>6} {'uyum':>7}   (sans eseri beklenen)")
    pair_rows = []
    for x, y_ in itertools.combinations(raters, 2):
        both = [(v[x], v[y_]) for v in seen.values() if x in v and y_ in v]
        if not both:
            continue
        agree = sum(1 for p_, q_ in both if p_ == q_) / len(both)
        # Chance agreement given each rater's own accept rate — 60% agreement between two lenient
        # raters can be worth nothing at all.
        px = sum(p_ for p_, _ in both) / len(both)
        py = sum(q_ for _, q_ in both) / len(both)
        chance = px * py + (1 - px) * (1 - py)
        kappa = (agree - chance) / (1 - chance) if chance < 1 else 0.0
        pair_rows.append({"a": x, "b": y_, "n": len(both), "agreement": agree,
                          "chance": chance, "kappa": kappa})
        print(f"  {x + ' / ' + y_:22} {len(both):6} {agree*100:6.0f}%   ({chance*100:.0f}%)  kappa {kappa:+.2f}")

    mean_kappa = float(np.mean([p["kappa"] for p in pair_rows])) if pair_rows else 0.0
    print(f"\n  ortalama kappa {mean_kappa:+.2f} — ", end="")
    print("uyum sans seviyesinde, sirala ma bu oylardan anlam cikmaz" if mean_kappa < 0.10
          else "zayif ama sans ustu uyum" if mean_kappa < 0.25
          else "makul uyum")

    q, t = rasch(votes, raters, designs)
    qi = {d: q[i] for i, d in enumerate(designs)}

    print("\nOYLAYAN eSIKLERI (dusuk = comert)")
    for i, r in enumerate(raters):
        acc = np.mean([v for (rr, _), v in votes.items() if rr == r])
        n = sum(1 for (rr, _) in votes if rr == r)
        print(f"  {r:10} esik {t[i]:+.2f}   ham kabul %{acc*100:.0f}   {n} oy")

    rows = []
    for d in designs:
        v = seen[d]
        slug, title = meta[d]
        rows.append({"product_id": d, "slug": slug, "title": title, "quality": float(qi[d]),
                     "raters": len(v), "likes": sum(v.values()),
                     "voters": {r: int(x) for r, x in sorted(v.items())}})
    rows.sort(key=lambda x: (-x["quality"], -x["raters"]))
    winners = [r for r in rows if r["raters"] >= MIN_RATERS]

    print(f"\nKAZANANLAR (en az {MIN_RATERS} oylayan gormus · {len(winners)} tasarim)\n")
    print(f"  {'#':>3} {'kalite':>7} {'oy':>5}  {'slug':34} begenenler")
    for i, r in enumerate(winners[:25], 1):
        who = ", ".join(k for k, v in r["voters"].items() if v) or "—"
        print(f"  {i:3} {r['quality']:+7.2f} {r['likes']}/{r['raters']:<3} {r['slug'][:34]:34} {who}")

    print(f"\n  ...en dusuk 5:")
    for r in winners[-5:]:
        who = ", ".join(k for k, v in r["voters"].items() if v) or "—"
        print(f"      {r['quality']:+7.2f} {r['likes']}/{r['raters']:<3} {r['slug'][:34]:34} {who}")

    if a.write:
        OUT.mkdir(exist_ok=True)
        (OUT / "design-winners.json").write_text(json.dumps({
            "votes": len(votes), "raters": raters, "designs": len(designs),
            "mean_kappa": mean_kappa,
            "agreement": pair_rows,
            "thresholds": {r: float(t[i]) for i, r in enumerate(raters)},
            "ranking": rows,
        }, indent=2, ensure_ascii=False) + "\n")
        lines = [f"| {i} | {r['quality']:+.2f} | {r['likes']}/{r['raters']} | `{r['slug']}` | "
                 f"{', '.join(k for k, v in r['voters'].items() if v) or '—'} |"
                 for i, r in enumerate(winners, 1)]
        (OUT / "design-winners.md").write_text(
            "# Design winners\n\n"
            f"{len(votes)} votes from {len(raters)} raters over {len(designs)} designs. "
            f"Ranked by a Rasch fit, so a design's score does not depend on which rater happened to "
            f"see it.\n\n"
            f"Mean pairwise kappa **{mean_kappa:+.2f}** — read the agreement table before the ranking.\n\n"
            "| pair | shared | agreement | chance | kappa |\n|---|---|---|---|---|\n"
            + "\n".join(f"| {p['a']} / {p['b']} | {p['n']} | {p['agreement']*100:.0f}% | "
                        f"{p['chance']*100:.0f}% | {p['kappa']:+.2f} |" for p in pair_rows)
            + "\n\n| # | quality | likes | slug | liked by |\n|---|---|---|---|---|\n"
            + "\n".join(lines) + "\n")
        print(f"\nyazildi: {OUT}/design-winners.md · design-winners.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
