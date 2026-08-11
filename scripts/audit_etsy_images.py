#!/usr/bin/env python3
"""Find and remove images left behind on live Etsy listings after an image resync.

The resync uploads the new set at explicit ranks 1..N and then deletes the images that were there
before. When one of those deletes fails — 429 under load, or a 5xx — the old image stays in the
listing next to the new set. A buyer sees it; nothing in the logs did. Re-running the resync is the
wrong repair: it uploads another seven images to a listing that already has the right ones and walks
into Etsy's twenty-image cap.

Any image at rank greater than our own image count is by definition not one of ours, because our
upload numbered every image it sent. That is the whole test, and it is exact.

    python3 scripts/audit_etsy_images.py --dry-run
    python3 scripts/audit_etsy_images.py --apply
"""
import argparse
import os
import sys
import time
from pathlib import Path

import psycopg2
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resync_etsy_images import API, shop_creds                      # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--shop", type=int, default=2)
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=25,
                            keepalives=1, keepalives_idle=20)
    cur = conn.cursor()
    cur.execute("""SELECT p.slug, p.etsy_listing_id, p.shop_id, count(g.id)
                     FROM products p JOIN product_images g ON g.product_id = p.id
                    WHERE p.etsy_listing_id IS NOT NULL AND p.shop_id = %s
                    GROUP BY 1,2,3 ORDER BY p.slug""", (a.shop,))
    rows = cur.fetchall()

    creds: dict = {}
    stale = clean = 0
    for slug, listing, sid, mine in rows:
        if sid not in creds:
            creds[sid] = shop_creds(cur, sid)
        access, key, shop = creds[sid]
        h = {"Authorization": f"Bearer {access}", "x-api-key": key}
        r = requests.get(f"{API}/listings/{listing}/images", headers=h, timeout=60)
        if r.status_code != 200:
            print(f"  ? {slug:14} listeleme basarisiz HTTP {r.status_code}")
            continue
        imgs = r.json().get("results", [])
        extra = [i for i in imgs if int(i.get("rank") or 0) > mine]
        if not extra:
            continue
        stale += 1
        print(f"  {slug:14} Etsy'de {len(imgs)}, bizde {mine} -> fazla {len(extra)} "
              f"(rank {[i.get('rank') for i in extra]})")
        if not a.apply:
            continue
        for i in extra:
            d = requests.delete(
                f"{API}/shops/{shop}/listings/{listing}/images/{i['listing_image_id']}",
                headers=h, timeout=60)
            if d.status_code in (200, 204, 404):
                clean += 1
            else:
                print(f"    silinemedi {i['listing_image_id']}: HTTP {d.status_code}")
            time.sleep(0.4)
        time.sleep(0.4)

    print(f"\n{len(rows)} ilan tarandi, {stale} ilanda fazla gorsel var"
          + (f", {clean} gorsel silindi" if a.apply else " (--apply verilmedi)"))
    conn.close()


if __name__ == "__main__":
    main()
