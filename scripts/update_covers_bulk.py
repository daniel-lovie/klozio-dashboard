#!/usr/bin/env python3
"""Bulk cover refresh + size chart + try-on video for live Etsy listings.

Per active product:
  1. rank-1 mockup from DB -> make_cover.py overlay -> REPLACE Etsy rank-1 image (overwrite)
  2. shirts (CC1717): append size chart image + upload try-on video (one per listing)
  3. mirror in DB: shift ranks, insert new cover as rank 1

Etsy token: loaded from etsy_tokens (id=1); refresh ROTATES and is persisted, same
contract as src/lib/etsy.ts. Run: python3 scripts/update_covers_bulk.py [--only slug]
"""
import argparse, base64, io, json, os, subprocess, sys, time, urllib.parse
import requests
import psycopg2

DB = os.environ["DATABASE_URL"]
KEY = os.environ["ETSY_API_KEY"]
SHOP = os.environ["ETSY_SHOP_ID"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHART = os.path.join(ROOT, "assets", "cc1717-size-chart.png")
VIDEO = os.path.join(ROOT, "assets", "cc1717-tryon-720.mp4")

def texts(slot, personalised):
    if slot == "EMB":
        return (("CUSTOM EMBROIDERY · YOUR NAMES STITCHED" if personalised else "REAL EMBROIDERY · NOT A PRINT"),
                "COMFORT COLORS 1717 · REAL STITCHING · S-4XL")
    if slot == "EMBH":
        return (("CUSTOM EMBROIDERED DAD HAT" if personalised else "EMBROIDERED DAD HAT · NOT A PRINT"),
                "YUPOONG 6245CM · 10 COLORS · ADJUSTABLE")
    return (("PERSONALIZED WITH YOUR NAMES" if personalised else "COMFORT COLORS GARMENT-DYED TEE"),
            "COMFORT COLORS 1717 · 22 COLORS · S-4XL")

def get_token(cur, conn):
    cur.execute("SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE id=1")
    access, refresh, exp = cur.fetchone()
    if exp.timestamp() - time.time() >= 300:
        return access
    r = requests.post("https://api.etsy.com/v3/public/oauth/token", json={
        "grant_type": "refresh_token", "client_id": KEY, "refresh_token": refresh})
    r.raise_for_status()
    j = r.json()
    cur.execute("UPDATE etsy_tokens SET access_token=%s, refresh_token=%s, expires_at=now()+make_interval(secs=>%s) WHERE id=1",
                (j["access_token"], j["refresh_token"], j["expires_in"]))
    conn.commit()
    return j["access_token"]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); a = ap.parse_args()
    conn = psycopg2.connect(DB); cur = conn.cursor()
    q = """SELECT p.id, p.slug, p.etsy_listing_id, COALESCE(p.slot,''), p.personalised
             FROM products p WHERE p.etsy_listing_id IS NOT NULL AND p.etsy_state='active'
              AND NOT EXISTS (SELECT 1 FROM product_images g
                              WHERE g.product_id=p.id AND g.rank=1 AND g.label='ad-style cover')"""
    if a.only: q += " AND p.slug=%s"
    cur.execute(q + " ORDER BY p.slot, p.concept_no", (a.only,) if a.only else None)
    rows = cur.fetchall()
    print(f"{len(rows)} live listings")

    for pid, slug, lid, slot, pers in rows:
        tok = get_token(cur, conn)
        H = {"x-api-key": KEY, "Authorization": f"Bearer {tok}"}
        cur.execute("SELECT bytes FROM product_images WHERE product_id=%s AND rank=1", (pid,))
        src = cur.fetchone()
        if not src: print(f"{slug}: NO rank1 image, skip"); continue
        open(f"/tmp/w1/cov_src.jpg","wb").write(bytes(src[0]))
        banner, strip = texts(slot, pers)
        subprocess.run([sys.executable, os.path.join(ROOT,"scripts","make_cover.py"),
                        "/tmp/w1/cov_src.jpg", "/tmp/w1/cov_new.jpg",
                        "--banner", banner, "--strip", strip], check=True, capture_output=True)
        new = open("/tmp/w1/cov_new.jpg","rb").read()

        r = requests.post(f"https://openapi.etsy.com/v3/application/shops/{SHOP}/listings/{lid}/images",
                          headers=H, files={"image": (f"{slug}-cover.jpg", new, "image/jpeg")},
                          data={"rank": 1, "overwrite": "true"})
        if not r.ok: print(f"{slug}: COVER FAIL {r.status_code} {r.text[:150]}"); continue

        # DB mirror: shift ranks, insert new rank1
        cur.execute("UPDATE product_images SET rank=rank+1000 WHERE product_id=%s", (pid,))
        cur.execute("UPDATE product_images SET rank=rank-999 WHERE product_id=%s", (pid,))
        cur.execute("""INSERT INTO product_images (product_id, rank, role, label, filename, mime, bytes)
                       VALUES (%s,1,'cover','ad-style cover',%s,'image/jpeg',%s)""",
                    (pid, f"{slug}-cover.jpg", psycopg2.Binary(new)))
        conn.commit()

        extra = ""
        if slot != "EMBH":
            rc = requests.post(f"https://openapi.etsy.com/v3/application/shops/{SHOP}/listings/{lid}/images",
                               headers=H, files={"image": ("cc1717-size-chart.png", open(CHART,"rb"), "image/png")},
                               data={"rank": 10})
            rv = requests.post(f"https://openapi.etsy.com/v3/application/shops/{SHOP}/listings/{lid}/videos",
                               headers=H, files={"video": ("cc1717-tryon.mp4", open(VIDEO,"rb"), "video/mp4")},
                               data={"name": "cc1717-tryon.mp4"})
            extra = f" chart={rc.status_code} video={rv.status_code}"
            if not rc.ok: extra += f" [chart: {rc.text[:100]}]"
            if not rv.ok: extra += f" [video: {rv.text[:100]}]"
        print(f"{slug}: cover OK{extra}")
        time.sleep(0.5)
    conn.close()

if __name__ == "__main__":
    main()
