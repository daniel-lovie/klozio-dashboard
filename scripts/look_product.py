#!/usr/bin/env python3
"""Hand the agent an actual look at what was produced, as base64 JPEG.

The agent could act on a product and never see it. Asked whether a design was any good it answered,
correctly, that it had no access to the image — which is the same as being unable to do the job, because
every real defect found in this project was found by looking or by measuring.

One rule is baked in rather than left to the caller: a print file is NEVER returned raw. Its background is
transparent, and a viewer paints discarded pixels in whatever colour it likes — that lie produced three
wrong diagnoses in one afternoon. Print files come back flattened onto the garment they will be printed on,
and the response says which one.

    python3 scripts/look_product.py <product_id> [cover|detail|print|emb_render] [--on Pepper]
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys

import psycopg2
from PIL import Image

GARMENTS = {"Ivory": (240, 234, 214), "Pepper": (77, 74, 70), "Black": (28, 28, 28),
            "White": (248, 246, 242), "Bay": (122, 150, 158), "Moss": (107, 114, 80)}
# Anthropic resizes anything larger anyway, and a 3000px print file would be megabytes of base64 for no
# extra detail. 1100 is enough to judge line quality and read a caption.
MAX_SIDE = 1100


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("product_id", type=int)
    ap.add_argument("what", nargs="?", default="cover",
                    choices=["cover", "detail", "print", "emb_render", "model"])
    ap.add_argument("--on", default=None, help="print dosyasini bu kumas renginin uzerine dusur")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=25)
    k = c.cursor()
    k.execute("SELECT slug, hero_colorway, print_file, emb_render FROM products WHERE id=%s", (a.product_id,))
    row = k.fetchone()
    if not row:
        print(json.dumps({"error": f"urun {a.product_id} yok"}))
        return 1
    slug, hero, print_file, emb_render = row

    note = ""
    if a.what in ("print", "emb_render"):
        blob = print_file if a.what == "print" else emb_render
        if not blob:
            print(json.dumps({"error": f"{a.what} yok"}))
            return 1
        im = Image.open(io.BytesIO(bytes(blob))).convert("RGBA")
        garment = a.on or hero or "Ivory"
        rgb = GARMENTS.get(garment, GARMENTS["Ivory"])
        ground = Image.new("RGBA", im.size, rgb + (255,))
        ground.alpha_composite(im)
        im = ground.convert("RGB")
        note = (f"Baski dosyasi {garment} kumas rengi uzerine dusuruldu. Ham dosyanin zemini SEFFAF; "
                f"onu oldugu gibi gormek yaniltir — goruntuleyici atilan pikselleri kendi rengiyle boyar.")
    else:
        role = {"cover": "cover", "detail": "detail", "model": "model"}[a.what]
        k.execute("""SELECT bytes, label FROM product_images
                      WHERE product_id=%s AND role=%s ORDER BY rank LIMIT 1""", (a.product_id, role))
        r = k.fetchone()
        if not r:
            print(json.dumps({"error": f"{a.what} gorseli yok"}))
            return 1
        im = Image.open(io.BytesIO(bytes(r[0]))).convert("RGB")
        note = f"{role} karesi ({r[1] or '-'})"
    c.close()

    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=82, optimize=True)
    print(json.dumps({
        "slug": slug, "what": a.what, "px": list(im.size), "note": note,
        "media_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode(),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
