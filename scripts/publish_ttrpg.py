#!/usr/bin/env python3
"""Attach the image set to each TTRPG product and queue it for publishing.

Image order matters on Etsy: rank 1 is the cover and it is what people judge in search results, so
each listing leads with a cover built by make_cover.py (text inside the safe zone), then the two
photographs, then the explainer cards, then the shared colour chart.

The embroidered and printed pairs deliberately get different photographs and different cards — the
embroidery files are drawn in Printful's thread colours and photographed with thread texture, while
the DTF pair keeps the softer palette and a printed look. Showing the wrong pair would misrepresent
the product.

This only queues: a `schedule` row with status='approved' is what the publish endpoint picks up.
"""
import os
import subprocess
import sys
from pathlib import Path

import psycopg2

DIR = Path("/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild")
MOCK = DIR / "mockups"
CARDS = DIR / "cards"
COVERS = DIR / "covers"
CHART = Path("/Users/omer/Documents/code/etsy/assets/comfort-colors-1717-color-chart.jpeg")
MAKE_COVER = Path(__file__).with_name("make_cover.py")

PLAN = {
    "h-emb-c8-v1": dict(
        hero="A_emb_macro", life="A_emb_life",
        banner="REAL EMBROIDERY · NOT A PRINT", strip="COMFORT COLORS 1717 · S-4XL",
        cards=["stitched-not-printed.jpg", "fit-and-care.jpg"],
    ),
    "h-emb-c9-v1": dict(
        hero="B_emb_macro", life="B_emb_life",
        banner="YOUR CHARACTER NAME · STITCHED", strip="COMFORT COLORS 1717 · S-4XL",
        cards=["how-to-personalize.jpg", "stitched-not-printed.jpg", "fit-and-care.jpg"],
    ),
    "h-a1-c7-v1": dict(
        hero="A_dtf_front", life="A_dtf_life",
        banner="D20 CREST TEE · SOFT-HAND PRINT", strip="COMFORT COLORS 1717 · S-4XL",
        cards=["printed-to-last.jpg", "fit-and-care.jpg"],
    ),
    "h-a1-c8-v1": dict(
        hero="B_dtf_front", life="B_dtf_life",
        banner="YOUR CHARACTER NAME · PRINTED", strip="COMFORT COLORS 1717 · S-4XL",
        cards=["how-to-personalize.jpg", "printed-to-last.jpg", "fit-and-care.jpg"],
    ),
}


def build_cover(slug: str, spec: dict) -> Path:
    COVERS.mkdir(parents=True, exist_ok=True)
    src, dst = MOCK / f"{spec['hero']}.png", COVERS / f"{slug}-cover.jpg"
    subprocess.run([sys.executable, str(MAKE_COVER), str(src), str(dst),
                    "--banner", spec["banner"], "--strip", spec["strip"]], check=True,
                   stdout=subprocess.DEVNULL)
    return dst


def main() -> None:
    missing = [f"{s['hero']}/{s['life']}" for s in PLAN.values()
               if not (MOCK / f"{s['hero']}.png").exists() or not (MOCK / f"{s['life']}.png").exists()]
    if missing:
        sys.exit(f"eksik mockup: {missing}")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    for slug, spec in PLAN.items():
        cur.execute("SELECT id FROM products WHERE slug=%s", (slug,))
        row = cur.fetchone()
        if not row:
            print(f"  {slug}: urun yok, atlandi")
            continue
        pid = row[0]

        cover = build_cover(slug, spec)
        images = [(cover, "cover"), (MOCK / f"{spec['hero']}.png", "detail"),
                  (MOCK / f"{spec['life']}.png", "model")]
        images += [(CARDS / c, "trust") for c in spec["cards"]]
        images.append((CHART, "colorway-chart"))

        cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
        for rank, (path, role) in enumerate(images, start=1):
            mime = "image/jpeg" if path.suffix in (".jpg", ".jpeg") else "image/png"
            cur.execute("""INSERT INTO product_images (product_id, rank, role, filename, mime, bytes)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (pid, rank, role, path.name, mime, psycopg2.Binary(path.read_bytes())))

        cur.execute("DELETE FROM schedule WHERE product_id=%s AND status <> 'published'", (pid,))
        cur.execute("""INSERT INTO schedule (product_id, scheduled_at, status, approved_at, approved_by)
                       VALUES (%s, now(), 'approved', now(), 'user-directive')""", (pid,))
        print(f"  ✓ {slug:14} {len(images)} gorsel · yayina kuyruklandi")

    conn.commit()
    cur.execute("""SELECT p.slug, count(i.id), max(s.status)
                     FROM products p
                     LEFT JOIN product_images i ON i.product_id=p.id
                     LEFT JOIN schedule s ON s.product_id=p.id AND s.status='approved'
                    WHERE p.slug = ANY(%s) GROUP BY p.slug ORDER BY p.slug""", (list(PLAN),))
    print("\ndurum:")
    for slug, n, st in cur.fetchall():
        print(f"  {slug:14} gorsel={n} schedule={st}")
    conn.close()


if __name__ == "__main__":
    main()
