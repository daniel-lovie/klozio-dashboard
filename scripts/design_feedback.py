#!/usr/bin/env python3
"""Keep every judgement made about a design, with the measurements that were true when it was made.

This is the one dataset this shop cannot collect retroactively. Every time the operator says "bu kötü,
yeniden yap", and every time a gate refuses a cut, a labelled example is produced and thrown away. Six
months from now that is the difference between having a house style you can train or score against and
starting from zero.

Two sources, and the cheap one is the automatic one:

  PIPELINE   every cutout attempt writes a row — pass or fail — with the full measured report. A gate
             rejection is a labelled NEGATIVE with its features already attached, for free, and an
             accepted cut is a labelled positive. No human has to do anything.
  OPERATOR   an explicit verdict on a finished design, with a reason in the operator's own words.

Deliberately NOT a status light: unlike joblog, a lost row here is lost training data, so the writer
raises rather than swallowing. It is still never on the path of the work itself — callers decide whether
a logging failure should stop them (produce_product says no; the API says yes).

    python3 scripts/design_feedback.py --init       # create the table
    python3 scripts/design_feedback.py --stats      # what has been collected so far
"""
from __future__ import annotations

import argparse
import json
import os
import sys

DDL = """
CREATE TABLE IF NOT EXISTS design_feedback (
    id            bigserial PRIMARY KEY,
    product_id    bigint      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shop_id       bigint,
    -- 'pipeline' rows are written by the producer, 'operator' rows by a human.
    source        text        NOT NULL CHECK (source IN ('pipeline', 'operator')),
    -- accepted / rejected: the label. 'redo' is a rejection that asked for another attempt.
    verdict       text        NOT NULL CHECK (verdict IN ('accepted', 'rejected', 'redo')),
    -- Which gate refused it, or the operator's own words. This is the part that cannot be recomputed.
    reason        text,
    -- Everything key_cutout measured at that moment: opaque_frac, bg_frac, leftover_frac, holes_frac,
    -- halo_frac, pale_field_frac, edge_contact, art_px. The features, stored WITH the label.
    metrics       jsonb,
    -- The prompt that produced it, so a later pass can learn what wording leads where.
    prompt        text,
    design_model  text,
    attempt       int,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_feedback_product ON design_feedback (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS design_feedback_verdict ON design_feedback (verdict, source);
"""


def _conn():
    import psycopg2                                              # noqa: PLC0415
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15,
                            keepalives=1, keepalives_idle=20)


def record(product_id: int, source: str, verdict: str, reason: str = "",
           metrics: dict | None = None, prompt: str = "", design_model: str = "",
           attempt: int = 1, shop_id: int | None = None) -> None:
    """Write one judgement. Raises — the caller decides whether that is fatal."""
    c = _conn()
    try:
        k = c.cursor()
        k.execute("""INSERT INTO design_feedback
                       (product_id, shop_id, source, verdict, reason, metrics, prompt,
                        design_model, attempt)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                  (product_id, shop_id, source, verdict, reason[:2000],
                   json.dumps(metrics or {}), (prompt or "")[:8000], design_model, attempt))
        c.commit()
    finally:
        c.close()


def record_quietly(**kw) -> None:
    """For the production path: a logging failure must not cost a paid generation."""
    try:
        record(**kw)
    except Exception as e:                                       # noqa: BLE001
        print(f"  UYARI design_feedback yazilamadi: {str(e)[:160]}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", action="store_true")
    ap.add_argument("--stats", action="store_true")
    a = ap.parse_args()

    c = _conn()
    k = c.cursor()
    if a.init:
        k.execute(DDL)
        c.commit()
        print("design_feedback hazir")
    if a.stats or not a.init:
        k.execute("""SELECT source, verdict, count(*) FROM design_feedback
                     GROUP BY 1, 2 ORDER BY 1, 3 DESC""")
        rows = k.fetchall()
        if not rows:
            print("henuz kayit yok")
        for src, verdict, n in rows:
            print(f"  {src:9} {verdict:9} {n:>6}")
        k.execute("SELECT count(DISTINCT product_id) FROM design_feedback")
        print(f"  {k.fetchone()[0]} urun hakkinda karar kayitli")
        # The gate breakdown is the useful half: it says which defect the generator actually produces.
        k.execute("""SELECT split_part(reason, ' ', 1) AS gate, count(*)
                       FROM design_feedback WHERE verdict <> 'accepted' AND source = 'pipeline'
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 8""")
        red = k.fetchall()
        if red:
            print("\n  en sik red sebepleri:")
            for gate, n in red:
                print(f"    {n:>5}  {gate}")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
