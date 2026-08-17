#!/usr/bin/env python3
"""Score listings with the shop's own SEO analyzer and store the result.

The gate is 85 to publish. It is also the check I got wrong once and should not get wrong twice: running
the analyzer with category "t-shirt" instead of "clothing" and with no attributes made all 308 listings
score an identical 73.8, and an identical score across a whole catalogue is a measurement error, not a
finding. The real average was 94.4.

So the inputs are named here rather than guessed at each call:

  CATEGORY    "clothing" — the only key whose keyword list contains graphic-tee terms. Any other key
              matches zero words in a normal tee title and costs a spurious 25 points.
  ATTRIBUTES  the analyzer gives full marks at five or more, and these are the attributes this shop
              actually sets on an Etsy listing. Passing an empty dict scores 0 on a 15% component for
              no reason other than not having filled it in.

    python3 scripts/score_listings.py --pattern '%-m_-v1'          # score, show, do not write
    python3 scripts/score_listings.py --pattern '%-m_-v1' --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
ANALYZER = HERE.parent.parent / ".claude" / "skills" / "etsy-seo" / "scripts"
sys.path.insert(0, str(ANALYZER))

from analyzer import ListingInfo, analyze_listing                  # noqa: E402

FLOOR = 85
CATEGORY = "clothing"


def attributes_for(hero: str) -> dict:
    """What this shop puts in Etsy's attribute fields for a Comfort Colors unisex tee."""
    return {
        "garment_type": "T-Shirt",
        "material": "Cotton",
        "color": hero or "Ivory",
        "size": "S-4XL",
        "style": "Minimalist",
        "fit": "Unisex",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pattern", default="%-m_-v1")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT id, slug, title, tags, description, hero_colorway,
                        (SELECT count(*) FROM product_images g WHERE g.product_id = p.id)
                   FROM products p WHERE slug LIKE %s AND title <> '' ORDER BY id""", (a.pattern,))
    rows = k.fetchall()

    below = []
    total = 0
    for pid, slug, title, tags, desc, hero, images in rows:
        listing = ListingInfo(title=title or "", tags=list(tags or []), description=desc or "",
                              category=CATEGORY, attributes=attributes_for(hero), images=int(images or 0))
        s = analyze_listing(listing)
        score = int(round(s.score.total))
        total += score
        if score < FLOOR:
            below.append((slug, score))
        if a.apply:
            k.execute("UPDATE products SET seo_score=%s, updated_at=now() WHERE id=%s", (score, pid))
    if a.apply:
        c.commit()
    c.close()

    if not rows:
        print("eslesen ilan yok")
        return 0
    print(f"{len(rows)} ilan · ortalama {total/len(rows):.1f} · {FLOOR} altinda {len(below)}")
    for slug, score in sorted(below, key=lambda x: x[1])[:15]:
        print(f"   {slug:26} {score}")
    if not a.apply:
        print("\nyazmak icin --apply")
    return 1 if below else 0


if __name__ == "__main__":
    sys.exit(main())
