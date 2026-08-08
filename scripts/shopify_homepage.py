#!/usr/bin/env python3
"""Replace the Radiant demo homepage with our actual store.

The store went live still wearing the theme's sample content: graffiti stock photography,
"Wear your street cred", a repeating @socialmedia-handle marquee, and a "Bestseller" card for
"Midnight Asphalt Contrast oversized tee $68" — a product that does not exist here. Anyone arriving
from an ad would bounce.

Strategy is surgical rather than a rewrite: keep the section and block types the theme already
validates, and swap only the images, copy, collection and links. Every demo image reference is a
hash-named file, so they are matched by pattern and replaced with our own uploads — that also catches
the background images set on groups, which are easy to miss by eye.

A backup of the original template is written next to the script before anything changes.
"""
import json
import os
import re
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"
THEME_ID = "163020308738"

HERO = "shopify://shop_images/klozio-hero-mama.jpg"
CREST = "shopify://shop_images/klozio-crest-worn.jpg"
PRINT = "shopify://shop_images/klozio-print-worn.jpg"

# path suffix -> new settings
TEXT_PATCHES = {
    "text_H46yFc": "<h1>Custom embroidered &amp; graphic tees</h1><p>Comfort Colors&reg; cotton, made "
                   "to order in the USA. Add any name or text &mdash; we stitch or print it exactly as "
                   "you type it.</p>",
    "text_B96CeQ": "<h3>Custom Embroidery</h3>",
    "text_NHBb9V": "<h2>Statement Tees</h2>",
    "text_YaBGG7": "<p>MADE TO ORDER IN THE USA &nbsp;·&nbsp; STITCHED OR PRINTED &nbsp;·&nbsp; "
                   "30-DAY PROMISE &nbsp;·&nbsp; FREE REPLACEMENTS</p>",
    "text_CbX8Vf": "<p>Personalised</p>",
    "text_product_title": "<h5>Custom Character Crest Tee</h5>",
    "text_product_price": "<p>From $21.99</p>",
    "text_eFMntb": "<p>Every shirt here is made after you order it, one at a time. Type a name and we "
                   "stitch or print exactly what you wrote. If anything is wrong we replace it or refund "
                   "you &mdash; and you never have to ship it back.</p>",
}

BUTTON_PATCHES = {
    "button_tBGzW4": ("Shop embroidery", "shopify://collections/custom-embroidery-1"),
    "button_yRN4A4": ("Shop tees", "shopify://collections/statement-tees"),
    "button_rcAMc7": ("Shop now", "shopify://products/h-a1-c8-v1"),
    "button_TmU98M": ("Shop all", "shopify://collections/statement-tees"),
}

IMAGE_PATCHES = {
    "media_with_content_RVymQU": HERO,
    "individual_product_card_theme_install": CREST,
    "section_x8mrnx": PRINT,
}
DEMO_IMAGE = re.compile(r"^shopify://shop_images/[0-9a-f]{24,}\.(png|jpg|jpeg|webp)$")


def token():
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30)
    return r.json()["access_token"]


def patch_node(node, section_id, stats):
    """Walk blocks, applying text/button patches by block id and swapping demo imagery."""
    for bid, b in (node.get("blocks") or {}).items():
        s = b.setdefault("settings", {})
        for suffix, html in TEXT_PATCHES.items():
            if bid.endswith(suffix) or bid == suffix:
                s["text"] = html
                stats["text"] += 1
        for suffix, (label, link) in BUTTON_PATCHES.items():
            if bid.endswith(suffix) or bid == suffix:
                s["label"] = label
                s["link"] = link
                stats["button"] += 1
        for key in ("image", "background_image"):
            val = s.get(key)
            if isinstance(val, str) and DEMO_IMAGE.match(val):
                s[key] = IMAGE_PATCHES.get(section_id, CREST)
                stats["image"] += 1
        patch_node(b, section_id, stats)


def main() -> None:
    head = {"X-Shopify-Access-Token": token()}
    url = f"https://{SHOP}/admin/api/2026-07/themes/{THEME_ID}/assets.json"
    cur = requests.get(url, headers=head, params={"asset[key]": "templates/index.json"}, timeout=40)
    raw = cur.json()["asset"]["value"]
    backup = os.path.join(os.path.dirname(__file__), "index.json.backup")
    with open(backup, "w") as fh:
        fh.write(raw)

    j = json.loads(raw)
    stats = {"text": 0, "button": 0, "image": 0, "collection": 0}
    for sid, sec in j.get("sections", {}).items():
        st = sec.setdefault("settings", {})
        if st.get("collection", "").startswith("asset-pack"):
            st["collection"] = "custom-embroidery-1"
            stats["collection"] += 1
        for key in ("image", "background_image"):
            v = st.get(key)
            if isinstance(v, str) and DEMO_IMAGE.match(v):
                st[key] = IMAGE_PATCHES.get(sid, CREST)
                stats["image"] += 1
        patch_node(sec, sid, stats)

    out = requests.put(url, headers={**head, "Content-Type": "application/json"},
                       json={"asset": {"key": "templates/index.json",
                                       "value": json.dumps(j, ensure_ascii=False)}}, timeout=60)
    print(f"degisiklikler: {stats}")
    print(f"yedek: {backup}")
    print(f"kaydetme: HTTP {out.status_code}" + ("" if out.status_code == 200 else f" {out.text[:200]}"))
    if out.status_code != 200:
        sys.exit(1)


if __name__ == "__main__":
    main()
