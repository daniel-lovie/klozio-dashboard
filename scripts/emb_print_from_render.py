#!/usr/bin/env python3
"""Derive an embroidery product's flat print file FROM its thread render.

An embroidery product needs two pictures of one design: `emb_render` (thread, what the listing shows)
and `print_file` (flat exact thread colours, what the digitiser reads). Generating them separately gives
two different designs — that is how a live listing came to show a wordless family motif while the file
sent to the factory said "mama EMMA NOAH". Two generations of the same description never converge.

Deriving one from the other makes them the same design by construction: snap the render's colours to the
declared thread hexes and the texture collapses into flat fills, which is exactly the spec format.

    python3 scripts/emb_print_from_render.py <slug|id> [--apply]

Without --apply it reports what it would write and saves a flattened preview next to nothing — check the
preview over the garment colour, never the raw RGBA (a viewer ignores alpha and shows the discarded
background, which reads as a defect that is not there).
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import batch_runner as br                                          # noqa: E402


def derive(cur, ident: str, apply: bool, preview: Path | None) -> dict:
    where = "p.id = %s" if ident.isdigit() else "p.slug = %s"
    cur.execute(f"""SELECT p.id, p.slug, p.technique, p.thread_colors, p.emb_render
                      FROM products p WHERE {where}""", (ident,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"{ident}: urun yok")
    pid, slug, technique, threads, render = row
    if technique != "embroidery":
        raise SystemExit(f"{slug}: nakis urunu degil")
    if not render:
        raise SystemExit(f"{slug}: emb_render yok — once make_emb_render.py")
    if not threads:
        raise SystemExit(f"{slug}: thread_colors bos — palet olmadan snap yapilamaz")

    import tempfile
    work = Path(tempfile.mkdtemp(prefix=f"embprint-{slug}-"))
    src = work / "render.png"
    src.write_bytes(bytes(render))
    flat = work / "flat.png"
    br.stage_palette_snap(src, br.hexes(threads), flat)

    im = Image.open(flat).convert("RGBA")
    a = np.array(im)
    mask = a[:, :, 3] > 128
    colours = np.unique(a[mask][:, :3].reshape(-1, 3), axis=0)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1)) if n else np.array([])
    specks = int((sizes < 50).sum())

    if preview is not None:
        bg = Image.new("RGBA", im.size, (242, 238, 225, 255))
        Image.alpha_composite(bg, im).convert("RGB").save(preview, quality=93)

    out = {"slug": slug, "id": pid, "size": list(im.size), "renk_sayisi": len(colours),
           "iplik_sayisi": len(br.hexes(threads)), "kucuk_adacik": specks, "yazildi": False}
    # More colours than threads means the snap did not converge; fewer is fine (a thread may go unused).
    if len(colours) > len(br.hexes(threads)):
        raise SystemExit(f"{slug}: snap tutmadi, {len(colours)} renk kaldi — elle bakilmali")
    if apply:
        data = flat.read_bytes()
        cur.execute("""UPDATE products SET print_file=%s, print_file_name=%s, print_file_w=%s,
                              print_file_h=%s, updated_at=now() WHERE id=%s""",
                    (psycopg2.Binary(data), f"{slug}-print.png", im.width, im.height, pid))
        out["yazildi"] = True
        out["kb"] = len(data) // 1024
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ident", help="slug veya urun id")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--preview", type=Path, help="kumas rengi uzerine duzlestirilmis onizleme dosyasi")
    a = ap.parse_args()
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    cur = conn.cursor()
    res = derive(cur, a.ident, a.apply, a.preview)
    if a.apply:
        conn.commit()
    import json
    print(json.dumps(res, ensure_ascii=False))
    conn.close()


if __name__ == "__main__":
    main()
