#!/usr/bin/env python3
"""Let the buyer pick embroidered or printed, without merging the two products.

The obvious implementation — one product with a third option, Technique — is the wrong one here:
the print variants are already mapped to Printinly and the embroidery ones will be mapped to
Printful, and both mappings are keyed to Shopify variant ids. Adding an option regenerates every
variant, so it would silently break fulfilment on products that are already live.

So the two products stay exactly as they are and are linked to each other with metafields. The
product page renders a Technique row above the variant picker: the current technique as the selected
state, the counterpart as a link carrying its own price. Nothing about variants, SKUs or inventory
moves, and either product can be unpublished without breaking the other (the block hides itself when
the counterpart is missing).

Pairs are by design, not by name: h-emb-c8 and h-a1-c7 are the same laurel d20 artwork stitched and
printed.
"""
import json
import os
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07"
THEME_ID = "163020308738"

# (embroidered handle, printed handle) — same artwork, two techniques
PAIRS = [("h-emb-c8-v1", "h-a1-c7-v1"),
         ("h-emb-c9-v1", "h-a1-c8-v1")]

NS = "custom"
BLOCK_ID = "technique_toggle"

# A product_reference metafield resolves through `.value`, and on this theme it did so on only two
# of the four paired pages - same data, same template, freshly rendered (cf-cache-status: DYNAMIC).
# Rather than keep guessing at that, the pair is stored as a plain handle and looked up through
# all_products, which is a Liquid global with no publication or definition-access subtleties.
LIQUID = """
{%- assign alt_handle = product.metafields.custom.alt_handle -%}
{%- assign mine = product.metafields.custom.technique -%}
{%- assign alt = all_products[alt_handle] -%}
{%- if alt != empty and alt.available and mine != blank -%}
<div class="tt-wrap">
  <div class="tt-head">Technique</div>
  <div class="tt-row">
    <span class="tt-opt tt-on">
      <span class="tt-name">{{ mine }}</span>
      <span class="tt-price">{{ product.price | money }}</span>
    </span>
    <a class="tt-opt" href="{{ alt.url }}">
      <span class="tt-name">{{ alt.metafields.custom.technique }}</span>
      <span class="tt-price">{{ alt.price | money }}</span>
    </a>
  </div>
  <div class="tt-note">
    {%- if mine == 'Embroidered' -%}
      Real thread on the left chest — raised, and nothing to crack or peel.
    {%- else -%}
      Printed large and centred, soft-hand finish that sits in the fabric.
    {%- endif -%}
  </div>
</div>
<style>
  .tt-wrap{margin:0 0 1.25rem}
  .tt-head{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:.5rem}
  .tt-row{display:flex;gap:.6rem;flex-wrap:wrap}
  .tt-opt{flex:1 1 9rem;display:flex;flex-direction:column;gap:.15rem;padding:.7rem .9rem;
    border:1px solid rgba(128,128,128,.45);border-radius:.5rem;text-decoration:none;color:inherit}
  .tt-opt:hover{border-color:currentColor}
  .tt-on{border-width:2px;border-color:currentColor}
  .tt-name{font-weight:600}
  .tt-price{font-size:.9rem;opacity:.75}
  .tt-note{margin-top:.5rem;font-size:.85rem;opacity:.7}
</style>
{%- endif -%}
""".strip()


def token() -> str:
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30)
    return r.json()["access_token"]


def gql(head, query, variables=None):
    r = requests.post(f"{API}/graphql.json", headers=head,
                      json={"query": query, "variables": variables or {}}, timeout=60)
    d = r.json()
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"])[:300])
    return d["data"]


def ensure_definitions(head) -> None:
    """Definitions are what make product_reference resolve to an object in Liquid."""
    for key, name, mtype in (("technique", "Technique", "single_line_text_field"),
                             ("alt_handle", "Other technique handle", "single_line_text_field"),
                             ("alt_technique", "Other technique", "product_reference")):
        d = gql(head, """mutation($d:MetafieldDefinitionInput!){
          metafieldDefinitionCreate(definition:$d){
            createdDefinition{ id } userErrors{ code message } } }""",
                {"d": {"name": name, "namespace": NS, "key": key, "type": mtype,
                       "ownerType": "PRODUCT",
                       "access": {"storefront": "PUBLIC_READ"}}})
        errs = d["metafieldDefinitionCreate"]["userErrors"]
        taken = any(e.get("code") == "TAKEN" for e in errs)
        print(f"  {NS}.{key:14} {'zaten var' if taken else ('✓' if not errs else errs)}")


def product_ids(head, handles: list[str]) -> dict:
    out = {}
    for hd in handles:
        d = gql(head, """query($q:String!){ products(first:1, query:$q){
                 nodes{ id handle status } } }""", {"q": f"handle:{hd}"})
        n = d["products"]["nodes"]
        out[hd] = n[0] if n else None
    return out


def patch_template(head, key: str) -> bool:
    """Insert the toggle above the variant picker.

    Both templates need it: the personalised products (the ones with a name field) render from
    product.personalized.json, so patching only product.json would have shown the choice on exactly
    half the pairs. The variant-picker block id differs per template, so it is found by type.
    """
    url = f"{API}/themes/{THEME_ID}/assets.json"
    got = requests.get(url, headers=head, params={"asset[key]": key}, timeout=40).json()
    if "asset" not in got:
        print(f"  {key}: yok, atlandi")
        return True
    j = json.loads(got["asset"]["value"])
    details = j["sections"]["main"]["blocks"].get("product-details")
    if not details:
        print(f"  {key}: product-details blogu yok, atlandi")
        return True
    blocks = details["blocks"]
    # the setting id comes from blocks/custom-liquid.liquid — it is `custom_liquid`, not `code`,
    # and a wrong key is accepted silently and renders nothing
    blocks[BLOCK_ID] = {"type": "custom-liquid", "settings": {"custom_liquid": LIQUID}}
    order = [b for b in (details.get("block_order") or list(blocks.keys())) if b != BLOCK_ID]
    picker = next((b for b in order if blocks.get(b, {}).get("type") == "variant-picker"), None)
    order.insert(order.index(picker) if picker else len(order), BLOCK_ID)
    details["block_order"] = order
    r = requests.put(url, headers={**head, "Content-Type": "application/json"},
                     json={"asset": {"key": key, "value": json.dumps(j, ensure_ascii=False)}},
                     timeout=60)
    print(f"  {key}: HTTP {r.status_code} {'' if r.status_code == 200 else r.text[:200]}")
    print(f"     {' > '.join(order)}")
    return r.status_code == 200


def main() -> None:
    head = {"X-Shopify-Access-Token": token(), "Content-Type": "application/json"}

    print("=== metafield tanimlari ===")
    ensure_definitions(head)

    print("\n=== urun eslestirme ===")
    handles = [h for pair in PAIRS for h in pair]
    found = product_ids(head, handles)
    missing = [h for h, v in found.items() if not v]
    if missing:
        sys.exit(f"bulunamayan urun: {missing}")

    fields = []
    for emb, dtf in PAIRS:
        fields += [
            {"ownerId": found[emb]["id"], "namespace": NS, "key": "technique",
             "type": "single_line_text_field", "value": "Embroidered"},
            {"ownerId": found[emb]["id"], "namespace": NS, "key": "alt_technique",
             "type": "product_reference", "value": found[dtf]["id"]},
            {"ownerId": found[emb]["id"], "namespace": NS, "key": "alt_handle",
             "type": "single_line_text_field", "value": dtf},
            {"ownerId": found[dtf]["id"], "namespace": NS, "key": "technique",
             "type": "single_line_text_field", "value": "Printed"},
            {"ownerId": found[dtf]["id"], "namespace": NS, "key": "alt_technique",
             "type": "product_reference", "value": found[emb]["id"]},
            {"ownerId": found[dtf]["id"], "namespace": NS, "key": "alt_handle",
             "type": "single_line_text_field", "value": emb},
        ]
    d = gql(head, """mutation($m:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$m){ metafields{ key } userErrors{ field message } } }""",
            {"m": fields})
    errs = d["metafieldsSet"]["userErrors"]
    print(f"  {len(d['metafieldsSet']['metafields'])} alan yazildi" +
          (f", hata: {errs}" if errs else ""))
    for emb, dtf in PAIRS:
        print(f"  {emb} ({found[emb]['status']})  <->  {dtf} ({found[dtf]['status']})")

    print("\n=== urun sayfasi ===")
    ok = all([patch_template(head, "templates/product.json"),
              patch_template(head, "templates/product.personalized.json")])
    if errs or not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
