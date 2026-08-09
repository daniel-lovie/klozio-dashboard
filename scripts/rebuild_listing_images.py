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
import io
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mockup_composite import load_config, composite_pil, BLANKS      # noqa: E402
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


# Decoding a 3600x3000 JPEG takes longer than the composite itself, and each product does nineteen
# of them — two models, four flats, thirteen chart tiles. Decoded once, they serve every product.
_BLANK_CACHE: dict = {}


def blank_image(file: str) -> Image.Image:
    if file not in _BLANK_CACHE:
        _BLANK_CACHE[file] = Image.open(BLANKS / file).convert("RGB")
    return _BLANK_CACHE[file]


_DESIGN_CACHE: dict = {}


def design_image(path: Path) -> Image.Image:
    key = str(path)
    if key not in _DESIGN_CACHE:
        _DESIGN_CACHE.clear()                    # one product at a time; do not grow unbounded
        _DESIGN_CACHE[key] = Image.open(path).convert("RGBA")
    return _DESIGN_CACHE[key]


def render(design: Path, tpl_name: str, cfg: dict, out: Path, embroidery: bool,
           scale: float = 1.0) -> Path:
    spec = dict(cfg[tpl_name])
    if embroidery:
        spec["quad"] = chest_left(spec["quad"])
    blank = blank_image(spec["file"])
    if scale < 1.0:
        # Chart tiles are thumbnailed to 460px anyway; compositing them at full size is nine times
        # the pixel work for detail that is discarded on the next line.
        w, h = blank.size
        blank = blank.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        spec["quad"] = [[int(x * scale), int(y * scale)] for x, y in spec["quad"]]
    composite_pil(design_image(design), blank, spec).save(out, quality=92)
    return out


def build_chart(design: Path, cfg: dict, out: Path, embroidery: bool, cell: int = 460) -> Path:
    """Thirteen flats, labelled. Same idea as the Printful chart, from our own photographs."""
    cols, pad_label = 4, int(cell * 0.15)
    tiles = []
    for name in CHART_FLATS:
        if name not in cfg:
            continue
        tmp = out.parent / f".chart-{name}.jpg"
        render(design, name, cfg, tmp, embroidery, scale=0.34)
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
        # TCP keepalives are the whole story here. Without them a dropped connection is not noticed
        # until the OS gives up retransmitting, which took 88 minutes on one product — 12 seconds of
        # that was CPU. With them a dead socket surfaces in about a minute and the retry can act.
        return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15,
                                keepalives=1, keepalives_idle=20, keepalives_interval=8,
                                keepalives_count=3)

    dirs = [d for d in sorted(root.iterdir()) if d.is_dir() and (d / "final.png").exists()]
    if a.only:
        dirs = [d for d in dirs if d.name == a.only]
    if a.limit:
        dirs = dirs[:a.limit]

    # Read the whole list up front and hold no connection during the image work. Twelve seconds of
    # compositing with an open connection was enough for the managed Postgres to close it, and the
    # write then blocked on a dead socket — 88 minutes for one product, of which 12 seconds was CPU.
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT slug, id, technique FROM products WHERE slug = ANY(%s)",
                ([d.name for d in dirs],))
    meta = {slug: (pid, tech) for slug, pid, tech in cur.fetchall()}
    conn.close()

    done = 0
    for d in dirs:
        if d.name not in meta:
            print(f"  {d.name:14} urun satiri yok")
            continue
        pid, technique = meta[d.name]
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
        blobs = []
        for f in files:
            im = Image.open(f).convert("RGB")
            if max(im.size) > 2400:            # Etsy asks for 2000px; 3600 is bytes nobody sees
                im.thumbnail((2400, 2400), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=88)
            blobs.append((f.name, buf.getvalue()))
        for attempt in (1, 2, 3):
            c = None
            try:
                c = connect()                       # fresh, used immediately, closed straight after
                k = c.cursor()
                # hero_colorway follows the cover, which is now always the Ivory model
                k.execute("UPDATE products SET hero_colorway='Ivory' WHERE id=%s", (pid,))
                k.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
                for rank, (fn, blob) in enumerate(blobs, start=1):
                    k.execute("""INSERT INTO product_images (product_id, rank, filename, mime, bytes)
                                 VALUES (%s,%s,%s,'image/jpeg',%s)""",
                              (pid, rank, fn, psycopg2.Binary(blob)))
                c.commit()
                c.close()
                break
            except psycopg2.Error as e:
                print(f"    yeniden deneniyor ({str(e)[:60]})")
                if c is not None:
                    try:
                        c.close()
                    except Exception:
                        pass
                if attempt == 3:
                    raise
        done += 1

    print(f"\n{done} urunun gorsel seti yenilendi" + ("" if a.apply else "   (--apply verilmedi)"))


if __name__ == "__main__":
    main()
