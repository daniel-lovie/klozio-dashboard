#!/usr/bin/env python3
"""Load a batch runner's output into product_images, in the order a buyer should see it.

The runner writes files to disk and stops; shopify_port.py and the Etsy publisher both read images
from product_images, so without this step a finished design is invisible to both. That gap is why
19 of the 23 gaming products had no images at all.

Order follows what the live listings already use, and the first slot is the one that matters:

  1  cover          the worn shot with the banner strip
  2  worn front     a plain on-model photo, no overlay
  3  worn alternate a second body/angle so the grid preview has variety
  4  design         the artwork flat, so the detail is legible
  5+ info cards     how-to-personalise, technique, fit and care
  n  colour chart   the shared Comfort Colors swatch

The cover is always a worn shot. A macro of the stitching reads as a sock rather than a shirt and was
rejected once already — `pick_cover` refuses anything that is not from a Men's/Women's option group.
"""
import argparse
import json
import os
import re
from pathlib import Path

import psycopg2

PIPELINE = Path("/Users/omer/Documents/code/etsy/pipeline")
CHART = PIPELINE / "shared" / "comfort-colors-1717-color-chart.jpeg"
# Printful names its on-model groups this way; anything else (flat, zoomed, default) is not a
# worn shot and must not lead the listing.
WORN = re.compile(r"^(men|women)-s-(front|left-front|right|left)(-\d)?\.jpg$")
CARD_ORDER = ["how-to-personalize.jpg", "stitched-not-printed.jpg", "printed-to-last.jpg",
              "fit-and-care.jpg"]


def images_for(design_dir: Path, slug: str) -> list[Path]:
    cover = design_dir / "covers" / f"{slug}-cover.jpg"
    mock = design_dir / "mockups"
    worn = sorted(p for p in mock.glob("*.jpg") if WORN.match(p.name)) if mock.is_dir() else []
    out: list[Path] = []
    if cover.exists():
        out.append(cover)
    out.extend(worn[:3])
    flat = design_dir / "final.png"
    if flat.exists():
        out.append(flat)
    cards = design_dir / "cards"
    if cards.is_dir():
        named = {p.name: p for p in cards.glob("*.jpg")}
        out.extend(named[n] for n in CARD_ORDER if n in named)
    if CHART.exists():
        out.append(CHART)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign", help="pipeline sub-directory, e.g. gaming-01")
    ap.add_argument("--only")
    ap.add_argument("--replace", action="store_true", help="clear existing rows first")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    root = PIPELINE / a.campaign / "designs"
    if not root.is_dir():
        raise SystemExit(f"yok: {root}")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    total = skipped = 0
    for d in sorted(root.iterdir()):
        if not d.is_dir() or (a.only and d.name != a.only):
            continue
        cur.execute("SELECT id FROM products WHERE slug=%s", (d.name,))
        row = cur.fetchone()
        if not row:
            print(f"  {d.name:14} urun satiri yok, atlandi")
            continue
        pid = row[0]
        cur.execute("SELECT count(*) FROM product_images WHERE product_id=%s", (pid,))
        have = cur.fetchone()[0]
        if have and not a.replace:
            skipped += 1
            continue

        files = images_for(d, d.name)
        if not files or not files[0].name.endswith("-cover.jpg"):
            print(f"  {d.name:14} kapak yok, atlandi ({len(files)} dosya)")
            continue
        print(f"  {d.name:14} {len(files):2} gorsel  ilk={files[0].name}")
        if not a.apply:
            continue
        if have:
            cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
        for rank, p in enumerate(files, start=1):
            mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            cur.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (pid, rank, p.name, mime, psycopg2.Binary(p.read_bytes())))
        total += 1

    if a.apply:
        conn.commit()
    print(f"\n{total} urune gorsel yuklendi, {skipped} zaten vardi"
          + ("" if a.apply else "   (--apply verilmedi, yazilmadi)"))


if __name__ == "__main__":
    main()
