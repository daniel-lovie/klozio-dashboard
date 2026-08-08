#!/usr/bin/env python3
"""Replace the crest listings' first two photos with the versions that show a name in the ribbon.

Why: the listings went live with an empty banner. On a personalised product the strongest signal is
seeing a name where your name will go, and the print file now carries that token anyway — leaving an
empty ribbon in the photos makes the product look like a plain badge tee.

Order of operations matters on Etsy: uploading at rank 1 INSERTS and pushes everything down, so the
old images are deleted afterwards by id rather than by rank.
"""
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import psycopg2

DIR = Path("/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild")
MOCK = DIR / "mockups"
COVERS = DIR / "covers"
MAKE_COVER = Path(__file__).with_name("make_cover.py")

PLAN = {
    # slug: (listing_id, new hero mockup, cover banner, cover strip)
    "h-emb-c9-v1": (4551744060, "B2_emb_macro_ph", "YOUR CHARACTER NAME · STITCHED", "COMFORT COLORS 1717 · S-4XL"),
    "h-a1-c8-v1": (4551746506, "B2_dtf_front_ph", "YOUR CHARACTER NAME · PRINTED", "COMFORT COLORS 1717 · S-4XL"),
}


def etsy():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT creds FROM shops WHERE id=2")
    cr = cur.fetchone()[0]
    cur.execute("SELECT access_token FROM etsy_tokens WHERE shop_id=2")
    tok = cur.fetchone()[0]
    head = {"x-api-key": f"{cr['etsy_api_key']}:{cr['etsy_shared_secret']}", "Authorization": f"Bearer {tok}"}
    return conn, cur, head, cr["etsy_shop_id"]


def req(method, path, head, data=None, extra=None):
    r = urllib.request.Request(f"https://openapi.etsy.com/v3/application{path}", data=data,
                               headers={**head, **(extra or {})}, method=method)
    try:
        body = urllib.request.urlopen(r).read()
        return json.loads(body) if body else {"ok": True}
    except urllib.error.HTTPError as e:
        return {"ERR": e.code, "body": e.read().decode()[:200]}


def upload(head, shop, listing, rank, path: Path):
    b = uuid.uuid4().hex
    mime = "image/jpeg" if path.suffix in (".jpg", ".jpeg") else "image/png"
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="rank"\r\n\r\n{rank}\r\n'.encode(),
             (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{path.name}"\r\n'
              f'Content-Type: {mime}\r\n\r\n').encode() + path.read_bytes() + b"\r\n",
             f'--{b}--\r\n'.encode()]
    return req("POST", f"/shops/{shop}/listings/{listing}/images", head, b"".join(parts),
               {"Content-Type": f"multipart/form-data; boundary={b}"})


def main() -> None:
    conn, cur, head, shop = etsy()
    COVERS.mkdir(parents=True, exist_ok=True)
    for slug, (listing, mock, banner, strip) in PLAN.items():
        src = MOCK / f"{mock}.png"
        if not src.exists():
            print(f"  {slug}: {src.name} yok, atlandi")
            continue
        cover = COVERS / f"{slug}-cover.jpg"
        subprocess.run([sys.executable, str(MAKE_COVER), str(src), str(cover),
                        "--banner", banner, "--strip", strip], check=True, stdout=subprocess.DEVNULL)

        imgs = req("GET", f"/listings/{listing}/images", head).get("results", [])
        old = [i["listing_image_id"] for i in sorted(imgs, key=lambda x: x["rank"])[:2]]

        r1 = upload(head, shop, listing, 1, cover)
        r2 = upload(head, shop, listing, 2, src)
        ok = "ERR" not in r1 and "ERR" not in r2
        for oid in (old if ok else []):
            req("DELETE", f"/shops/{shop}/listings/{listing}/images/{oid}", head)

        # keep the DB set in sync so a future republish uploads the same thing
        if ok:
            cur.execute("SELECT id FROM products WHERE slug=%s", (slug,))
            pid = cur.fetchone()[0]
            for rank, path in ((1, cover), (2, src)):
                cur.execute("""UPDATE product_images SET filename=%s, mime=%s, bytes=%s
                                WHERE product_id=%s AND rank=%s""",
                            (path.name, "image/jpeg" if path.suffix != ".png" else "image/png",
                             psycopg2.Binary(path.read_bytes()), pid, rank))
        after = req("GET", f"/listings/{listing}/images", head).get("results", [])
        print(f"  {'✓' if ok else '✗'} {slug:14} listing {listing} · {len(after)} gorsel "
              f"{'' if ok else str(r1)[:90] + str(r2)[:90]}")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
