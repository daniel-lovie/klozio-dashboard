#!/usr/bin/env python3
"""Make the database say what the print files actually are. Reads bytes; never rewrites a design.

Three columns were describing something other than the file they belong to:

  print_file_w/h  measured the canvas and could disagree with the bytes outright — one row claims
                  3382x3382 for a 2048x2048 file, so it is invisible to both the audit and the upscaler,
                  which select on the column.
  print_dpi       was hardcoded to 300 by the upscaler and inherited by template-clone in stage_seed, so
                  its stored values (293, 301, 318, 323, 431 ...) describe nothing. A 2048x2048 file
                  carries 323.
  design_model    179 of 296 rows say `nano_banana_pro`, but produce_product.py hardcodes gpt_image_2 and
                  always has. This column is what the Etsy AI-disclosure archive cites as proof of
                  authorship, so the archive names a model that did not draw the file.

What gets written is measurement, not judgement: the real pixel size, the real effective PPI at the size
the design prints at, and the model the code actually calls. No image bytes are read for modification and
no file is re-saved — the artwork is exactly what it was.

    python3 scripts/reconcile_print_facts.py            # dry run, prints every disagreement
    python3 scripts/reconcile_print_facts.py --apply
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402
import produce_images as pi                                        # noqa: E402

# The model produce_product.py actually calls, every time, whatever the row says.
REAL_MODEL = br.DEFAULT_MODEL


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT id, slug, print_file, print_file_w, print_file_h, print_dpi,
                        design_params, design_model, technique, etsy_listing_id
                   FROM products WHERE print_file IS NOT NULL ORDER BY id""")
    rows = k.fetchall()

    fixed_size = fixed_dpi = fixed_model = 0
    low = []
    for pid, slug, blob, w, h, dpi, dp, model, tech, etsy in rows:
        try:
            im = Image.open(io.BytesIO(bytes(blob)))
            bb = im.getbbox()
        except Exception as e:                                     # noqa: BLE001
            print(f"  ATLANDI {slug}: dosya okunamadi ({e})", file=sys.stderr)
            continue
        if not bb:
            print(f"  UYARI {slug}: dosyada opak piksel yok", file=sys.stderr)
            continue

        rw, rh = im.size
        art = max(bb[2] - bb[0], bb[3] - bb[1])
        want = pi.print_placement(dp)["inches"]
        ppi = round(art / max(want, 0.1))

        if (w, h) != (rw, rh):
            fixed_size += 1
            print(f"{slug}: boyut {w}x{h} -> {rw}x{rh} (kayit dosyayla uyusmuyordu)")
            if a.apply:
                k.execute("UPDATE products SET print_file_w=%s, print_file_h=%s, updated_at=now() "
                          "WHERE id=%s", (rw, rh, pid))
        if dpi != ppi:
            fixed_dpi += 1
            print(f"{slug}: dpi {dpi} -> {ppi} (cizim {art}px, {want:g} incte)")
            if a.apply:
                k.execute("UPDATE products SET print_dpi=%s, updated_at=now() WHERE id=%s", (ppi, pid))
        # design_model is only wrong where the DTF/print path produced the file; embroidery renders come
        # from a different script and are left alone.
        if tech != "embroidery" and model != REAL_MODEL:
            fixed_model += 1
            if a.apply:
                k.execute("UPDATE products SET design_model=%s, updated_at=now() WHERE id=%s",
                          (REAL_MODEL, pid))
        if ppi < br.PRINT_PPI * 0.95:
            low.append((slug, art, want, ppi, bool(etsy)))

    if a.apply:
        c.commit()
    c.close()

    print(f"\n{len(rows)} baski dosyasi okundu")
    print(f"  boyut kaydi duzeltildi : {fixed_size}")
    print(f"  dpi kaydi duzeltildi   : {fixed_dpi}")
    print(f"  model kaydi duzeltildi : {fixed_model}  (-> {REAL_MODEL})")
    live = sum(1 for x in low if x[4])
    print(f"\n{len(low)} dosya beyan edilen boyutta 300 PPI ALTINDA ({live} tanesi YAYINDA):")
    for slug, art, want, ppi, is_live in sorted(low, key=lambda x: x[3])[:15]:
        print(f"   {slug:28} cizim {art:>5}px  {want:g} inc  {ppi:>3} PPI{'  · YAYINDA' if is_live else ''}")
    if len(low) > 15:
        print(f"   … +{len(low)-15} tane daha")
    print("\nBunlar kayitla duzelmez — dosyada o piksel yok. Tek gercek cozum yeniden uretim (UCRETLI) "
          "ya da baski boyutunu dosyanin tasidigi olcuye cekmek.")
    if not a.apply:
        print("\nuygulamak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
