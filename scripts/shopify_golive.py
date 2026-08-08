#!/usr/bin/env python3
"""Prepare the Shopify store for going live: policies, pixel, junk cleanup.

Written after deciding to move paid traffic off Etsy. The reason for the move is that on a marketplace
we cannot install a pixel, cannot collect a buyer email and cannot optimise for purchases — so the
pixel install here is the whole point, not a detail.

Policy copy is deliberately honest about made-to-order goods: we refund or replace without asking for
the item back, because return shipping on a $30 tee costs more than the tee and a personalised shirt
cannot be resold anyway. That also makes the guarantee genuinely strong, which is the cheapest
conversion lever available to us.
"""
import json
import os
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"
PIXEL_ID = "908132172350795"

REFUND = """<h2>Our 30-day promise</h2>
<p>Every item is made to order for you, one at a time. If anything is wrong with your order &mdash;
a print or stitching flaw, the wrong size or colour sent, damage in transit, or it simply is not what
the listing showed &mdash; tell us within 30 days of delivery and we will replace it or refund you in
full.</p>
<p><strong>You do not need to ship anything back.</strong> A photo of the problem is enough. Sending a
shirt across the country costs more than the shirt, and we would rather spend that on making it right.</p>
<h2>Personalised items</h2>
<p>Items carrying a name, date or custom text are stitched or printed exactly as typed at checkout, so
they cannot be resold and are not returnable for a change of mind. They are fully covered by the promise
above if we made a mistake or the item arrives faulty. Please double-check spelling before you order
&mdash; we reproduce what you type, including capitalisation.</p>
<h2>Sizing</h2>
<p>Our shirts are unisex and relaxed. If yours does not fit, contact us within 30 days and we will send
a different size once at no charge.</p>
<h2>How to reach us</h2>
<p>Email us with your order number and a photo, and we will answer within one business day.</p>"""

SHIPPING = """<h2>Made to order</h2>
<p>Nothing sits in a warehouse. Each item is produced for your order, which takes <strong>2&ndash;5
business days</strong> before it ships. Embroidered items sit at the longer end of that range because
the design is digitised and stitched.</p>
<h2>Delivery</h2>
<p>Orders ship from the United States with tracking on every parcel. Standard delivery inside the US
typically arrives <strong>3&ndash;5 business days</strong> after it leaves the facility, so most orders
land within about a week of ordering.</p>
<p>You will get a tracking link by email as soon as the parcel is scanned. If tracking has not moved
for five business days, contact us and we will chase it or remake the order.</p>
<h2>Address accuracy</h2>
<p>We ship to the address entered at checkout. If you spot a mistake, email us immediately &mdash; we
can usually correct it before production starts, but once an item is in production we cannot change
where it goes.</p>
<h2>Lost or damaged parcels</h2>
<p>Covered by our 30-day promise. If it does not arrive or arrives damaged, we remake it or refund
you.</p>"""

TERMS = """<h2>Who we are</h2>
<p>This store is operated by HillsByElgin. By placing an order you agree to the terms below.</p>
<h2>Products</h2>
<p>Everything here is printed or embroidered to order. Garment colours can vary slightly between dye
lots, and screens render colour differently from fabric, so a small variation from the product photo is
normal and is not a fault.</p>
<h2>Personalisation</h2>
<p>Custom text is reproduced exactly as you type it, including spelling and capitalisation. We do not
correct or edit what you submit. We may decline personalisation requests that are unlawful, hateful, or
that use a third party's trademark or copyrighted material, and we will refund such orders in full.</p>
<h2>Pricing and payment</h2>
<p>Prices are in US dollars. We may change prices or run promotions at any time; the price you paid at
checkout is the price that applies to your order.</p>
<h2>Cancellations</h2>
<p>Email us as soon as possible. We can cancel an order at no cost before production begins. Once
production has started the 30-day promise in our refund policy applies instead.</p>
<h2>Liability</h2>
<p>Our responsibility for any order is limited to replacing it or refunding what you paid.</p>
<h2>Contact</h2>
<p>Questions about these terms can be sent to the email address on our contact page.</p>"""


def gq(head, query, variables=None):
    r = requests.post(API, headers=head, json={"query": query, "variables": variables or {}}, timeout=45)
    return r.json()


def main() -> None:
    tok = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30).json().get("access_token")
    if not tok:
        sys.exit("shopify token alinamadi")
    head = {"X-Shopify-Access-Token": tok, "Content-Type": "application/json"}

    print("=== politikalar ===")
    for kind, body in (("REFUND_POLICY", REFUND), ("SHIPPING_POLICY", SHIPPING),
                       ("TERMS_OF_SERVICE", TERMS)):
        r = gq(head, """mutation($t:ShopPolicyType!,$b:String!){
                 shopPolicyUpdate(shopPolicy:{type:$t, body:$b}){
                   shopPolicy{type url} userErrors{field message} } }""", {"t": kind, "b": body})
        d = (r.get("data") or {}).get("shopPolicyUpdate") or {}
        errs = d.get("userErrors") or r.get("errors")
        print(f"  {kind:18} {'✓ ' + (d.get('shopPolicy') or {}).get('url','') if not errs else '✗ ' + json.dumps(errs)[:110]}")

    print("\n=== meta web pixel ===")
    r = gq(head, """mutation($s:JSON!){ webPixelCreate(webPixel:{settings:$s}){
             webPixel{id settings} userErrors{field message code} } }""",
           {"s": json.dumps({"pixelId": PIXEL_ID})})
    d = (r.get("data") or {}).get("webPixelCreate") or {}
    print("  ", json.dumps(d.get("userErrors") or d.get("webPixel") or r.get("errors"))[:280])

    print("\n=== tema demo urunlerini sil ===")
    r = gq(head, """{ products(first:30, query:"status:draft"){ nodes{ id handle } } }""")
    for n in (r.get("data", {}).get("products", {}).get("nodes") or []):
        if not n["handle"].startswith("asset-pack"):
            continue    # minimal-outdoors / pickleball are real older products, leave them
        d = gq(head, """mutation($id:ID!){ productDelete(input:{id:$id}){ deletedProductId
                 userErrors{message} } }""", {"id": n["id"]})
        ok = (d.get("data", {}).get("productDelete") or {}).get("deletedProductId")
        print(f"  {'✓' if ok else '✗'} {n['handle'][:40]}")


if __name__ == "__main__":
    main()
