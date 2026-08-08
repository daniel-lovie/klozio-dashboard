#!/usr/bin/env python3
"""Re-shoot every embroidery product at the placement we actually stitch, in several colourways.

Two reasons this exists:

1. The listing images for the older products were AI-rendered product scenes, and the newer ones were
   rendered by Printful at DTG `front` — a big centred print. We fulfil `embroidery_chest_left`: a
   4-inch badge. Showing one and shipping the other is the complaint we would deserve. Printful will
   render the true placement if you ask for technique=embroidery, so there is no reason not to.

2. Mockups are free. A buyer deciding on a $50 stitched tee wants to see it in the colour they would
   wear, and the five here cover dark, mid and light garments.

The artwork comes from products.print_file over the signed /api/pf-file endpoint, so what Printful
renders is byte-for-byte the file the digitiser receives — not a copy on disk that may have drifted.
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import requests

PF = "https://api.printful.com"
PF_HEAD = {"User-Agent": "klozio/1.0"}
CC1717 = 586
STORE_ID = "18561101"
PUBLIC_BASE = os.environ.get("PUBLIC_BASE_URL", "https://web-production-c9b31.up.railway.app")

# L-size variant ids; Printful renders the colourway, size only picks the garment photo.
COLORWAYS = [("Pepper", 17695), ("Black", 15116), ("True Navy", 15183),
             ("Ivory", 16525), ("Moss", 17703)]
# 1200x1200 @300dpi is what /mockup-generator/printfiles reports for chest left on this garment.
AREA = {"embroidery_chest_left": (1200, 1200), "embroidery_chest_center": (1200, 1200),
        "embroidery_large_center": (3000, 1800)}
OUT_ROOT = Path("/Users/omer/Documents/code/etsy/pipeline/reshoot")


def pf_file_url(product_id: int) -> str:
    secret = os.environ.get("PRINTFUL_FILE_SECRET") or os.environ.get("PRINTFUL_API_KEY", "")
    sig = hmac.new(secret.encode(), f"pf-file:{product_id}".encode(), hashlib.sha256).hexdigest()
    return f"{PUBLIC_BASE}/api/pf-file/{product_id}?sig={sig}"


def head(store_id: str = STORE_ID) -> dict:
    return dict(PF_HEAD, Authorization=f"Bearer {os.environ['PRINTFUL_API_KEY']}",
                **{"X-PF-Store-Id": store_id})


def shoot(image_url: str, placement: str, variant_ids: list[int], out_dir: Path,
          option_groups: list[str]) -> list[Path]:
    w, h = AREA.get(placement, (1800, 2400))
    body = {"variant_ids": variant_ids, "format": "jpg", "technique": "embroidery",
            "option_groups": option_groups,
            "files": [{"placement": placement, "image_url": image_url,
                       "position": {"area_width": w, "area_height": h,
                                    "width": w, "height": h, "top": 0, "left": 0}}]}
    r = requests.post(f"{PF}/mockup-generator/create-task/{CC1717}", headers=head(),
                      json=body, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"create-task {r.status_code}: {r.text[:220]}")
    key = r.json()["result"]["task_key"]
    for _ in range(50):
        time.sleep(3)
        st = requests.get(f"{PF}/mockup-generator/task", headers=head(),
                          params={"task_key": key}, timeout=60).json()["result"]
        if st["status"] == "completed":
            break
        if st["status"] == "failed":
            raise RuntimeError(f"mockup failed: {json.dumps(st)[:220]}")
    else:
        raise RuntimeError("mockup timed out")

    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    by_variant = {v: c for c, v in COLORWAYS}
    for m in st["mockups"]:
        colour = by_variant.get((m.get("variant_ids") or [0])[0], "colour")
        entries = [("Default", m["placement"], m["mockup_url"])]
        entries += [(e.get("option_group") or "Default", e.get("title") or "extra", e["url"])
                    for e in m.get("extra", [])]
        for group, title, url in entries:
            name = re.sub(r"[^a-z0-9]+", "-", f"{colour} {group} {title}".lower()).strip("-")
            p = out_dir / f"{name}.jpg"
            p.write_bytes(requests.get(url, timeout=120).content)
            saved.append(p)
    return saved


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", help="comma separated; default every embroidery tee in shop 2")
    ap.add_argument("--colourways", type=int, default=len(COLORWAYS))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    if a.slugs:
        cur.execute("SELECT id, slug, printful_placement, blank FROM products WHERE slug = ANY(%s)",
                    (a.slugs.split(","),))
    else:
        cur.execute("""SELECT id, slug, printful_placement, blank FROM products
                        WHERE technique='embroidery' AND shop_id=2 AND blank NOT ILIKE '%%hat%%'
                          AND print_file IS NOT NULL ORDER BY slug""")
    rows = cur.fetchall()
    variants = [v for _, v in COLORWAYS[:a.colourways]]
    print(f"{len(rows)} urun x {len(variants)} renk  (Printful mockup: ucretsiz)\n")

    failed = []
    for pid, slug, placement, blank in rows:
        placement = placement or "embroidery_chest_left"
        out = OUT_ROOT / slug
        if a.dry_run:
            print(f"  {slug:14} {placement:24} -> {out}")
            continue
        try:
            shots = shoot(pf_file_url(pid), placement, variants, out, ["Men's", "Women's"])
            print(f"  ✓ {slug:14} {placement:24} {len(shots):3} kare -> {out}")
        except Exception as e:
            failed.append((slug, str(e)[:160]))
            print(f"  ✗ {slug:14} {str(e)[:150]}")

    if failed:
        print(f"\n{len(failed)} urun cekilemedi:")
        for s, e in failed:
            print(f"  {s}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
