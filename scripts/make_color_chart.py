#!/usr/bin/env python3
"""Build the "Comfort Colors color chart" listing image — the design on every colour, in one grid.

This is the image every established Comfort Colors shop carries, and it is not bought or licensed:
it is the seller's own mockups tiled and labelled. Printful renders as many colourways as you ask for
in a single mockup task at no cost, so a fifteen-colour chart is one API call and some compositing —
the same price as the one-colour mockup we already generate.

It earns its slot in the listing twice over: it answers "what does this look like on X" without a
message, and it is the image that shows a buyer the shop stocks real garments rather than a render.

The flat lay is used rather than an on-model shot. Fifteen photographs of fifteen different models
reads as a stock-photo collage; fifteen identical flat lays reads as a product range.
"""
import argparse
import json
import os
import re
import time
from pathlib import Path

import psycopg2
import requests
from PIL import Image, ImageDraw, ImageFont

PF = "https://api.printful.com"
CC1717 = 586
STORE = "18561101"
HEAD = {"User-Agent": "klozio/1.0", "Content-Type": "application/json"}

# L-size variant ids. Ordered light -> dark so the grid reads as a gradient rather than a jumble.
CHART_COLORS = [
    ("White", 15126), ("Ivory", 16525), ("Butter", 15168), ("Mustard", 21550),
    ("Orchid", 21259), ("Grey", 15178), ("Blossom", 16543), ("Chambray", 17650),
    ("Blue Jean", 16513), ("Denim", 21522), ("Red", 15121), ("Light Green", 16537),
    ("Pepper", 17695), ("Black", 15116), ("True Navy", 15183),
]
COLS = 4
TITLE = "COMFORT COLORS COLOR CHART"
FONT_T = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT_L = "/System/Library/Fonts/Supplemental/Arial.ttf"


def head() -> dict:
    return dict(HEAD, Authorization=f"Bearer {os.environ['PRINTFUL_API_KEY']}",
                **{"X-PF-Store-Id": STORE})


def render(image_url: str, technique: str, placement: str, position: dict) -> dict[str, bytes]:
    """One task, every colour. The generator bills nothing and accepts the whole list at once."""
    body = {"variant_ids": [v for _, v in CHART_COLORS], "format": "jpg", "technique": technique,
            "option_groups": ["Flat"],
            "files": [{"placement": placement, "image_url": image_url, "position": position}]}
    r = requests.post(f"{PF}/mockup-generator/create-task/{CC1717}", headers=head(), json=body,
                      timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"create-task {r.status_code}: {r.text[:200]}")
    key = r.json()["result"]["task_key"]
    for _ in range(60):
        time.sleep(3)
        st = requests.get(f"{PF}/mockup-generator/task", headers=head(),
                          params={"task_key": key}, timeout=60).json()["result"]
        if st["status"] == "completed":
            break
        if st["status"] == "failed":
            raise RuntimeError(f"mockup failed: {json.dumps(st)[:200]}")
    else:
        raise RuntimeError("mockup timed out")

    by_variant = {v: n for n, v in CHART_COLORS}
    out: dict[str, bytes] = {}
    for m in st["mockups"]:
        name = by_variant.get((m.get("variant_ids") or [0])[0])
        url = m["mockup_url"]
        # prefer a front flat lay when the task returns several angles for the colour
        for e in m.get("extra", []):
            if "front" in (e.get("title") or "").lower():
                url = e["url"]
                break
        if name:
            out[name] = requests.get(url, timeout=120).content
    # Printful returns the colours in its own order; the chart reads as a range only if it runs
    # light to dark, which is the order CHART_COLORS is written in.
    return {n: out[n] for n, _ in CHART_COLORS if n in out}


def compose(tiles: dict[str, bytes], out: Path, cell: int = 500) -> Path:
    label_h = int(cell * 0.16)
    rows = (len(tiles) + COLS - 1) // COLS
    title_h = int(cell * 0.42)
    W = COLS * cell
    H = title_h + rows * (cell + label_h)
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(canvas)

    ft = ImageFont.truetype(FONT_T, int(cell * 0.15))
    fl = ImageFont.truetype(FONT_L, int(cell * 0.085))
    for i, line in enumerate(TITLE.split(" COLOR CHART")[0:1] + ["COLOR CHART"]):
        w = d.textbbox((0, 0), line, font=ft)[2]
        d.text(((W - w) // 2, int(cell * 0.06) + i * int(cell * 0.17)), line, font=ft, fill=(20, 20, 20))

    for i, (name, blob) in enumerate(tiles.items()):
        im = Image.open(__import__("io").BytesIO(blob)).convert("RGB")
        im.thumbnail((cell, cell), Image.LANCZOS)
        x = (i % COLS) * cell + (cell - im.width) // 2
        y = title_h + (i // COLS) * (cell + label_h)
        canvas.paste(im, (x, y))
        tw = d.textbbox((0, 0), name, font=fl)[2]
        d.text(((i % COLS) * cell + (cell - tw) // 2, y + cell + int(label_h * 0.12)),
               name, font=fl, fill=(30, 30, 30))

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=92)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true", help="also insert into product_images")
    a = ap.parse_args()

    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from batch_runner import (PF_KIND_PLACEMENT, PF_TECHNIQUE, PF_AREA, PF_POSITION,
                             shopify_public_url)

    root = Path("/Users/omer/Documents/code/etsy/pipeline") / a.campaign / "designs"
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    dirs = [d for d in sorted(root.iterdir()) if d.is_dir() and (d / "final.png").exists()]
    if a.only:
        dirs = [d for d in dirs if d.name == a.only]
    if a.limit:
        dirs = dirs[:a.limit]

    for d in dirs:
        chart = d / "covers" / f"{d.name}-color-chart.jpg"
        if chart.exists():
            print(f"  {d.name:14} zaten var")
            continue
        cur.execute("SELECT id, technique FROM products WHERE slug=%s", (d.name,))
        row = cur.fetchone()
        if not row:
            print(f"  {d.name:14} urun satiri yok")
            continue
        pid, technique = row
        kind = "embroidery" if technique == "embroidery" else "dtf"
        placement = PF_KIND_PLACEMENT[kind]
        if placement in PF_AREA:
            w, h = PF_AREA[placement]
            pos = {"area_width": w, "area_height": h, "width": w, "height": h, "top": 0, "left": 0}
        else:
            pos = PF_POSITION
        try:
            tiles = render(shopify_public_url(d / "final.png"), PF_TECHNIQUE[kind], placement, pos)
            compose(tiles, chart)
            print(f"  {d.name:14} {len(tiles)} renk -> {chart.name}")
            if a.apply:
                cur.execute("SELECT COALESCE(max(rank),0)+1 FROM product_images WHERE product_id=%s",
                            (pid,))
                rank = cur.fetchone()[0]
                cur.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                               VALUES (%s,%s,%s,'image/jpeg',%s)""",
                            (pid, rank, chart.name, psycopg2.Binary(chart.read_bytes())))
                conn.commit()
        except Exception as e:
            print(f"  {d.name:14} HATA {str(e)[:160]}")


if __name__ == "__main__":
    main()
