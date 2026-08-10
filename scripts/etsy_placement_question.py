#!/usr/bin/env python3
"""Ask the buyer where the embroidery goes, in the personalisation field.

Placement cannot be a variation. Etsy allows exactly two variation properties and both are spent on
Size and Colour, and adding an option on Shopify regenerates every variant id, which breaks the
fulfilment mapping the operator set up by hand. The personalisation field is the one place a third
choice fits on both platforms without touching variants.

Every embroidered tee gets the placement question. Products that also carry a name get it as a second
question — Etsy supports multiple personalisation questions, but only when the write includes
`supports_multiple_personalization_questions=true`, which is why our own publisher already passes it.

    python3 scripts/etsy_placement_question.py --dry-run
    python3 scripts/etsy_placement_question.py --apply
"""
import argparse
import datetime
import os
import sys
import time

import psycopg2
import requests

API = "https://openapi.etsy.com/v3/application"

PLACEMENT_Q = "Placement"
# Etsy validates this text twice over and rejects the whole write on either: 120 characters maximum,
# and no more than one word in block capitals. "Type LEFT ... or CENTRE ..." fails the second — the
# emphasis has to come from wording rather than caps.
PLACEMENT_TEXT = ('Where should it be stitched? Answer "left chest" for a 4 inch badge, '
                  'or "centre" for a 6 inch crest.')
NAME_TEXT = "Name as you want it stitched, up to 14 characters. Reproduced exactly as typed."
MAXLEN = 120


def token(cur) -> tuple[str, str]:
    cur.execute("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE id=1")
    row = cur.fetchone()
    if not row:
        sys.exit("etsy_tokens bos")
    access, refresh, expires = row
    # ETSY_API_KEY is "keystring:shared_secret". The OAuth client_id is the keystring alone, but the
    # x-api-key header wants the whole thing — sending only the keystring answers 403 "Shared secret
    # is required", which reads like a permissions problem and is a header-format one.
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


def questions(personalised: bool, name_instructions: str | None) -> list:
    qs = []
    if personalised:
        qs.append({"question_type": "text_input", "question_text": "Personalization",
                   "instructions": ((name_instructions or NAME_TEXT)[:MAXLEN]),
                   "required": True, "max_allowed_characters": 64})
    qs.append({"question_type": "text_input", "question_text": PLACEMENT_Q,
               "instructions": PLACEMENT_TEXT[:MAXLEN], "required": False,
               "max_allowed_characters": 32})
    return qs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only")
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=20)
    cur = conn.cursor()

    q = """SELECT slug, etsy_listing_id, personalised, personalization_instructions, shop_id
             FROM products
            WHERE technique='embroidery' AND etsy_listing_id IS NOT NULL
              AND shop_id = 2 AND blank NOT ILIKE '%%hat%%'"""
    params: list = []
    if a.only:
        q += " AND slug=%s"
        params.append(a.only)
    cur.execute(q + " ORDER BY slug", params or None)
    rows = cur.fetchall()
    print(f"{len(rows)} nakisli tisort ilaninda yerlesim sorusu kurulacak\n")
    if not a.apply:
        for slug, listing, pers, instr, sid in rows:
            n = 2 if pers else 1
            print(f"  {slug:14} listing={listing}  {n} soru" + ("  (isim + yerlesim)" if pers else "  (yerlesim)"))
        print("\n(--apply verilmedi)")
        return

    ok = fail = 0
    creds: dict = {}
    for slug, listing, pers, instr, sid in rows:
        if sid not in creds:
            creds[sid] = shop_creds(cur, sid)
        access, key, shop = creds[sid]
        head = {"Authorization": f"Bearer {access}", "x-api-key": key,
                "Content-Type": "application/json"}
        # The query flag is mandatory on writes; without it Etsy silently keeps a single question.
        url = (f"{API}/shops/{shop}/listings/{listing}/personalization"
               f"?supports_multiple_personalization_questions=true")
        r = requests.post(url, headers=head,
                          json={"personalization_questions": questions(pers, instr)}, timeout=60)
        if r.status_code in (200, 201):
            ok += 1
            print(f"  ✓ {slug:14} {len(questions(pers, instr))} soru")
        else:
            fail += 1
            print(f"  ✗ {slug:14} HTTP {r.status_code} {r.text[:130]}")
        time.sleep(0.5)
    print(f"\n{ok} kuruldu, {fail} basarisiz")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
