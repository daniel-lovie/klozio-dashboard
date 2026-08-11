#!/usr/bin/env python3
"""Remove duplicate Shopify products and draft everything outside the store's niche.

Two problems, both from `shopify_port.py` having no shop filter and no duplicate guard:

- **88 duplicates.** When a handle was already taken the porter let Shopify mint a second product with
  `-1` appended, so the storefront carries two of the same tee. These are deleted.
- **The wrong catalogue.** The Shopify store sells one niche; 188 HillsByElgin products that belong on
  Etsy were published to it. Those are set to DRAFT, not deleted — the decision is reversible and the
  products may yet be wanted here.

A handle ending in `-N` is only a duplicate if no product slug normalises to it. Shopify collapses
repeated hyphens, so the genuine slugs `minimal-outdoors--1` and `pickleball-retro--1` arrive as
`minimal-outdoors-1` and `pickleball-retro-1` — they look exactly like the duplicates and must not be
deleted. That is why the test is against normalised slugs rather than a regex alone.

    python3 scripts/shopify_cleanup.py --dry-run
    python3 scripts/shopify_cleanup.py --apply
"""
import argparse
import os
import re
import sys
import time
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shopify_port import gql                                        # noqa: E402

# The store's own niche. Everything else lives on Etsy.
GAMING_NICHES = {
    "dungeon crawler carl", "tabletop rpg", "rpg", "mmorpg", "fps",
}

# Niche alone is too blunt. `embroidery-custom` is mostly Mama/Dad/name personalisation, but it also
# holds a Dice Tower crest, a Retro FPS rifle and a D20 character crest — gaming products filed under
# the technique that makes them. Drafting those would take real stock off the store, so the title gets
# a vote too.
GAMING_WORDS = re.compile(
    r"\b(d20|dice|tabletop|rpg|dungeon|gamer|gaming|fps|mmo|raid|loot|xp|guild|quest|"
    r"dungeon master|character crest|potion|arcade|respawn|speedrun|achievement)\b", re.I)

DELETE = """mutation($input: ProductDeleteInput!) {
  productDelete(input: $input) { deletedProductId userErrors { field message } } }"""
UPDATE = """mutation($input: ProductInput!) {
  productUpdate(input: $input) { product { id status } userErrors { field message } } }"""


def all_products() -> list:
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        d = gql("{ products(first: 250%s) { pageInfo{hasNextPage endCursor} "
                "edges { node { id handle status } } } }" % after)
        p = d["products"]
        out += [e["node"] for e in p["edges"]]
        if not p["pageInfo"]["hasNextPage"]:
            return out
        cursor = p["pageInfo"]["endCursor"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=25)
    cur = conn.cursor()
    cur.execute("SELECT slug, shop_id, coalesce(niche, ''), coalesce(title, '') FROM products")
    rows = [(s, sh, n, t) for s, sh, n, t in cur.fetchall()]
    by_slug = {s: (sh, n, t) for s, sh, n, t in rows}
    # Shopify's handle rule: repeated hyphens collapse. Map every normalised slug back to the real one.
    norm = {re.sub(r"-+", "-", s): s for s, _, _, _ in rows}

    prods = all_products()
    dupes, drafts, keep, unknown = [], [], [], []
    for p in prods:
        h = p["handle"]
        slug = h if h in by_slug else norm.get(re.sub(r"-+", "-", h))
        if slug is None:
            base = re.sub(r"-+\d+$", "", h)
            if base in by_slug or re.sub(r"-+", "-", base) in norm:
                dupes.append(p)
            else:
                unknown.append(p)
            continue
        niche = by_slug[slug][1].lower()
        title = by_slug[slug][2]
        if niche in GAMING_NICHES or GAMING_WORDS.search(title):
            keep.append((p, slug, niche))
        elif p["status"] != "DRAFT":
            drafts.append((p, slug, niche))

    print(f"Shopify {len(prods)} urun: {len(keep)} gaming (kalir), {len(drafts)} draft'a alinacak, "
          f"{len(dupes)} kopya silinecek, {len(unknown)} taninmayan (dokunulmaz)")
    if unknown:
        print(f"  taninmayan: {[p['handle'] for p in unknown][:8]}")
    if not a.apply:
        print(f"\n  kopya ornek: {[p['handle'] for p in dupes][:6]}")
        print(f"  draft ornek: {[(s, n) for _, s, n in drafts][:6]}")
        print("\n(--apply verilmedi, Shopify'a dokunulmadi)")
        return

    deleted = 0
    for p in dupes:
        d = gql(DELETE, {"input": {"id": p["id"]}})
        errs = d.get("productDelete", {}).get("userErrors") or []
        if errs:
            print(f"  ✗ silinemedi {p['handle']}: {errs}")
        else:
            deleted += 1
        time.sleep(0.3)
    drafted = 0
    for p, slug, niche in drafts:
        d = gql(UPDATE, {"input": {"id": p["id"], "status": "DRAFT"}})
        errs = d.get("productUpdate", {}).get("userErrors") or []
        if errs:
            print(f"  ✗ draft yapilamadi {p['handle']}: {errs}")
        else:
            drafted += 1
        time.sleep(0.3)
    print(f"\n{deleted} kopya silindi, {drafted} urun draft'a alindi, {len(keep)} gaming yayinda")
    conn.close()


if __name__ == "__main__":
    main()
