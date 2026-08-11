#!/usr/bin/env python3
"""Clean backdrop residue out of print files that were already produced.

The cutout keeps every light area it cannot reach from the border. That rule protects a ribbon
interior and it also keeps the gap between a mascot's legs, the space behind a stack of books and the
counter of an "a" — flat paper that is invisible on Ivory and reads as a dirty patch on rust or
Pepper once the garment's weave modulates it. `local_cutout` now removes both on the way out, but
every product made before that still carries the residue, and it needs no regeneration to fix: the
same two passes run on the stored file.

    python3 scripts/clean_print_files.py                 # report only
    python3 scripts/clean_print_files.py --apply         # write back
    python3 scripts/clean_print_files.py --apply --min-px 2000

Products whose file changes are listed so their listing images can be rebuilt; nothing here touches
images or Etsy.
"""
import argparse
import io
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from batch_runner import drop_background_specks, drop_flat_white_pockets   # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", help="tek slug")
    ap.add_argument("--min-px", type=int, default=500,
                    help="bu kadar pikselden az temizlenirse dosyaya dokunulmaz")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=20)
    cur = conn.cursor()
    q = """SELECT id, slug, print_file FROM products
            WHERE print_file IS NOT NULL AND print_method = 'DTF'"""
    params: list = []
    if a.only:
        q += " AND slug = %s"
        params.append(a.only)
    q += " ORDER BY id"
    cur.execute(q, params)
    rows = cur.fetchall()
    print(f"{len(rows)} DTF baski dosyasi taraniyor"
          f"{'' if a.apply else ' (rapor modu, dosyaya yazilmaz)'}")

    touched, total_px = [], 0
    for pid, slug, blob in rows:
        im = Image.open(io.BytesIO(bytes(blob))).convert("RGBA")
        im, specks = drop_background_specks(im)
        im, pocket_px = drop_flat_white_pockets(im)
        # specks are counted in components, pockets in pixels; the pixel count is what matters here
        if pocket_px < a.min_px and specks == 0:
            continue
        touched.append((slug, specks, pocket_px))
        total_px += pocket_px
        if a.apply and (pocket_px >= a.min_px or specks):
            buf = io.BytesIO()
            im.save(buf, "PNG")
            cur.execute("UPDATE products SET print_file=%s, updated_at=now() WHERE id=%s",
                        (psycopg2.Binary(buf.getvalue()), pid))
            conn.commit()
        print(f"  {slug:<14} leke={specks:<4} cep={pocket_px:>7} px"
              f"{'  YAZILDI' if a.apply else ''}")

    print(f"\n{len(touched)}/{len(rows)} urunde artik bulundu, toplam {total_px} px")
    if touched:
        Path("/tmp/temizlenen_urunler.txt").write_text(
            "\n".join(s for s, _, _ in touched) + "\n")
        print("liste: /tmp/temizlenen_urunler.txt (gorselleri yeniden basilmali)")
    conn.close()


if __name__ == "__main__":
    main()
