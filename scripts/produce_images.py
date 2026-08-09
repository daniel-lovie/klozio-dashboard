#!/usr/bin/env python3
"""Build one product's listing images the way the batch runner does — callable from the deployed worker.

    python3 scripts/produce_images.py <product_id>

The producer agent on Railway used to generate three mockups with an image model, at roughly $0.54 a
product, on a path that knows none of the rules the batch pipeline enforces: it renders type with AI,
ignores the declared thread palette, cannot tell an embroidered chest badge from a full-front print,
and never checks the design against the garment it is shown on. Approving a product from the website
therefore produced something we would not ship, while the same product built locally passed eight
gates for $0.03. Two production paths that disagree is the defect; this is the one path.

Blanks live in the mockup_blanks table rather than on disk, which is how this codebase already stores
images — the service keeps no persistent volume, so a file next to the script would not survive a
deploy.
"""
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mockup_composite import warp                                    # noqa: E402

MODELS = ["model-IvoryTrendy4", "model-Pepper"]
FLATS = ["flat-Bay", "flat-Navy", "flat-LayYam", "flat-Black"]
CHART = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
         "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
         "flat-Black"]
FONT_T = "/System/Library/Fonts/Supplemental/Futura.ttc"
FONT_L = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Railway's image has neither macOS font; fall back rather than fail the whole build."""
    for p in (path, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def chest_left(quad) -> list:
    """The 4-inch badge quad, for products fulfilled at embroidery_chest_left."""
    (x0, y0), (x1, _), _, (_, y3) = [tuple(pt) for pt in quad]
    w, h = x1 - x0, y3 - y0
    side = int(w * 0.30)
    cx = int(x0 + w * 0.50 + w * 0.28)
    top = int(y0 + h * 0.06)
    return [[cx - side // 2, top], [cx + side // 2, top],
            [cx + side // 2, top + side], [cx - side // 2, top + side]]


def composite(design: Image.Image, blank: Image.Image, tpl: dict, embroidery: bool) -> Image.Image:
    quad = chest_left(tpl["quad"]) if embroidery else tpl["quad"]
    placed = warp(design, quad, blank.size)
    art = np.asarray(placed).astype(float)
    alpha = art[:, :, 3:4] / 255.0 * float(tpl.get("opacity", 0.94))
    base = np.asarray(blank).astype(float)
    shade = float(tpl.get("shade", 0.85))
    lum = (0.2126 * base[:, :, 0] + 0.7152 * base[:, :, 1] + 0.0722 * base[:, :, 2])[:, :, None]
    lit = art[:, :, :3] * ((lum / 235.0) * shade + (1 - shade))
    return Image.fromarray(np.clip(base * (1 - alpha) + lit * alpha, 0, 255).astype(np.uint8))


def badge(img: Image.Image, colorway: str) -> Image.Image:
    w, h = img.size
    pad = int(w * 0.03)
    d = ImageDraw.Draw(img, "RGBA")
    f1, f2 = font(FONT_L, int(w * 0.028)), font(FONT_L, int(w * 0.046))
    top, bot = "COMFORT COLORS", colorway.upper()
    bw = max(d.textbbox((0, 0), top, font=f1)[2], d.textbbox((0, 0), bot, font=f2)[2]) + pad * 2
    bh = int(w * 0.115)
    x, y = pad, h - bh - pad
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=int(bh * 0.28), fill=(20, 20, 20, 205))
    d.text((x + (bw - d.textbbox((0, 0), top, font=f1)[2]) / 2, y + bh * 0.16), top, font=f1,
           fill=(235, 232, 226, 255))
    d.text((x + (bw - d.textbbox((0, 0), bot, font=f2)[2]) / 2, y + bh * 0.44), bot, font=f2,
           fill=(255, 255, 255, 255))
    return img


def build_chart(design: Image.Image, blanks: dict, embroidery: bool, cell: int = 460) -> Image.Image:
    cols, label_h = 4, int(cell * 0.15)
    tiles = []
    for name in CHART:
        b = blanks.get(name)
        if not b:
            continue
        im = composite(design, b["image"], b, embroidery)
        im.thumbnail((cell, cell), Image.LANCZOS)
        tiles.append((b["colorway"], im))
    rows = (len(tiles) + cols - 1) // cols
    title_h = int(cell * 0.40)
    canvas = Image.new("RGB", (cols * cell, title_h + rows * (cell + label_h)), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    ft, fl = font(FONT_T, int(cell * 0.14)), font(FONT_L, int(cell * 0.082))
    for i, line in enumerate(["COMFORT COLORS", "COLOR CHART"]):
        w = d.textbbox((0, 0), line, font=ft)[2]
        d.text(((canvas.width - w) // 2, int(cell * 0.05) + i * int(cell * 0.16)), line, font=ft,
               fill=(20, 20, 20))
    for i, (name, im) in enumerate(tiles):
        x = (i % cols) * cell + (cell - im.width) // 2
        y = title_h + (i // cols) * (cell + label_h)
        canvas.paste(im, (x, y))
        tw = d.textbbox((0, 0), name, font=fl)[2]
        d.text(((i % cols) * cell + (cell - tw) // 2, y + im.height + int(label_h * 0.10)), name,
               font=fl, fill=(30, 30, 30))
    return canvas


def jpeg(im: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("kullanim: produce_images.py <product_id>")
    pid = int(sys.argv[1])
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT slug, technique, print_file FROM products WHERE id=%s", (pid,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"urun {pid} yok")
    slug, technique, print_file = row
    if not print_file:
        sys.exit(f"{slug}: print_file yok — once tasarim uretilmeli")
    emb = technique == "embroidery"
    design = Image.open(io.BytesIO(bytes(print_file))).convert("RGBA")

    cur.execute("SELECT name, colorway, quad, opacity, shade, bytes FROM mockup_blanks")
    blanks = {}
    for name, colorway, quad, opacity, shade, blob in cur.fetchall():
        blanks[name] = {"colorway": colorway,
                        "quad": quad if isinstance(quad, list) else json.loads(quad),
                        "opacity": opacity, "shade": shade,
                        "image": Image.open(io.BytesIO(bytes(blob))).convert("RGB")}
    if not blanks:
        sys.exit("mockup_blanks bos — blank'ler yuklenmeli")

    images: list[tuple[str, str, str, bytes]] = []
    for name in MODELS:
        b = blanks[name]
        im = badge(composite(design, b["image"], b, emb), b["colorway"])
        images.append((f"{slug}-{b['colorway'].lower().replace(' ', '-')}-model.jpg",
                       "model", b["colorway"], jpeg(im, 93)))
    for name in FLATS:
        b = blanks[name]
        images.append((f"{slug}-{b['colorway'].lower().replace(' ', '-')}-flat.jpg",
                       "flat", b["colorway"], jpeg(composite(design, b["image"], b, emb))))
    images.append((f"{slug}-color-chart.jpg", "colorway-chart", "All colors",
                   jpeg(build_chart(design, blanks, emb), 91)))

    cur.execute("DELETE FROM product_images WHERE product_id=%s", (pid,))
    for rank, (fn, role, label, blob) in enumerate(images, start=1):
        cur.execute("""INSERT INTO product_images
                         (product_id, rank, role, label, filename, mime, bytes)
                       VALUES (%s,%s,%s,%s,%s,'image/jpeg',%s)""",
                    (pid, rank, "cover" if rank == 1 else role, label, fn, psycopg2.Binary(blob)))
    cur.execute("UPDATE products SET hero_colorway=%s, updated_at=now() WHERE id=%s",
                (blanks[MODELS[0]]["colorway"], pid))
    conn.commit()
    print(json.dumps({"ok": True, "slug": slug, "images": len(images),
                      "technique": technique, "cover": images[0][0]}))


if __name__ == "__main__":
    main()
