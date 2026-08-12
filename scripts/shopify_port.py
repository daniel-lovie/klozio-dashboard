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
import re
import requests, psycopg2
from io import BytesIO
from PIL import Image

# Read lazily, not at import: batch_runner.py imports normalize_image() for its Shopify image gate
# and must be able to do that in --dry-run, with no Shopify credentials and no token minted.
# The TARGET store is a property of the shop being ported, not of the environment. Reading it from env
# meant `--shop 2` pushed HillsByElgin's products into Klozio's Shopify store — the shop filter chose whose
# products to send and nothing chose where they landed. Every shop brings its own store; only shop 1 keeps
# the env values, because that is where they came from.
SHOP = os.environ.get("SHOPIFY_STORE_DOMAIN", "")
CLIENT_ID = os.environ.get("SHOPIFY_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("SHOPIFY_CLIENT_SECRET", "")
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"


def configure_store(conn, shop_id: int | None) -> str:
    """Point this run at the store belonging to `shop_id`. Returns the domain."""
    global SHOP, CLIENT_ID, CLIENT_SECRET, API, TOKEN
    if shop_id and shop_id != 1:
        cur = conn.cursor()
        cur.execute("SELECT name, creds FROM shops WHERE id=%s", (shop_id,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"shop {shop_id} yok")
        name, creds = row[0], (row[1] or {})
        dom = creds.get("shopify_domain")
        if not dom:
            raise SystemExit(f"shop {shop_id} ({name}) icin shopify_domain tanimli degil — "
                             "kurulum sihirbazindan ekleyin; env'deki dukkana yazmayacagim")
        SHOP, CLIENT_ID, CLIENT_SECRET = dom, creds.get("shopify_client_id", ""), creds.get("shopify_client_secret", "")
    if not SHOP:
        raise SystemExit("hedef dukkan cozulemedi (SHOPIFY_STORE_DOMAIN veya shops.creds)")
    API = f"https://{SHOP}/admin/api/2026-07/graphql.json"
    TOKEN = None
    return SHOP
UP = {"2X": 286, "3X": 572, "4X": 715}  # grossed anchor upcharges (cents)

SLOT_TYPE = {"EMB": "Embroidered Shirt", "EMBH": "Embroidered Hat"}
SLOT_COLL = {"EMB": "Custom Embroidery", "EMBH": "Embroidered Hats",
             "A1": "Statement Tees", "A2": "Statement Tees", "A3": "Statement Tees",
             "B1": "Personalized Gifts", "B2": "Personalized Gifts", "OB": "Statement Tees"}

# Shopify is the gaming storefront and its collections are the genres, which the product's niche
# names directly — the slot map above predates the channel split and would file a TTRPG tee under
# "Statement Tees". Niche wins when it is a gaming one; slot remains the fallback for the rest.
NICHE_COLL = {"tabletop rpg": "TTRPG", "rpg": "RPG", "fps": "FPS", "mmorpg": "MMORPG"}


def collection_for(p: dict) -> str:
    return NICHE_COLL.get((p.get("niche") or "").lower()) or SLOT_COLL.get(p["slot"], "Everything Else")

def mint_token():
    if not SHOP:
        raise RuntimeError("SHOPIFY_STORE_DOMAIN not set")
    r = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET})
    r.raise_for_status()
    return r.json()["access_token"]

TOKEN = None

def gql(query, variables=None, retries=3):
    global TOKEN
    if TOKEN is None:
        TOKEN = mint_token()
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

def shopify_handle(slug: str) -> str:
    """The handle Shopify will actually store for this slug.

    Shopify collapses repeated hyphens, so our 'minimal-outdoors--1' lives there as
    'minimal-outdoors-1'. Looking it up by the raw slug finds nothing, and the porter then treats a
    product it has already published as missing: it creates a second one, Shopify appends a counter, and
    the storefront gains a duplicate. This is the same normalisation that made 88 real products look like
    copies during the cleanup.
    """
    return re.sub(r"-{2,}", "-", slug.strip().lower())


def find_by_handle(handle):
    for h in dict.fromkeys([handle, shopify_handle(handle)]):     # raw first, normalised as fallback
        d = gql("query($h:String!){ productByIdentifier(identifier:{handle:$h}){ id mediaCount { count } } }", {"h": h})
        n = d["productByIdentifier"]
        if n:
            return (n["id"], n["mediaCount"]["count"])
    return (None, 0)

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
        "title": p["title"], "handle": shopify_handle(p["slug"]), "descriptionHtml": desc,
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

def assert_handle(pid, wanted):
    """Refuse a product Shopify renamed.

    When the requested handle is already taken, Shopify does not fail — it appends `-1` and creates a
    SECOND product. The porter treated that as success, so a lookup that missed for any reason (a
    transient error, a draft the identifier query did not return) silently duplicated the tee on the
    storefront. Eighty-eight of them accumulated before anyone looked. Delete the impostor rather than
    leave it live, and say which handle collided.
    """
    got = gql("query($id:ID!){ product(id:$id){ handle } }", {"id": pid})["product"]["handle"]
    if got == wanted:
        return pid
    gql("""mutation($input: ProductDeleteInput!) { productDelete(input: $input) {
             deletedProductId userErrors { message } } }""", {"input": {"id": pid}})
    raise RuntimeError(f"handle '{wanted}' zaten kullanimda; Shopify '{got}' olarak kopya yaratti, "
                       f"kopya silindi — mevcut urunu --refresh-images ile guncelle")


def product_set(inp, nvars):
    sync = nvars <= 100
    d = gql(PRODUCT_SET, {"input": inp, "sync": sync})
    ps = d["productSet"]
    if ps["userErrors"]: raise RuntimeError(f"productSet: {ps['userErrors'][:3]}")
    if sync: return assert_handle(ps["product"]["id"], inp["handle"]) if inp.get("handle") \
        else ps["product"]["id"]
    op = ps["productSetOperation"]["id"]
    for _ in range(60):
        time.sleep(2)
        od = gql("query($id:ID!){ productOperation(id:$id){ status product{ id } ... on ProductSetOperation { userErrors { message } } } }", {"id": op})
        o = od["productOperation"]
        if o["status"] == "COMPLETE":
            if o["userErrors"]: raise RuntimeError(f"async productSet: {o['userErrors'][:3]}")
            pid = o["product"]["id"]
            return assert_handle(pid, inp["handle"]) if inp.get("handle") else pid
        if o["status"] == "FAILED": raise RuntimeError(f"async productSet FAILED: {o.get('userErrors')}")
    raise RuntimeError("async productSet timeout")


def normalize_image(filename, mime, blob):
    """Shopify caps an image at 20MB and renders nothing above 2048px anyway.

    Our mockups come off the generator as 4096px PNGs — 22-30MB each — which the staged upload
    rejects with EntityTooLarge (a 400 that says nothing about size unless you read the XML body).
    Re-encoding to a 2048px JPEG keeps the visible quality, drops ~95% of the bytes and makes the
    storefront materially faster.
    """
    if mime == "image/jpeg" and len(blob) <= 4_000_000:
        return filename, mime, blob
    im = Image.open(BytesIO(blob))
    if im.mode in ("RGBA", "LA", "P"):
        flat = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        flat.paste(im, (0, 0), im)
        im = flat
    else:
        im = im.convert("RGB")
    im.thumbnail((2048, 2048), Image.LANCZOS)
    out = BytesIO()
    im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    name = filename.rsplit(".", 1)[0] + ".jpg"
    return name, "image/jpeg", out.getvalue()

def staged_upload(filename, mime, blob, resource="IMAGE", normalize=True):
    """resource=FILE + normalize=False is how batch_runner.py parks a full-resolution print file in
    Shopify Files: Printful's mockup generator FETCHES the artwork, so it needs a public URL, and it
    needs the real print file rather than a storefront-sized re-encode."""
    if normalize:
        filename, mime, blob = normalize_image(filename, mime, blob)
    d = gql("""mutation su($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message } } }""",
      # fileSize is not optional in practice: without it Google signs a policy that rejects the upload
      # with a bare 400, which reads like a credentials problem but is a content-length mismatch.
      {"input": [{"filename": filename, "mimeType": mime, "httpMethod": "POST", "resource": resource,
                  "fileSize": str(len(blob))}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = [(p["name"], (None, p["value"])) for p in t["parameters"]]
    form.append(("file", (filename, blob, mime)))
    r = requests.post(t["url"], files=form, timeout=120)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f"staged POST {r.status_code}: {r.text[:200]}")
    return t["resourceUrl"]

def attach_media(product_id, sources):
    media = [{"originalSource": u, "mediaContentType": "IMAGE"} for u in sources]
    d = gql("""mutation cm($pid: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $pid, media: $media) {
        mediaUserErrors { message } } }""", {"pid": product_id, "media": media})
    errs = d["productCreateMedia"]["mediaUserErrors"]
    if errs: print(f"    media warnings: {errs[:2]}")

def clear_media(product_id):
    """Drop every image on the product so a refresh replaces rather than appends.

    productCreateMedia only ever adds; without this a re-port leaves the old cover in slot 1 and the
    new one buried at slot 8, which is worse than not refreshing at all.
    """
    d = gql("""query($id:ID!){ product(id:$id){ media(first:50){ nodes{ id } } } }""",
            {"id": product_id})
    ids = [n["id"] for n in (d.get("product") or {}).get("media", {}).get("nodes", [])]
    if not ids:
        return 0
    gql("""mutation dm($pid: ID!, $ids: [ID!]!) {
      productDeleteMedia(productId: $pid, mediaIds: $ids) {
        deletedMediaIds mediaUserErrors { message } } }""", {"pid": product_id, "ids": ids})
    return len(ids)


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
    ap.add_argument("--niche", help="comma separated; only these niches")
    # The store sells one shop's catalogue. Without this filter the porter published every product that
    # had images — 188 of another shop's Etsy-only listings ended up on the storefront.
    ap.add_argument("--shop", type=int, help="only this shop_id (zorunlu degil ama filtresiz cok riskli)")
    # Whose products and which store are two decisions, and they are not always the same shop. The
    # storefront is its own shop row ("Klozio Shopify") while the catalogue on it belongs to the shops
    # that designed it, so the destination has to be nameable on its own — with no default, because a
    # default is how another shop's products end up in the wrong store.
    ap.add_argument("--store-shop", type=int, dest="store_shop",
                    help="hedef dukkanin sahibi olan shop_id (verilmezse --shop'un dukkani)")
    ap.add_argument("--refresh-images", action="store_true", help="replace media on existing products")
    # --refresh-images only swaps the pictures. A design rebuild usually changes the copy and sometimes
    # the price too, and leaving those behind produces a storefront that is half updated in a way nobody
    # can see. --refresh-all pushes the product itself (title, description, options, variant prices) and
    # then the media.
    ap.add_argument("--refresh-all", action="store_true", dest="refresh_all",
                    help="mevcut urunde basligi/aciklamayi/fiyati da guncelle, sonra gorselleri")
    # "Update the store" and "publish the catalogue" are different jobs. Without a way to name exactly
    # what is already on the storefront, a refresh run also CREATES every product that is not there yet —
    # which is how 188 Etsy-only listings once appeared on it.
    ap.add_argument("--slugs-file", dest="slugs_file",
                    help="sadece bu dosyadaki slug'lar (satir basina bir slug)")
    a = ap.parse_args()
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=20,
                            keepalives_interval=8, keepalives_count=3); cur = conn.cursor()
    # Resolve the destination BEFORE reading products: whose catalogue and which store are one decision.
    target = a.store_shop or a.shop
    print(f"hedef dukkan: {configure_store(conn, target)}"
          f"  (kimin urunleri: {('shop ' + str(a.shop)) if a.shop else 'FILTRESIZ'}"
          f" | dukkan sahibi: {('shop ' + str(target)) if target else 'env'})")
    q = """SELECT p.id, p.slug, p.title, p.description, p.tags, p.colorways, p.sizes,
                  p.price_cents, COALESCE(p.slot,'') AS slot, COALESCE(p.niche,'') AS niche
             FROM products p
            WHERE EXISTS (SELECT 1 FROM product_images g WHERE g.product_id=p.id)
              AND p.title IS NOT NULL"""
    params = []
    if a.only: q += " AND p.slug=%s"; params.append(a.only)
    if a.slugs_file:
        wanted = [l.strip() for l in open(a.slugs_file) if l.strip()]
        if not wanted:
            raise SystemExit(f"{a.slugs_file} bos")
        q += " AND p.slug = ANY(%s)"; params.append(wanted)
        print(f"slug listesi: {len(wanted)} slug ({a.slugs_file})")
    if a.niche: q += " AND p.niche = ANY(%s)"; params.append(a.niche.split(","))
    if a.shop: q += " AND p.shop_id = %s"; params.append(a.shop)
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
            if pid and media_n > 0 and not (a.refresh_images or a.refresh_all):
                coll_members.setdefault(collection_for(p), []).append(pid)
                print(f"{p['slug']}: exists, skip"); continue
            if pid and a.refresh_all:
                inp, nv = build_input(p)
                inp["id"] = pid                      # id = update this product, not create another
                product_set(inp, nv)
                n = clear_media(pid)
                cur.execute("SELECT filename, mime, bytes FROM product_images WHERE product_id=%s ORDER BY rank",
                            (p["id"],))
                srcs = [staged_upload(fn or "img.jpg", mime or "image/jpeg", bytes(blob))
                        for fn, mime, blob in cur.fetchall()]
                attach_media(pid, srcs)
                coll_members.setdefault(collection_for(p), []).append(pid)
                print(f"{p['slug']}: TAM GUNCELLENDI (metin+fiyat, {n} eski -> {len(srcs)} yeni gorsel)")
                time.sleep(0.4)
                continue
            if pid and a.refresh_images:
                n = clear_media(pid)
                cur.execute("SELECT filename, mime, bytes FROM product_images WHERE product_id=%s ORDER BY rank",
                            (p["id"],))
                srcs = [staged_upload(fn or "img.jpg", mime or "image/jpeg", bytes(blob))
                        for fn, mime, blob in cur.fetchall()]
                attach_media(pid, srcs)
                coll_members.setdefault(collection_for(p), []).append(pid)
                print(f"{p['slug']}: GORSELLER YENILENDI ({n} -> {len(srcs)})")
                time.sleep(0.4)
                continue
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
            coll_members.setdefault(collection_for(p), []).append(pid)
            print(f"{p['slug']}: {'HEALED' if healed else 'OK'} ({nv} variants, {len(sources)} imgs)")
        except Exception as e:
            print(f"{p['slug']}: FAIL {str(e)[:200]}")
        time.sleep(0.4)

    for title, ids in coll_members.items():
        try:
            # Look BEFORE creating. Creating first and falling back to a lookup only on failure
            # made a second "TTRPG" every run — collectionCreate happily accepts a duplicate title,
            # and the store ended up with two of every genre, one of them missing from the menu.
            dd = gql("query($q:String!){ collections(first:5, query:$q){ nodes{ id title } } }",
                     {"q": f"title:'{title}'"})
            hit = [n for n in dd["collections"]["nodes"] if n["title"] == title]
            cid = hit[0]["id"] if hit else None
            if not cid:
                d = gql("""mutation cc($input: CollectionInput!) {
                  collectionCreate(input: $input) { collection { id } userErrors { message } } }""",
                    {"input": {"title": title}})
                cid = (d["collectionCreate"]["collection"] or {}).get("id")
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
