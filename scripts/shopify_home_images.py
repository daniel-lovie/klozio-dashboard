#!/usr/bin/env python3
"""Swap the homepage hero and the band above the footer for our own composited photographs.

Both still carried Printful renders from before the store had its own imagery — the same headless
studio shot every Printful shop publishes, and at the old print scale, which advertised a 17-inch
graphic no press produces. The replacements are the current composites at 10x10 inches.

The colour badge is left off here on purpose. On a product page it answers "which shade is this";
across a hero it is a watermark on the shop's own front door.
"""
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from PIL import Image

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07"
THEME_ID = "163020308738"
PIPE = Path("/Users/omer/Documents/code/etsy/pipeline")

# section id -> (source composite, output name, crop). Hero is wide and sits beside the headline;
# the lower band is full-width, so it takes a shallower slice.
JOBS = {
    "media_with_content_RVymQU": (
        PIPE / "gaming-01/designs/h-a1-c10-v1/shots/h-a1-c10-v1-pepper-model.jpg",
        "klozio-hero-2.jpg", (0.02, 0.00, 0.98, 0.86)),
    "section_x8mrnx": (
        PIPE / "gaming-01/designs/h-a1-c10-v1/shots/h-a1-c10-v1-ivory-model.jpg",
        "klozio-band-2.jpg", (0.00, 0.02, 1.00, 0.80)),
}


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


def upload(head, name: str, blob: bytes) -> str:
    d = gql(head, """mutation($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } }
        userErrors{ message } } }""",
            {"input": [{"filename": name, "mimeType": "image/jpeg", "httpMethod": "POST",
                        "resource": "FILE", "fileSize": str(len(blob))}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    files = {p["name"]: (None, p["value"]) for p in t["parameters"]}
    files["file"] = (name, blob, "image/jpeg")
    up = requests.post(t["url"], files=files, timeout=120)
    if up.status_code not in (200, 201, 204):
        raise RuntimeError(f"staged upload {up.status_code}: {up.text[:200]}")
    d = gql(head, """mutation($files:[FileCreateInput!]!){
      fileCreate(files:$files){ files{ id } userErrors{ message } } }""",
            {"files": [{"originalSource": t["resourceUrl"], "contentType": "IMAGE",
                        "alt": name.rsplit(".", 1)[0]}]})
    errs = d["fileCreate"]["userErrors"]
    if errs:
        raise RuntimeError(f"fileCreate: {errs}")
    fid = d["fileCreate"]["files"][0]["id"]
    for _ in range(30):
        time.sleep(2)
        n = gql(head, "query($id:ID!){ node(id:$id){ ... on MediaImage { image { url } } } }",
                {"id": fid})["node"]
        if n and (n.get("image") or {}).get("url"):
            return f"shopify://shop_images/{name}"
    raise RuntimeError(f"{name} READY olmadi")


def set_image(node, ref: str, stats: list) -> None:
    for key in ("image", "background_image"):
        if isinstance(node.get("settings", {}).get(key), str):
            stats.append((key, node["settings"][key], ref))
            node["settings"][key] = ref
    for b in (node.get("blocks") or {}).values():
        set_image(b, ref, stats)


def main() -> None:
    head = {"X-Shopify-Access-Token": token(), "Content-Type": "application/json"}
    refs = {}
    print("=== gorseller hazirlaniyor ===")
    for sid, (src, name, crop) in JOBS.items():
        if not src.exists():
            sys.exit(f"kaynak yok: {src}")
        im = Image.open(src).convert("RGB")
        w, h = im.size
        im = im.crop((int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3])))
        im.thumbnail((1800, 1800), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)
        refs[sid] = upload(head, name, buf.getvalue())
        print(f"  {name:22} {im.size}  -> {refs[sid]}")

    url = f"{API}/themes/{THEME_ID}/assets.json"
    raw = requests.get(url, headers=head, params={"asset[key]": "templates/index.json"},
                       timeout=40).json()["asset"]["value"]
    j = json.loads(raw)
    print("\n=== anasayfa ===")
    for sid, ref in refs.items():
        sec = j["sections"].get(sid)
        if not sec:
            print(f"  {sid}: bolum yok")
            continue
        stats: list = []
        set_image(sec, ref, stats)
        for key, was, now in stats:
            print(f"  {sid}\n     {key}: {was}  ->  {now}")

    r = requests.put(url, headers={**head, "Content-Type": "application/json"},
                     json={"asset": {"key": "templates/index.json",
                                     "value": json.dumps(j, ensure_ascii=False)}}, timeout=60)
    print(f"\nkaydetme: HTTP {r.status_code} {'' if r.status_code == 200 else r.text[:200]}")
    if r.status_code != 200:
        sys.exit(1)


if __name__ == "__main__":
    main()
