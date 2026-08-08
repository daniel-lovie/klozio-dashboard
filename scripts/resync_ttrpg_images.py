#!/usr/bin/env python3
"""Rebuild the four TTRPG listings' image sets to the house rules.

Rules applied (user, 2026-08-07): the cover is always the product ON A PERSON, and macro close-ups
are out — they read as fabric, not as a t-shirt, so the user removed them by hand.

Set per listing:
  1 cover      worn mockup + banner/strip (type inside the centre 74%, Etsy crops the sides)
  2 worn       same shot clean
  3 design     the artwork itself on a plain card — shows the crest clearly WITHOUT a fabric macro
  4..n cards   how-to-personalise (personalised only), stitched/printed, fit & care
  last chart   shared Comfort Colors colour chart

Etsy caps a listing at 10 images, so old images are deleted BEFORE the new ones go up; each upload is
retried once so a transient failure does not leave a listing thin.
"""
import json
import os
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

import psycopg2
from PIL import Image

DIR = Path("/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild")
MOCK, CARDS, COVERS = DIR / "mockups", DIR / "cards", DIR / "covers"
CHART = Path("/Users/omer/Documents/code/etsy/assets/comfort-colors-1717-color-chart.jpeg")
MAKE_COVER = Path(__file__).with_name("make_cover.py")
DESIGNS = DIR / "design-cards"

PLAN = {
    "h-emb-c8-v1": dict(listing=4551743654, worn="A_emb_life", art="A_laurel_20_emb.png",
                        banner="REAL EMBROIDERY · NOT A PRINT", strip="COMFORT COLORS 1717 · S-4XL",
                        cards=["stitched-not-printed.jpg", "fit-and-care.jpg"]),
    "h-emb-c9-v1": dict(listing=4551744060, worn="B2_emb_worn_ph", art="B2_shield_emb_ph.png",
                        banner="YOUR CHARACTER NAME · STITCHED", strip="COMFORT COLORS 1717 · S-4XL",
                        cards=["how-to-personalize.jpg", "stitched-not-printed.jpg", "fit-and-care.jpg"]),
    "h-a1-c7-v1": dict(listing=4551746166, worn="A_dtf_life", art="A_laurel_20_print.png",
                       banner="D20 CREST TEE · SOFT-HAND PRINT", strip="COMFORT COLORS 1717 · S-4XL",
                       cards=["printed-to-last.jpg", "fit-and-care.jpg"]),
    "h-a1-c8-v1": dict(listing=4551746506, worn="B2_dtf_worn_ph", art="B2_shield_final_ph.png",
                       banner="YOUR CHARACTER NAME · PRINTED", strip="COMFORT COLORS 1717 · S-4XL",
                       cards=["how-to-personalize.jpg", "printed-to-last.jpg", "fit-and-care.jpg"]),
}


def design_card(art: Path, out: Path) -> Path:
    """Artwork on a plain card. Not a photo of fabric — the graphic, readable at thumbnail size."""
    DESIGNS.mkdir(parents=True, exist_ok=True)
    im = Image.open(art).convert("RGBA")
    canvas = Image.new("RGB", (2000, 2000), (243, 238, 229))
    im.thumbnail((1500, 1500), Image.LANCZOS)
    canvas.paste(im, ((2000 - im.width) // 2, (2000 - im.height) // 2), im)
    canvas.save(out, quality=93)
    return out


def api():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT creds FROM shops WHERE id=2")
    cr = cur.fetchone()[0]
    cur.execute("SELECT access_token FROM etsy_tokens WHERE shop_id=2")
    tok = cur.fetchone()[0]
    return conn, cur, {"x-api-key": f"{cr['etsy_api_key']}:{cr['etsy_shared_secret']}",
                       "Authorization": f"Bearer {tok}"}, cr["etsy_shop_id"]


def req(method, path, head, data=None, extra=None):
    r = urllib.request.Request(f"https://openapi.etsy.com/v3/application{path}", data=data,
                               headers={**head, **(extra or {})}, method=method)
    try:
        body = urllib.request.urlopen(r).read()
        return json.loads(body) if body else {"ok": True}
    except urllib.error.HTTPError as e:
        return {"ERR": e.code, "body": e.read().decode()[:160]}


def upload(head, shop, listing, rank, path: Path):
    b = uuid.uuid4().hex
    mime = "image/png" if path.suffix == ".png" else "image/jpeg"
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="rank"\r\n\r\n{rank}\r\n'.encode(),
             (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{path.name}"\r\n'
              f'Content-Type: {mime}\r\n\r\n').encode() + path.read_bytes() + b"\r\n",
             f'--{b}--\r\n'.encode()]
    out = req("POST", f"/shops/{shop}/listings/{listing}/images", head, b"".join(parts),
              {"Content-Type": f"multipart/form-data; boundary={b}"})
    if "ERR" in out:   # one retry — transient 5xx on image upload is common
        out = req("POST", f"/shops/{shop}/listings/{listing}/images", head, b"".join(parts),
                  {"Content-Type": f"multipart/form-data; boundary={b}"})
    return out


def main() -> None:
    conn, cur, head, shop = api()
    COVERS.mkdir(parents=True, exist_ok=True)
    for slug, p in PLAN.items():
        worn = MOCK / f"{p['worn']}.png"
        if not worn.exists():
            print(f"  {slug}: {worn.name} yok, atlandi")
            continue
        cover = COVERS / f"{slug}-cover.jpg"
        subprocess.run([sys.executable, str(MAKE_COVER), str(worn), str(cover),
                        "--banner", p["banner"], "--strip", p["strip"]], check=True, stdout=subprocess.DEVNULL)
        art = design_card(DIR / p["art"], DESIGNS / f"{slug}-design.jpg")

        wanted = [cover, worn, art] + [CARDS / c for c in p["cards"]] + [CHART]

        old = [i["listing_image_id"] for i in req("GET", f"/listings/{p['listing']}/images", head).get("results", [])]
        for oid in old:
            req("DELETE", f"/shops/{shop}/listings/{p['listing']}/images/{oid}", head)

        fails = []
        for rank, path in enumerate(wanted, start=1):
            if "ERR" in upload(head, shop, p["listing"], rank, path):
                fails.append(path.name)

        cur.execute("SELECT id FROM products WHERE slug=%s", (slug,))
        pid = cur.fetchone()[0]
        cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
        for rank, path in enumerate(wanted, start=1):
            role = "cover" if rank == 1 else "model" if rank == 2 else "detail" if rank == 3 else \
                   "colorway-chart" if path == CHART else "trust"
            cur.execute("""INSERT INTO product_images (product_id, rank, role, filename, mime, bytes)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (pid, rank, role, path.name,
                         "image/png" if path.suffix == ".png" else "image/jpeg",
                         psycopg2.Binary(path.read_bytes())))
        live = len(req("GET", f"/listings/{p['listing']}/images", head).get("results", []))
        print(f"  {'✓' if not fails else '✗'} {slug:14} {live}/{len(wanted)} gorsel canlida"
              f"{'  BASARISIZ: ' + ', '.join(fails) if fails else ''}")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
