#!/usr/bin/env python3
"""Put the digital print files on Shopify as their own products.

Why this is the highest-leverage product in the catalogue, in one line: a $12 digital sale contributes
$11.35 after Shopify fees — the same as a TWO-SHIRT physical order — with no producer, no label, no
shipping, no returns and no lead time.

    basket                contribution
    1 tee                     $6.05
    2 tees (bundle -15%)     $11.50
    1 digital PNG            $11.35     <- no production at all

Today that product exists only on Etsy, where it is a variation on a physical listing that Etsy does
NOT auto-deliver: someone has to send the file by hand. On Shopify it delivers itself. The arrangement
is exactly backwards, and this fixes the half we control.

Deliberately DRAFT, not active. Shopify has no native digital delivery — it needs the free first-party
"Digital Downloads" app, which only a human can install from the admin. Publishing these before that
app is attached would sell a file the buyer never receives, which is worse than not selling it. The
last step is one click and this script prints it.

    python3 scripts/shopify_digital.py            # dry run
    python3 scripts/shopify_digital.py --apply
"""
from __future__ import annotations

import argparse
import os
import re
import sys

import psycopg2
import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"

PRICE = "12.00"
# Etsy sells the same file at $12 after a 30% sale off a $17.14 anchor. Matching the anchor keeps the
# two storefronts telling the same story to a buyer who checks both.
COMPARE_AT = "17.14"
SLUG_PATTERN = "eclipse-%"
COLLECTION = "Digital Downloads"


def token() -> str:
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token",
                      data={"grant_type": "client_credentials",
                            "client_id": os.environ["SHOPIFY_CLIENT_ID"],
                            "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def gq(tok: str, query: str, variables: dict | None = None) -> dict:
    r = requests.post(API, json={"query": query, "variables": variables or {}},
                      headers={"X-Shopify-Access-Token": tok}, timeout=60)
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        raise RuntimeError(body["errors"])
    return body["data"]


PRODUCT_SET = """
mutation ps($input: ProductSetInput!, $sync: Boolean) {
  productSet(input: $input, synchronous: $sync) {
    product { id handle status }
    userErrors { field message }
  }
}
"""


def handle_for(slug: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", f"{slug}-digital-png".lower()).strip("-")


DESC = """<p><strong>Instant digital download.</strong> Nothing ships — the file is delivered to you
straight after checkout.</p>
<p>You receive the print-ready artwork as a transparent PNG at 300 DPI, sized for a standard adult
front print. Use it for your own DTF or heat-transfer printing, or keep it as a digital collectible.</p>
<p>ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my
design process, then refined and prepared for print by hand. All type is hand-set in a licensed font.
Original illustration.</p>
<p><em>Personal use. Please do not resell or redistribute the file itself.</em></p>"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--pattern", default=SLUG_PATTERN)
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT slug, title, hook, tags, print_file_w, print_file_h, print_dpi
                   FROM products
                  WHERE slug LIKE %s AND print_file IS NOT NULL AND title <> ''
                  ORDER BY id""", (a.pattern,))
    rows = k.fetchall()
    c.close()
    if not rows:
        print(f"'{a.pattern}' ile eslesen hazir urun yok", file=sys.stderr)
        return 1

    tok = token()
    existing = gq(tok, '{ products(first:250, query:"tag:digital-download"){ nodes{ handle } } }')
    have = {n["handle"] for n in existing["products"]["nodes"]}

    todo = [r for r in rows if handle_for(r[0]) not in have]
    print(f"{len(rows)} tasarim · {len(todo)} yeni dijital urun · ${PRICE}\n")
    for slug, title, hook, tags, w, h, dpi in todo:
        print(f"  {handle_for(slug):46} {w}x{h}px {dpi}PPI")
    if not todo:
        print("hepsi zaten var.")
        return 0
    if not a.apply:
        print("\nDRY RUN. Uygulamak icin --apply")
        return 0

    made = 0
    for slug, title, hook, tags, w, h, dpi in todo:
        # The physical title sells a shirt; this one has to say "file" in the first words or the buyer
        # believes a garment is coming.
        dtitle = f"Digital PNG — {re.split(r',', title)[0].strip()}"
        inp = {
            "title": dtitle[:255],
            "handle": handle_for(slug),
            "descriptionHtml": DESC,
            "vendor": "Klozio",
            "productType": "Digital Download",
            "tags": list(tags or [])[:10] + ["digital-download", "instant download", "klozio"],
            # Draft until Digital Downloads is installed — see the module docstring.
            "status": "DRAFT",
            # productSet requires every variant to name an option value, so a single-value option is
            # mandatory even for a product with exactly one thing to buy.
            "productOptions": [
                {"name": "Format", "position": 1, "values": [{"name": "Digital PNG"}]}
            ],
            "variants": [{
                "optionValues": [{"optionName": "Format", "name": "Digital PNG"}],
                "price": PRICE,
                "compareAtPrice": COMPARE_AT,
                "sku": f"DPNG-{re.sub(r'[^A-Z0-9]', '', slug.upper())[:16]}",
                "inventoryPolicy": "CONTINUE",
                "taxable": True,
                # The whole point: no parcel, so no shipping, no address step at checkout, no label
                # cost. `requiresShipping` moved off the variant and onto the inventory item in this
                # API version — set on the variant it is rejected outright.
                "inventoryItem": {"requiresShipping": False, "tracked": False},
            }],
        }
        out = gq(tok, PRODUCT_SET, {"input": inp, "sync": True})["productSet"]
        if out.get("userErrors"):
            print(f"  HATA {slug}: {out['userErrors'][:2]}", file=sys.stderr)
            continue
        made += 1
        print(f"  {out['product']['handle']} -> {out['product']['status']}")

    # Read back by WALKING the catalogue, not by searching it. Shopify's product search is eventually
    # consistent: run straight after a write it reported 3 of 16 freshly-created products, which reads
    # as a failure that did not happen. Paging every product is slower and it is the truth.
    page = """query($c:String){ products(first:250, after:$c){ pageInfo{hasNextPage endCursor}
                nodes{ handle status } } }"""
    cur, nodes = None, []
    while True:
        r = gq(tok, page, {"c": cur})["products"]
        nodes += [n for n in r["nodes"] if n["handle"].endswith("-digital-png")]
        if not r["pageInfo"]["hasNextPage"]:
            break
        cur = r["pageInfo"]["endCursor"]
    print(f"\n{made} urun olusturuldu · magazada toplam {len(nodes)} dijital urun "
          f"({sum(1 for n in nodes if n['status']=='DRAFT')} taslak)")
    print("\nSON ADIM (elle, 1 dakika):")
    print("  1. Shopify admin -> Apps -> 'Digital Downloads' uygulamasini kur (Shopify'in kendi, ucretsiz)")
    print("  2. Her urunde 'Add digital file' ile baski PNG'sini yukle")
    print("  3. Urunleri ACTIVE yap")
    print("  Bu adim olmadan yayina alma: alici odeme yapar, dosyayi almaz.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
