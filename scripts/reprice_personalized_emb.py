#!/usr/bin/env python3
"""Reprice PERSONALIZED embroidery: every order carries its own $6.50 digitization fee.

Custom-name embroidery means a new design file per order, so Printful's one-time digitization
is charged EVERY time (verified: CC1717 has no text-embroidery option). At the old anchors the
tee netted $5.71 and the hat LOST $0.85 per order. New anchors:
  personalized EMB  tee  $49.99 -> $59.99  (effective $41.99, net ~$12.05)
  personalized EMBH hat  $35.70 -> $49.99  (effective $34.99, net ~$8.20)
Non-personalized embroidery keeps $49.99 — its design is digitized once.

Updates DB + live Etsy inventory (both shops). Shopify variants handled separately.
"""
import os, sys, time, json
import requests, psycopg2

DB = os.environ["DATABASE_URL"]
NEW = {"EMB": 5999, "EMBH": 4999}
UPCHARGE = {"2X": 286, "3X": 572, "4X": 715}      # anchor cents
SIZE_PROPERTY, SIZE_SCALE, CUSTOM1 = 62809790533, 51, 513
SIZE_VALUE_IDS = {"S": 2137, "M": 2139, "L": 2141, "XL": 2144, "2X": 2147, "3X": 2149, "4X": 2151}

conn = psycopg2.connect(DB); cur = conn.cursor()

def shop_ctx(shop_id):
    cur.execute("SELECT creds FROM shops WHERE id=%s", (shop_id,))
    c = cur.fetchone()[0] or {}
    if shop_id == 1:
        key = os.environ["ETSY_API_KEY"]
        readiness = int(os.environ["ETSY_READINESS_STATE_ID"])
    else:
        key = f"{c['etsy_api_key']}:{c['etsy_shared_secret']}"
        readiness = int(c["etsy_readiness_state_id"])
    cur.execute("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE shop_id=%s", (shop_id,))
    access, refresh, exp = cur.fetchone()
    if exp.timestamp() - time.time() < 300:                       # refresh (rotates!)
        r = requests.post("https://api.etsy.com/v3/public/oauth/token", json={
            "grant_type": "refresh_token", "client_id": key.split(":")[0], "refresh_token": refresh})
        if not r.ok:
            raise RuntimeError(f"shop {shop_id} Etsy token DEAD ({r.status_code}) — "
                               f"reconnect at /api/shops/{shop_id}/etsy/connect")
        j = r.json()
        cur.execute("""UPDATE etsy_tokens SET access_token=%s, refresh_token=%s,
                       expires_at=now()+make_interval(secs=>%s) WHERE shop_id=%s""",
                    (j["access_token"], j["refresh_token"], j["expires_in"], shop_id))
        conn.commit(); access = j["access_token"]
    return {"key": key, "token": access, "readiness": readiness}

def put_inventory(ctx, listing_id, colorways, sizes, price_cents, quantity, sku_prefix):
    products = []
    one_size = sizes == ["OS"]
    for color in colorways:
        for size in (["OS"] if one_size else sizes):
            price = (price_cents + UPCHARGE.get(size, 0)) / 100.0
            pv = [{"property_id": CUSTOM1, "property_name": "Color", "values": [color]}]
            if not one_size:
                pv.append({"property_id": SIZE_PROPERTY, "property_name": "Size",
                           "scale_id": SIZE_SCALE, "value_ids": [SIZE_VALUE_IDS[size]], "values": [size]})
            products.append({
                "sku": f"{sku_prefix}-{color.upper().replace(' ','')}-{size}",
                "property_values": pv,
                "offerings": [{"price": round(price, 2), "quantity": quantity,
                               "is_enabled": True, "readiness_state_id": ctx["readiness"]}],
            })
    body = {"products": products,
            "price_on_property": [] if one_size else [SIZE_PROPERTY],
            "quantity_on_property": [], "sku_on_property": [CUSTOM1] if one_size else [CUSTOM1, SIZE_PROPERTY]}
    r = requests.put(f"https://openapi.etsy.com/v3/application/listings/{listing_id}/inventory",
                     headers={"x-api-key": ctx["key"], "Authorization": f"Bearer {ctx['token']}",
                              "Content-Type": "application/json"},
                     data=json.dumps(body))
    return r.status_code, r.text[:200]

cur.execute("""SELECT id, shop_id, slug, slot, price_cents, colorways, sizes, quantity, etsy_listing_id
                 FROM products
                WHERE COALESCE(technique,'dtf')='embroidery' AND personalised = true
                ORDER BY shop_id, slot, slug""")
rows = cur.fetchall()
print(f"{len(rows)} personalized embroidery products")

ctxs = {}
ok = fail = 0
for pid, shop_id, slug, slot, old_price, colorways, sizes, qty, listing_id in rows:
    new_price = NEW[slot]
    cur.execute("UPDATE products SET price_cents=%s, updated_at=now() WHERE id=%s", (new_price, pid))
    conn.commit()
    if not listing_id:
        print(f"  {slug}: DB {old_price}->{new_price} (Etsy'de degil)"); continue
    if shop_id not in ctxs:
        try: ctxs[shop_id] = shop_ctx(shop_id)
        except Exception as e:
            ctxs[shop_id] = None
            print(f"  !! {e}")
    if ctxs[shop_id] is None:
        print(f"  {slug} (shop {shop_id}): DB {old_price}->{new_price}, Etsy ATLANDI (token yok)")
        fail += 1
        continue
    prefix = "".join(ch for ch in slug[:12].upper() if ch.isalnum())
    code, txt = put_inventory(ctxs[shop_id], listing_id, colorways, sizes, new_price, qty, prefix)
    if code == 200:
        ok += 1; print(f"  {slug} (shop {shop_id}): {old_price}->{new_price} Etsy OK")
    else:
        fail += 1; print(f"  {slug}: ETSY FAIL {code} {txt}")
    time.sleep(0.6)

print(f"DONE ok={ok} fail={fail}")
conn.close()
