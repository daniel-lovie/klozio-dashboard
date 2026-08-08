#!/usr/bin/env python3
"""Stop the homepage claiming we do not print.

"Stitched, not printed" was written when embroidery was the whole shop. It is now wrong twice over:
we sell printed tees, and the row directly beneath the headline shows two of them. The buyer now
chooses the technique on the product page, so the hero should name the choice rather than deny half
the catalogue. The marquee already reads STITCHED OR PRINTED — this brings the headline in line.

Short on purpose: this theme renders the whole hero block at h1 size, so a sentence becomes a wall.
"""
import json
import os
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07"
THEME_ID = "163020308738"

PATCHES = {
    "text_H46yFc": "<h1>Stitched or printed</h1>",
    # same fix in the lower band: it promised stitching for every order
    "text_eFMntb": ("<p>Made after you order it, one at a time. Type a name and we stitch or print "
                    "exactly what you wrote.</p>"),
}


def token() -> str:
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30)
    return r.json()["access_token"]


def patch(node, stats) -> None:
    if isinstance(node, dict):
        for key, val in node.items():
            if isinstance(val, dict) and key in PATCHES and isinstance(val.get("settings"), dict):
                before = val["settings"].get("text", "")
                val["settings"]["text"] = PATCHES[key]
                stats.append((key, before[:60], PATCHES[key][:60]))
            else:
                patch(val, stats)
    elif isinstance(node, list):
        for v in node:
            patch(v, stats)


def main() -> None:
    head = {"X-Shopify-Access-Token": token()}
    url = f"{API}/themes/{THEME_ID}/assets.json"
    raw = requests.get(url, headers=head, params={"asset[key]": "templates/index.json"},
                       timeout=40).json()["asset"]["value"]
    j = json.loads(raw)
    stats: list = []
    patch(j["sections"], stats)
    for key, before, after in stats:
        print(f"  {key}\n     once : {before}\n     sonra: {after}")
    if not stats:
        sys.exit("hicbir blok bulunamadi — blok id degismis olabilir")

    r = requests.put(url, headers={**head, "Content-Type": "application/json"},
                     json={"asset": {"key": "templates/index.json",
                                     "value": json.dumps(j, ensure_ascii=False)}}, timeout=60)
    print(f"\nkaydetme: HTTP {r.status_code} {'' if r.status_code == 200 else r.text[:200]}")
    left = json.dumps(j).count("not printed")
    print(f"kalan 'not printed' ifadesi: {left}")
    if r.status_code != 200 or left:
        sys.exit(1)


if __name__ == "__main__":
    main()
