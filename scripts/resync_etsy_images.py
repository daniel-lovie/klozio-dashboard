#!/usr/bin/env python3
"""Push the current image set to live Etsy listings.

Rebuilding images updates our database. It does not touch Etsy, so a listing that has been live
since before the rebuild still shows whatever went up the day it was published — the old placement,
the old scale, the flat file on an embroidered product, the white halo on a dark shirt. Every fix
made this week is invisible to a buyer until this runs.

Etsy caps a listing at ten images and an active listing refuses to delete its last one, so the
working order is: upload the new set at explicit ranks, then delete whatever old images remain. Doing
it the other way round leaves a window where the listing has no images at all, and Etsy has
deactivated listings for that.

    python3 scripts/resync_etsy_images.py --dry-run
    python3 scripts/resync_etsy_images.py --only h-emb-c9-v1 --apply
    python3 scripts/resync_etsy_images.py --apply
"""
import argparse
import json
import os
import sys
import time
import uuid

import psycopg2
import requests

API = "https://openapi.etsy.com/v3/application"
MAX_IMAGES = 10


def token(cur) -> tuple[str, str]:
    """Etsy rotates the refresh token on every use; persist it or the next run is locked out."""
    cur.execute("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE id=1")
    row = cur.fetchone()
    if not row:
        sys.exit("etsy_tokens bos — once OAuth yapilmali")
    access, refresh, expires = row
    import datetime
    # x-api-key wants the full "keystring:shared_secret"; the OAuth client_id is the keystring only.
    api_key = os.environ["ETSY_API_KEY"]
    client_id = api_key.split(":")[0]
    if expires and expires > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5):
        return access, api_key
    r = requests.post("https://api.etsy.com/v3/public/oauth/token", data={
        "grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh}, timeout=40)
    if r.status_code != 200:
        sys.exit(f"token yenilenemedi {r.status_code}: {r.text[:200]}")
    d = r.json()
    cur.execute("""UPDATE etsy_tokens SET access_token=%s, refresh_token=%s,
                     expires_at=now() + (%s || ' seconds')::interval WHERE id=1""",
                (d["access_token"], d["refresh_token"], d.get("expires_in", 3600)))
    cur.connection.commit()
    return d["access_token"], api_key


def head(access: str, key: str) -> dict:
    return {"Authorization": f"Bearer {access}", "x-api-key": key}


def shop_creds(cur, shop_db_id: int) -> tuple[str, str, str]:
    """Access token, x-api-key and Etsy shop id FOR THAT SHOP.

    There are two Etsy accounts behind this catalogue with a token row each, and a listing belonging
    to one is a 404 through the other's credentials — which reads like a deleted listing and is not.
    Shop 1 falls back to the environment because it predates the shops table.
    """
    cur.execute("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE shop_id=%s",
                (shop_db_id,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"shop {shop_db_id}: etsy token yok")
    access, refresh, expires = row

    cur.execute("SELECT creds FROM shops WHERE id=%s", (shop_db_id,))
    creds = (cur.fetchone() or [{}])[0] or {}
    api_key = creds.get("etsy_api_key")
    secret = creds.get("etsy_shared_secret")
    api_key = f"{api_key}:{secret}" if api_key and secret else os.environ["ETSY_API_KEY"]
    etsy_shop = str(creds.get("etsy_shop_id") or os.environ["ETSY_SHOP_ID"])
    client_id = api_key.split(":")[0]

    import datetime as _dt
    if expires and expires > _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(minutes=5):
        return access, api_key, etsy_shop
    r = requests.post("https://api.etsy.com/v3/public/oauth/token", data={
        "grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh}, timeout=40)
    if r.status_code != 200:
        raise RuntimeError(f"shop {shop_db_id}: token yenilenemedi {r.status_code} {r.text[:150]}")
    d = r.json()
    cur.execute("""UPDATE etsy_tokens SET access_token=%s, refresh_token=%s,
                     expires_at=now() + (%s || ' seconds')::interval WHERE shop_id=%s""",
                (d["access_token"], d["refresh_token"], d.get("expires_in", 3600), shop_db_id))
    cur.connection.commit()
    return d["access_token"], api_key, etsy_shop


def upload(h: dict, shop: str, listing: int, rank: int, name: str, blob: bytes) -> str:
    b = uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="rank"\r\n\r\n{rank}\r\n'.encode(),
             f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
             f'Content-Type: image/jpeg\r\n\r\n'.encode(), blob, f'\r\n--{b}--\r\n'.encode()]
    body = b"".join(parts)
    for attempt in (1, 2, 3):
        r = requests.post(f"{API}/shops/{shop}/listings/{listing}/images", headers={
            **h, "Content-Type": f"multipart/form-data; boundary={b}"}, data=body, timeout=180)
        if r.status_code in (200, 201):
            return "ok"
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(4 * attempt)
            continue
        return f"HTTP {r.status_code} {r.text[:140]}"
    return "tekrar denendi, olmadi"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    # Without this the script sweeps EVERY shop. The Klozio free-shipping tactic is Klozio-only by
    # operator decision (2026-08-16), and pushing HillsByElgin covers as a side effect of it would be
    # a change nobody asked for on a shop with 95 live listings.
    ap.add_argument("--shop", type=int, help="sadece bu shop_id")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=20)
    cur = conn.cursor()

    # The shop is now an ARGUMENT, not a constant. It was hardcoded to 2 with a comment saying Klozio
    # "is being run separately by hand" — which meant the flag added above would have been accepted and
    # silently ignored, and a Klozio run would have pushed HillsByElgin's covers instead. An image push
    # is not a harmless read: it deletes what is on the listing now.
    shop = a.shop if a.shop else 2
    q = """SELECT p.id, p.slug, p.etsy_listing_id, count(g.id), p.shop_id
             FROM products p JOIN product_images g ON g.product_id=p.id
            WHERE p.etsy_listing_id IS NOT NULL AND p.shop_id = %s
              -- Progress has to be recorded or every run starts over. The proxy drops this
              -- connection somewhere around the twentieth listing, so a run that cannot resume
              -- re-uploads the same twenty for ever and never reaches the rest.
              AND (p.etsy_images_synced_at IS NULL
                   OR p.etsy_images_synced_at < (SELECT max(x.created_at) FROM product_images x
                                                  WHERE x.product_id = p.id))
              -- The rank-1 filename test below is a HillsByElgin cover convention. It is kept for that
              -- shop and skipped for any other, because applied to Klozio it matches nothing and the
              -- script would report "0 listings" rather than saying the filter excluded them.
              {cover_filter}"""
    q = q.replace("{cover_filter}", """AND EXISTS (SELECT 1 FROM product_images x
                           WHERE x.product_id=p.id AND x.rank=1
                             AND (x.filename LIKE '%%-ivory-model.jpg'
                                  OR x.filename LIKE '%%-left-model.jpg'))""" if shop == 2 else "")
    params: list = [shop]
    if a.only:
        q += " AND p.slug=%s"
        params.append(a.only)
    q += " GROUP BY 1,2,3,5 ORDER BY p.slug"
    if a.limit:
        q += f" LIMIT {a.limit}"
    cur.execute(q, params or None)
    rows = cur.fetchall()
    print(f"{len(rows)} canli ilan guncellenecek (ilan basina en fazla {MAX_IMAGES} gorsel)\n")
    if not a.apply:
        for pid, slug, listing, n, sid in rows[:15]:
            print(f"  {slug:14} listing={listing}  {min(n, MAX_IMAGES)} gorsel")
        print("\n(--apply verilmedi, Etsy'ye dokunulmadi)")
        return

    ok = fail = 0
    creds: dict = {}
    # Three ways this connection dies, all seen: held open across ten uploads the managed Postgres
    # closes it; fetching all 46 products at once is 300MB through one socket; and a fresh connection
    # per product gets throttled by Railway's TCP proxy after the first. What survives is batches —
    # one connection per five products, opened with backoff, closed before the uploads start.
    BATCH = 5

    def connect_retry(tries: int = 5):
        for i in range(tries):
            try:
                return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20,
                                        keepalives=1, keepalives_idle=20,
                                        keepalives_interval=8, keepalives_count=3)
            except psycopg2.OperationalError:
                if i == tries - 1:
                    raise
                time.sleep(5 * (i + 1))

    shop_ids = {r[4] for r in rows}
    conn.close()

    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        c = connect_retry()
        k = c.cursor()
        # Refresh credentials on every batch, not once at the start. An Etsy access token lives one
        # hour and a full push takes longer, so the tail of the run answers 401 "access token is
        # expired" on listings that were fine — it looks like a permissions problem and is a clock.
        # shop_creds() is a cheap read when the token is still valid and renews it when it is not.
        for sid in shop_ids:
            creds[sid] = shop_creds(k, sid)
        blobs = {}
        for pid, *_ in chunk:
            # role IS NULL is not cosmetic: free_shipping_stamp.py parks the pre-stamp original as a
            # sibling row at rank 9000 so the stamp stays reversible. Uploading it hands Etsy a rank of
            # 9000 and the whole listing fails with "ListingImages must be ordered 1 - 20" — after the
            # real images have already gone up and before the old ones are deleted, which is how a
            # listing ends up with twelve images. Backups are not listing images.
            k.execute("""SELECT rank, filename, bytes FROM product_images
                          WHERE product_id=%s AND (role IS NULL OR role NOT IN ('cover_unstamped'))
                          ORDER BY rank LIMIT %s""", (pid, MAX_IMAGES))
            blobs[pid] = [(r, f, bytes(b)) for r, f, b in k.fetchall()]
        c.close()
        done_ids: list = []

        for pid, slug, listing, n, sid in chunk:
            access, key, shop = creds[sid]
            h = head(access, key)
            wanted = blobs[pid]
            try:
                old = requests.get(f"{API}/listings/{listing}/images", headers=h, timeout=60)
                old_ids = [i["listing_image_id"] for i in old.json().get("results", [])] \
                    if old.status_code == 200 else []
                # New images first: an active listing will not delete its last image, and a listing with
                # none has been deactivated before.
                errs = []
                for rank, fn, blob in wanted:
                    r = upload(h, shop, listing, rank, fn or "img.jpg", bytes(blob))
                    if r != "ok":
                        errs.append(f"r{rank}:{r}")
                # Verify the deletes. This call used to be fired and forgotten, and a delete that
                # answered 429 or 500 left an old image sitting in the listing beside the new set —
                # visible to a buyer, invisible here, and reported as a success. Retry, then say so.
                leftover = []
                for oid in old_ids:
                    gone = False
                    for attempt in (1, 2, 3, 4):
                        d = requests.delete(f"{API}/shops/{shop}/listings/{listing}/images/{oid}",
                                            headers=h, timeout=60)
                        if d.status_code in (200, 204, 404):     # 404 = already gone, which is fine
                            gone = True
                            break
                        if d.status_code == 429 or d.status_code >= 500:
                            time.sleep(3 * attempt)
                            continue
                        break
                    if not gone:
                        leftover.append(oid)
                # A leftover is NOT an upload failure: the new set is on the listing and correct. Counting
                # it as one would send this product round again and add seven more images to a listing
                # that already has them, which is how a listing hits Etsy's twenty-image cap. Record the
                # ids for a delete-only cleanup pass instead.
                if leftover:
                    print(f"  ! {slug:14} eski gorsel silinemedi: {leftover}")
                    with open("/tmp/etsy_leftover_images.txt", "a") as fh:
                        for oid in leftover:
                            fh.write(f"{sid} {listing} {oid}\n")
                if errs:
                    fail += 1
                    print(f"  ✗ {slug:14} {'; '.join(errs)[:150]}")
                else:
                    ok += 1
                    done_ids.append(pid)
                    print(f"  ✓ {slug:14} {len(wanted)} gorsel")
            except Exception as e:
                fail += 1
                print(f"  ✗ {slug:14} {str(e)[:150]}")
            time.sleep(1.0)                     # Etsy rate-limits image upload harder than JSON calls

        # Mark the batch in ONE connection. A connection per marker is exactly what the proxy
        # throttles; the first attempt at this also swallowed the failure, so 91 uploads went out
        # and none were recorded — every round then re-uploaded the same listings and the remaining
        # count never moved.
        if done_ids:
            try:
                m = connect_retry()
                mk = m.cursor()
                mk.execute("UPDATE products SET etsy_images_synced_at=now() WHERE id = ANY(%s)",
                           (done_ids,))
                m.commit()
                m.close()
                print(f"    [{len(done_ids)} ilan isaretlendi]")
            except Exception as e:
                print(f"    UYARI isaretlenemedi, bu parti tekrar yuklenecek: {str(e)[:90]}")

    print(f"\n{ok} guncellendi, {fail} basarisiz")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
