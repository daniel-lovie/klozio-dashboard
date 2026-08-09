#!/usr/bin/env python3
"""Rebuild every listing's image set from our own photographs. Printful renders are dropped entirely.

Printful's mockup generator is free and its placement is honest, which is why it was used to prove
the artwork sits where we stitch it. But it is a 3D render on a headless studio ghost, and it is the
same render every Printful shop publishes — on a marketplace where the first image decides whether
anyone clicks, that is the wrong picture. The licensed blanks are photographs of a person in a room,
and they are ours to use.

The set, in order:

  1  Ivory on model     the cover
  2  Pepper on model    the same design on a dark garment, so the range is visible immediately
  3+ four flat lays     colours chosen to span the palette, not to repeat the two above
  n  colour chart       all thirteen flats in a labelled grid
  n+ info cards         personalisation, technique, fit and care

Embroidery keeps its own quad: those products are fulfilled as a 4-inch left-chest badge, and a
full-width composite of the same artwork would advertise a garment we do not make.
"""
import argparse
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mockup_composite import load_config, composite, BLANKS          # noqa: E402
from apply_blank_covers import badge, chest_left, luma               # noqa: E402

PIPELINE = Path("/Users/omer/Documents/code/etsy/pipeline")
MODELS = [("model-IvoryTrendy4", "Ivory"), ("model-Pepper", "Pepper")]
# Spread across the palette: a warm cream, a mid green, a blue and a black cover most preferences
# without repeating the two model shots.
FLATS = [("flat-Bay", "Bay"), ("flat-Navy", "Navy"), ("flat-LayYam", "Yam"), ("flat-Black", "Black")]
CHART_FLATS = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
               "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
               "flat-Black"]
CHART_NAMES = {"flat-White": "White", "flat-Ivory": "Ivory", "flat-Blossom": "Blossom",
               "flat-Bay": "Bay", "flat-Grey": "Grey", "flat-Moss": "Moss", "flat-LayYam": "Yam",
               "flat-Crims": "Crimson", "flat-Red": "Red", "flat-Demin": "Denim",
               "flat-Navy": "Navy", "flat-Pepper": "Pepper", "flat-Black": "Black"}
FONT_T = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT_L = "/System/Library/Fonts/Supplemental/Arial.ttf"
CARD_ORDER = ["how-to-personalize.jpg", "stitched-not-printed.jpg", "printed-to-last.jpg",
              "fit-and-care.jpg"]


def render(design: Path, tpl_name: str, cfg: dict, out: Path, embroidery: bool) -> Path:
    spec = dict(cfg[tpl_name])
    if embroidery:
        spec["quad"] = chest_left(spec["quad"])
    composite(design, BLANKS / spec["file"], spec, out)
    return out


def build_chart(design: Path, cfg: dict, out: Path, embroidery: bool, cell: int = 460) -> Path:
    """Thirteen flats, labelled. Same idea as the Printful chart, from our own photographs."""
    cols, pad_label = 4, int(cell * 0.15)
    tiles = []
    for name in CHART_FLATS:
        if name not in cfg:
            continue
        tmp = out.parent / f".chart-{name}.jpg"
        render(design, name, cfg, tmp, embroidery)
        im = Image.open(tmp).convert("RGB")
        im.thumbnail((cell, cell), Image.LANCZOS)
        tiles.append((CHART_NAMES.get(name, name), im))
        tmp.unlink(missing_ok=True)

    rows = (len(tiles) + cols - 1) // cols
    title_h = int(cell * 0.40)
    canvas = Image.new("RGB", (cols * cell, title_h + rows * (cell + pad_label)), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    ft = ImageFont.truetype(FONT_T, int(cell * 0.14))
    fl = ImageFont.truetype(FONT_L, int(cell * 0.082))
    for i, line in enumerate(["COMFORT COLORS", "COLOR CHART"]):
        w = d.textbbox((0, 0), line, font=ft)[2]
        d.text(((canvas.width - w) // 2, int(cell * 0.05) + i * int(cell * 0.16)), line,
               font=ft, fill=(20, 20, 20))
    for i, (name, im) in enumerate(tiles):
        x = (i % cols) * cell + (cell - im.width) // 2
        y = title_h + (i // cols) * (cell + pad_label)
        canvas.paste(im, (x, y))
        tw = d.textbbox((0, 0), name, font=fl)[2]
        d.text(((i % cols) * cell + (cell - tw) // 2, y + im.height + int(pad_label * 0.10)),
               name, font=fl, fill=(30, 30, 30))
    canvas.save(out, quality=91)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    cfg = load_config()
    root = PIPELINE / a.campaign / "designs"
    # Each product writes ~7 JPEGs of a megabyte or so; the managed Postgres drops a connection that
    # has been idle between those bursts, and two of these running in parallel killed it outright.
    # Reconnect rather than lose the run at product 40 of 97.
    def connect():
        return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15)

    conn = connect()
    cur = conn.cursor()
    dirs = [d for d in sorted(root.iterdir()) if d.is_dir() and (d / "final.png").exists()]
    if a.only:
        dirs = [d for d in dirs if d.name == a.only]
    if a.limit:
        dirs = dirs[:a.limit]

    done = 0
    for d in dirs:
        for attempt in (1, 2, 3):
            try:
                cur.execute("SELECT id, technique FROM products WHERE slug=%s", (d.name,))
                break
            except psycopg2.Error:
                conn = connect()
                cur = conn.cursor()
                if attempt == 3:
                    raise
        row = cur.fetchone()
        if not row:
            print(f"  {d.name:14} urun satiri yok")
            continue
        pid, technique = row
        emb = technique == "embroidery"
        design, shots = d / "final.png", d / "shots"
        shots.mkdir(exist_ok=True)
        files: list[Path] = []
        try:
            for tpl, colour in MODELS:
                p = render(design, tpl, cfg, shots / f"{d.name}-{colour.lower()}-model.jpg", emb)
                badge(Image.open(p).convert("RGB"), colour).save(p, quality=93)
                files.append(p)
            for tpl, colour in FLATS:
                files.append(render(design, tpl, cfg,
                                    shots / f"{d.name}-{colour.lower()}-flat.jpg", emb))
            files.append(build_chart(design, cfg, shots / f"{d.name}-color-chart.jpg", emb))
        except Exception as e:
            print(f"  {d.name:14} HATA {str(e)[:120]}")
            continue

        cards = d / "cards"
        if cards.is_dir():
            named = {p.name: p for p in cards.glob("*.jpg")}
            files += [named[n] for n in CARD_ORDER if n in named]

        print(f"  {d.name:14} {len(files):2} gorsel  ({'nakis' if emb else 'baski'})")
        if not a.apply:
            continue
        blobs = [(p.name, p.read_bytes()) for p in files]
        for attempt in (1, 2, 3):
            try:
                # hero_colorway follows the cover, which is now always the Ivory model
                cur.execute("UPDATE products SET hero_colorway='Ivory' WHERE id=%s", (pid,))
                cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
                for rank, (fn, blob) in enumerate(blobs, start=1):
                    cur.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                                   VALUES (%s,%s,%s,'image/jpeg',%s)""",
                                (pid, rank, fn, psycopg2.Binary(blob)))
                conn.commit()
                break
            except psycopg2.Error as e:
                print(f"    db yeniden baglaniyor ({str(e)[:60]})")
                conn = connect()
                cur = conn.cursor()
                if attempt == 3:
                    raise
        done += 1

    print(f"\n{done} urunun gorsel seti yenilendi" + ("" if a.apply else "   (--apply verilmedi)"))


if __name__ == "__main__":
    main()
