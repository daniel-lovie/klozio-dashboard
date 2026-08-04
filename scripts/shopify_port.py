#!/usr/bin/env python3
"""Port the product catalog (DB -> Shopify) via GraphQL Admin API.

- Token: client-credentials grant (24h), minted fresh per run.
- Products: productSet (sync <=100 variants, async above) — options Color x Size,
  price = effective (anchor * 0.7), compareAtPrice = anchor (struck-through, Red First pattern).
- Images: stagedUploadsCreate -> S3 POST -> productCreateMedia (order = DB rank).
- Publishing: publishablePublish to the Online Store publication.
- Collections: one custom collection per slot at the end.

Idempotent-ish: skips products whose handle already exists on Shopify.
Run: set -a && source .env && set +a && python3 scripts/shopify_port.py [--only slug] [--limit N]
"""
import argparse, json, os, sys, time
import requests, psycopg2

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"
UP = {"2X": 286, "3X": 572, "4X": 715}  # grossed anchor upcharges (cents)

SLOT_TYPE = {"EMB": "Embroidered Shirt", "EMBH": "Embroidered Hat"}
SLOT_COLL = {"EMB": "Custom Embroidery", "EMBH": "Embroidered Hats",
             "A1": "Statement Tees", "A2": "Statement Tees", "A3": "Statement Tees",
             "B1": "Personalized Gifts", "B2": "Personalized Gifts", "OB": "Statement Tees"}

def mint_token():
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]})
    r.raise_for_status()
    return r.json()["access_token"]

TOKEN = mint_token()

def gql(query, variables=None, retries=3):
    global TOKEN
    for i in range(retries):
        r = requests.post(API, headers={"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"},
                          json={"query": query, "variables": variables or {}})
        if r.status_code == 401:
            TOKEN = mint_token(); continue
        j = r.json()
        if "errors" in j:
            if any("THROTTLED" in str(e) for e in j["errors"]): time.sleep(2.5); continue
            raise RuntimeError(f"gql errors: {json.dumps(j['errors'])[:400]}")
        return j["data"]
    raise RuntimeError("gql retries exhausted")

def find_by_handle(handle):
    d = gql("query($h:String!){ productByIdentifier(identifier:{handle:$h}){ id mediaCount { count } } }", {"h": handle})
    n = d["productByIdentifier"]
    return (n["id"], n["mediaCount"]["count"]) if n else (None, 0)

def eff(cents): return round(cents * 0.7 / 100, 2)

def build_input(p):
    slot = p["slot"] or ""
    colors = p["colorways"] or []
    sizes = p["sizes"] or ["S","M","L","XL","2X","3X","4X"]
    one_size = sizes == ["OS"]
    opts = [{"name": "Color", "position": 1, "values": [{"name": c} for c in colors]}]
    if not one_size:
        opts.append({"name": "Size", "position": 2, "values": [{"name": s} for s in sizes]})
    prefix = "".join(ch for ch in (p["slug"] or "SKU")[:12].upper() if ch.isalnum())
    variants = []
    for c in colors:
        for s in (["OS"] if one_size else sizes):
            anchor = p["price_cents"] + UP.get(s, 0)
            ov = [{"optionName": "Color", "name": c}]
            if not one_size: ov.append({"optionName": "Size", "name": s})
            variants.append({
                "optionValues": ov,
                "price": str(eff(anchor)),
                "compareAtPrice": str(round(anchor / 100, 2)),
                "sku": f"{prefix}-{c.upper().replace(' ','')}-{s}",
                "inventoryPolicy": "CONTINUE",
            })
    desc = "".join(f"<p>{ln}</p>" for ln in (p["description"] or "").split("\n") if ln.strip())
    return {
        "title": p["title"], "handle": p["slug"], "descriptionHtml": desc,
        "vendor": "Klozio", "productType": SLOT_TYPE.get(slot, "Graphic Tee"),
        "tags": (p["tags"] or []) + [slot or "misc", "klozio"],
        "status": "ACTIVE",
        "productOptions": opts, "variants": variants,
    }, len(variants)

PRODUCT_SET = """
mutation ps($input: ProductSetInput!, $sync: Boolean) {
  productSet(input: $input, synchronous: $sync) {
    product { id }
    productSetOperation { id }
    userErrors { field message }
  }
}"""

def product_set(inp, nvars):
    sync = nvars <= 100
    d = gql(PRODUCT_SET, {"input": inp, "sync": sync})
    ps = d["productSet"]
    if ps["userErrors"]: raise RuntimeError(f"productSet: {ps['userErrors'][:3]}")
    if sync: return ps["product"]["id"]
    op = ps["productSetOperation"]["id"]
    for _ in range(60):
        time.sleep(2)
        od = gql("query($id:ID!){ productOperation(id:$id){ status product{ id } ... on ProductSetOperation { userErrors { message } } } }", {"id": op})
        o = od["productOperation"]
        if o["status"] == "COMPLETE":
            if o["userErrors"]: raise RuntimeError(f"async productSet: {o['userErrors'][:3]}")
            return o["product"]["id"]
        if o["status"] == "FAILED": raise RuntimeError(f"async productSet FAILED: {o.get('userErrors')}")
    raise RuntimeError("async productSet timeout")

def staged_upload(filename, mime, blob):
    d = gql("""mutation su($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message } } }""",
      {"input": [{"filename": filename, "mimeType": mime, "httpMethod": "POST", "resource": "IMAGE"}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = [(p["name"], (None, p["value"])) for p in t["parameters"]]
    form.append(("file", (filename, blob, mime)))
    r = requests.post(t["url"], files=form)
    if r.status_code not in (200, 201, 204): raise RuntimeError(f"staged POST {r.status_code}")
    return t["resourceUrl"]

def attach_media(product_id, sources):
    media = [{"originalSource": u, "mediaContentType": "IMAGE"} for u in sources]
    d = gql("""mutation cm($pid: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $pid, media: $media) {
        mediaUserErrors { message } } }""", {"pid": product_id, "media": media})
    errs = d["productCreateMedia"]["mediaUserErrors"]
    if errs: print(f"    media warnings: {errs[:2]}")

def online_store_publication():
    d = gql("query{ publications(first:10){ nodes { id name } } }")
    for n in d["publications"]["nodes"]:
        if "online store" in n["name"].lower(): return n["id"]
    return d["publications"]["nodes"][0]["id"] if d["publications"]["nodes"] else None

def publish(product_id, pub_id):
    gql("""mutation pp($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) { userErrors { message } } }""",
        {"id": product_id, "input": [{"publicationId": pub_id}]})

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only"); ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    conn = psycopg2.connect(os.environ["DATABASE_URL"]); cur = conn.cursor()
    q = """SELECT p.id, p.slug, p.title, p.description, p.tags, p.colorways, p.sizes,
                  p.price_cents, COALESCE(p.slot,'') AS slot
             FROM products p
            WHERE EXISTS (SELECT 1 FROM product_images g WHERE g.product_id=p.id)
              AND p.title IS NOT NULL"""
    params = []
    if a.only: q += " AND p.slug=%s"; params.append(a.only)
    q += " ORDER BY p.slot, p.id"
    if a.limit: q += f" LIMIT {a.limit}"
    cur.execute(q, params or None)
    cols = [c[0] for c in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"{len(rows)} products to port")
    pub = online_store_publication()
    coll_members = {}

    for p in rows:
        try:
            pid, media_n = find_by_handle(p["slug"])
            if pid and media_n > 0:
                coll_members.setdefault(SLOT_COLL.get(p["slot"], "Everything Else"), []).append(pid)
                print(f"{p['slug']}: exists, skip"); continue
            healed = bool(pid)
            nv = 0
            if not pid:
                inp, nv = build_input(p)
                pid = product_set(inp, nv)
            cur.execute("SELECT filename, mime, bytes FROM product_images WHERE product_id=%s ORDER BY rank", (p["id"],))
            sources = []
            for fn, mime, blob in cur.fetchall():
                sources.append(staged_upload(fn or "img.jpg", mime or "image/jpeg", bytes(blob)))
            attach_media(pid, sources)
            if pub: publish(pid, pub)
            coll_members.setdefault(SLOT_COLL.get(p["slot"], "Everything Else"), []).append(pid)
            print(f"{p['slug']}: {'HEALED' if healed else 'OK'} ({nv} variants, {len(sources)} imgs)")
        except Exception as e:
            print(f"{p['slug']}: FAIL {str(e)[:200]}")
        time.sleep(0.4)

    for title, ids in coll_members.items():
        try:
            d = gql("""mutation cc($input: CollectionInput!) {
              collectionCreate(input: $input) { collection { id } userErrors { message } } }""",
                {"input": {"title": title}})
            cid = (d["collectionCreate"]["collection"] or {}).get("id")
            if not cid:
                dd = gql("query($q:String!){ collections(first:1, query:$q){ nodes{ id } } }", {"q": f"title:'{title}'"})
                cid = dd["collections"]["nodes"][0]["id"] if dd["collections"]["nodes"] else None
            if not cid: print(f"collection {title}: no id"); continue
            for i in range(0, len(ids), 50):
                gql("""mutation ca($id: ID!, $pids: [ID!]!) {
                  collectionAddProductsV2(id: $id, productIds: $pids) { userErrors { message } } }""",
                    {"id": cid, "pids": ids[i:i+50]})
            if pub: publish(cid, pub)
            print(f"collection {title}: {len(ids)} products")
        except Exception as e:
            print(f"collection {title}: FAIL {str(e)[:200]}")
    conn.close()
    print("PORT DONE")

if __name__ == "__main__":
    main()
