#!/usr/bin/env python3
"""Push the calibrated blank measurements from templates.json into mockup_blanks.

Two placement systems existed. `pipeline/blanks/templates.json` holds the measurements that were
actually calibrated — the print rectangle recovered by diffing a real printed mockup against our blank,
the pixels-per-inch that follows from it, the shoot's tilt, and a shade of 0.03. `mockup_blanks` is what
the deployed producer reads, and it was never given any of that: square quads in the wrong place, no
angle, no scale, and shade 0.85.

So the listing images on the shop were built at twenty-eight times the calibrated fold shading, in a
square area roughly a third too small and offset from the real print position, with the artwork
stretched to fill it. The measurements were right; they were sitting in a file the shipping path never
read.

    python3 scripts/sync_blank_calibration.py --dry-run
    python3 scripts/sync_blank_calibration.py --apply
"""
import argparse
import json
import os
from pathlib import Path

import psycopg2

TEMPLATES = Path("/Users/omer/Documents/code/etsy/pipeline/blanks/templates.json")

DDL = """
ALTER TABLE mockup_blanks ADD COLUMN IF NOT EXISTS print_box jsonb;
ALTER TABLE mockup_blanks ADD COLUMN IF NOT EXISTS px_per_inch real;
ALTER TABLE mockup_blanks ADD COLUMN IF NOT EXISTS angle real DEFAULT 0;
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    tpl = json.loads(TEMPLATES.read_text())
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=25)
    cur = conn.cursor()
    if a.apply:
        cur.execute(DDL)
        conn.commit()

    cur.execute("SELECT name, opacity, shade FROM mockup_blanks ORDER BY name")
    rows = cur.fetchall()
    missing, changed = [], []
    for name, opacity, shade in rows:
        t = tpl.get(name)
        if not t:
            missing.append(name)
            continue
        box = t.get("print_box")
        ppi = t.get("px_per_inch")
        ang = float(t.get("angle", 0.0))
        op = float(t.get("opacity", 0.94))
        sh = float(t.get("shade", 0.03))
        changed.append((name, box, ppi, ang, op, sh, shade))
        if a.apply:
            cur.execute("""UPDATE mockup_blanks
                              SET print_box=%s, px_per_inch=%s, angle=%s, opacity=%s, shade=%s
                            WHERE name=%s""",
                        (json.dumps(box) if box else None, ppi, ang, op, sh, name))

    for name, box, ppi, ang, op, sh, old in changed:
        print(f"  {name:22} box={box} ppi={ppi} angle={ang} shade {old} -> {sh}")
    if missing:
        print(f"\ntemplates.json'da olmayan blank'ler (dokunulmadi): {missing}")
    if a.apply:
        conn.commit()
        print(f"\n{len(changed)} blank guncellendi")
    else:
        print(f"\n{len(changed)} blank guncellenecek (--apply verilmedi)")
    conn.close()


if __name__ == "__main__":
    main()
