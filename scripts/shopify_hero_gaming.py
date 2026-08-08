#!/usr/bin/env python3
"""Swap the last mama-tee imagery off the homepage and make the header logo legible.

Shopify is the gaming channel now — Etsy keeps the mama/statement catalogue. Two blocks were still
showing klozio-hero-mama.jpg: the hero itself and the lower full-width image. Both are replaced with
real Printful embroidery mockups of the gaming crests, which is also the honest picture: they are
rendered at embroidery_chest_left, the placement we actually stitch.

The logo was set to 28px tall. The mark is a square icon, so 28px is a thumbnail; 48 (36 on mobile)
gives it presence without pushing the header taller than the nav.
"""
import json
import os
import sys
import time

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
THEME_ID = "163020308738"
API = f"https://{SHOP}/admin/api/2026-07"

UPLOAD_DIR = "/tmp/heroup"
# old handle -> new local file. Both hero and the lower band pointed at the same mama image, and the
# two get different crests so the page does not repeat itself.
REPLACE = {
    "media_with_content_RVymQU": "klozio-hero-gaming.jpg",
    "section_x8mrnx": "klozio-panel-gaming.jpg",
}
MAMA = "shopify://shop_images/klozio-hero-mama.jpg"
LOGO_HEIGHT, LOGO_HEIGHT_MOBILE = 48, 36


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


def upload(head, filename: str) -> str:
    """Put a local jpg in Shopify Files under its own name and wait for READY."""
    blob = open(f"{UPLOAD_DIR}/{filename}", "rb").read()
    d = gql(head, """mutation($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } }
        userErrors{ message } } }""",
            {"input": [{"filename": filename, "mimeType": "image/jpeg", "httpMethod": "POST",
                        "resource": "FILE", "fileSize": str(len(blob))}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    files = {p["name"]: (None, p["value"]) for p in t["parameters"]}
    files["file"] = (filename, blob, "image/jpeg")
    up = requests.post(t["url"], files=files, timeout=120)
    if up.status_code not in (200, 201, 204):
        raise RuntimeError(f"staged upload {up.status_code}: {up.text[:200]}")
    d = gql(head, """mutation($files:[FileCreateInput!]!){
      fileCreate(files:$files){ files{ id } userErrors{ message } } }""",
            {"files": [{"originalSource": t["resourceUrl"], "contentType": "IMAGE",
                        "alt": filename.rsplit(".", 1)[0]}]})
    errs = d["fileCreate"]["userErrors"]
    if errs:
        raise RuntimeError(f"fileCreate: {errs}")
    fid = d["fileCreate"]["files"][0]["id"]
    for _ in range(30):
        time.sleep(2)
        n = gql(head, "query($id:ID!){ node(id:$id){ ... on MediaImage { image { url } } } }",
                {"id": fid})["node"]
        if n and (n.get("image") or {}).get("url"):
            return f"shopify://shop_images/{filename}"
    raise RuntimeError(f"{filename} never became READY")


def swap(node, new_ref: str, stats: dict) -> None:
    """Point every mama-image setting under this section at new_ref."""
    for key in ("image", "background_image"):
        if node.get("settings", {}).get(key) == MAMA:
            node["settings"][key] = new_ref
            stats["image"] += 1
    for b in (node.get("blocks") or {}).values():
        swap(b, new_ref, stats)


def asset(head, key):
    return requests.get(f"{API}/themes/{THEME_ID}/assets.json", headers=head,
                        params={"asset[key]": key}, timeout=40).json()["asset"]["value"]


def put(head, key, value):
    r = requests.put(f"{API}/themes/{THEME_ID}/assets.json",
                     headers={**head, "Content-Type": "application/json"},
                     json={"asset": {"key": key, "value": value}}, timeout=60)
    return r.status_code, r.text[:200]


def main() -> None:
    head = {"X-Shopify-Access-Token": token(), "Content-Type": "application/json"}

    print("=== gorseller yukleniyor ===")
    refs = {}
    for sid, fn in REPLACE.items():
        refs[sid] = upload(head, fn)
        print(f"  ✓ {fn} -> {refs[sid]}")

    print("\n=== anasayfa ===")
    j = json.loads(asset(head, "templates/index.json"))
    stats = {"image": 0}
    for sid, sec in j.get("sections", {}).items():
        swap(sec, refs.get(sid, refs["media_with_content_RVymQU"]), stats)
    left = json.dumps(j).count(MAMA)
    code, body = put(head, "templates/index.json", json.dumps(j, ensure_ascii=False))
    print(f"  degistirilen gorsel: {stats['image']}, kalan mama referansi: {left}")
    print(f"  kaydetme: HTTP {code} {body if code != 200 else ''}")

    print("\n=== logo ===")
    s = json.loads(asset(head, "config/settings_data.json"))
    cur = s.get("current", s)
    print(f"  once: logo_height={cur.get('logo_height')} mobile={cur.get('logo_height_mobile')}")
    cur["logo_height"], cur["logo_height_mobile"] = LOGO_HEIGHT, LOGO_HEIGHT_MOBILE
    code, body = put(head, "config/settings_data.json", json.dumps(s, ensure_ascii=False))
    print(f"  sonra: logo_height={LOGO_HEIGHT} mobile={LOGO_HEIGHT_MOBILE}")
    print(f"  kaydetme: HTTP {code} {body if code != 200 else ''}")
    if code != 200 or left:
        sys.exit(1)


if __name__ == "__main__":
    main()
