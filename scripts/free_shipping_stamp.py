#!/usr/bin/env python3
"""Stamp FREE SHIPPING on the cover image, the way the bestsellers do it.

The reference the operator supplied is a rubber-stamp mark: red, slightly rotated, thin double border,
sitting over the top-right of the photo and running partly off the edge so it reads as applied to the
picture rather than composed into it. That last detail is what makes it look like a stamp and not a
badge, so it is reproduced deliberately: the mark is drawn oversized and cropped by the canvas.

Scope is per shop. Klozio (1) on 2026-08-16, HillsByElgin (2) the same day once its shipping was
also set to $0 — the stamp is only honest where the shipping actually is free.

Two rules this follows because the thumbnail is the product's only advertisement:

  IT NEVER COVERS THE ARTWORK. The stamp is placed in the top-right, and the placement is checked
  against where the ink actually sits — if the corner is busy, it moves down rather than sitting on
  top of the design.
  IT IS REVERSIBLE. The original bytes are kept in a sibling row (role='cover_unstamped') before the
  cover is replaced, so the stamp can be removed without regenerating anything.

    python3 scripts/free_shipping_stamp.py --preview       # write one sample PNG, touch nothing
    python3 scripts/free_shipping_stamp.py --apply         # stamp every live Klozio cover in the DB
"""
from __future__ import annotations

import argparse
import io
import math
import os
import sys
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# The shop is an argument, not a constant. This started as a Klozio-only tactic and was extended to
# HillsByElgin the same day; a hardcoded 1 would have quietly stamped the wrong shop's covers.
DEFAULT_SHOP = 1
STAMP_RED = (206, 32, 28)
TEXT = "FREE SHIPPING"
ANGLE = 8                         # degrees, counter-clockwise — a stamp is never applied square
# Smaller and lower than the reference, by operator direction on 2026-08-16: at the top-right corner it
# fought the model's face and hair for the eye. Sitting around waist height on the right it reads as
# applied to the photo and leaves the garment and the print unobstructed.
WIDTH_FRAC = 0.30                 # stamp width as a fraction of the cover width
X_FRAC = 0.47                     # left edge of the stamp, as a fraction of the cover width
Y_FRAC = 0.61                     # top edge, as a fraction of the cover height — roughly the waist


def _font(px: int) -> ImageFont.FreeTypeFont:
    """The vendored condensed face, so local and container renders match."""
    import typeset                                                 # noqa: PLC0415
    return typeset.font("condensed", px)


def make_stamp(width: int) -> Image.Image:
    """The mark itself, on transparency, before rotation."""
    pad_x, pad_y = int(width * 0.055), int(width * 0.045)
    size = max(12, int(width * 0.155))
    f = _font(size)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    box = probe.textbbox((0, 0), TEXT, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]

    w, h = tw + pad_x * 2, th + pad_y * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    outer = max(2, int(width * 0.009))
    inner = max(1, int(width * 0.004))
    gap = max(3, int(width * 0.011))
    d.rectangle([0, 0, w - 1, h - 1], outline=STAMP_RED, width=outer)
    d.rectangle([gap, gap, w - 1 - gap, h - 1 - gap], outline=STAMP_RED, width=inner)
    d.text((pad_x - box[0], pad_y - box[1]), TEXT, font=f, fill=STAMP_RED)
    return im


def busy(im: Image.Image, box: tuple[int, int, int, int]) -> float:
    """How much is going on inside a region — used to keep the stamp off the artwork.

    Plain variance would call a smooth gradient busy and a flat printed shape quiet, which is backwards
    here. Edge energy is what actually competes with a stamp, so that is what is measured.
    """
    crop = im.crop(box).convert("L").resize((80, 80))
    px = crop.load()
    total = 0
    for y in range(79):
        for x in range(79):
            total += abs(px[x, y] - px[x + 1, y]) + abs(px[x, y] - px[x, y + 1])
    return total / (79 * 79 * 2 * 255)


def stamp_cover(data: bytes) -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    W, H = im.size
    stamp = make_stamp(int(W * WIDTH_FRAC)).rotate(ANGLE, expand=True, resample=Image.BICUBIC)

    x = int(W * X_FRAC)
    # Waist height, then nudged if that band happens to be busy on this particular photo. Only small
    # moves — the point of a fixed position is that the mark lands in the same place across the shop.
    candidates = [int(H * Y_FRAC), int(H * (Y_FRAC - 0.07)), int(H * (Y_FRAC + 0.07))]
    best_y, best_score = candidates[0], None
    for y in candidates:
        y = max(0, min(y, H - stamp.height))
        score = busy(im, (x, y, min(W, x + stamp.width), min(H, y + stamp.height)))
        if best_score is None or score < best_score:
            best_y, best_score = y, score
        if score < 0.05:
            best_y = y
            break

    im.paste(stamp, (x, best_y), stamp)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=92, optimize=True)
    return out.getvalue()


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def covers(cur, shop_id: int, pattern: str | None):
    """The first image of every listing in the shop — that is the one Etsy shows in search.

    Live listings only by default, because that is what the tactic was retrofitted onto. Pass a slug
    pattern to reach products that have NOT been published yet: stamping before the first push means
    the listing carries the stamp from its first minute instead of needing a second image resync.
    """
    cur.execute(f"""
        SELECT DISTINCT ON (p.id) p.id, p.slug, g.id, g.bytes
          FROM products p
          JOIN product_images g ON g.product_id = p.id
         WHERE p.shop_id = %s
           {"AND p.slug LIKE %s" if pattern else "AND p.etsy_listing_id IS NOT NULL"}
           AND NOT EXISTS (SELECT 1 FROM product_images u
                            WHERE u.product_id = p.id AND u.role = 'cover_unstamped')
         ORDER BY p.id, g.rank NULLS LAST, g.id""",
                (shop_id, pattern) if pattern else (shop_id,))
    return cur.fetchall()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--out", default="/tmp/stamp-preview.jpg")
    ap.add_argument("--shop", type=int, default=DEFAULT_SHOP)
    ap.add_argument("--pattern", help="slug kalibi; yayinlanmamis urunlere de damga basar")
    a = ap.parse_args()

    c = conn()
    k = c.cursor()
    rows = covers(k, a.shop, a.pattern)
    print(f"shop {a.shop} — damgalanacak kapak: {len(rows)}")

    if a.preview:
        if not rows:
            print("damgalanacak kapak yok")
            return 0

        pid, slug, gid, data = rows[0]
        Path(a.out).write_bytes(stamp_cover(bytes(data)))
        print(f"onizleme: {slug} -> {a.out}")
        c.close()
        return 0

    if not a.apply:
        print("\nDRY RUN. --preview ile ornek gor, --apply ile uygula.")
        c.close()
        return 0

    done = 0
    for pid, slug, gid, data in rows:
        original = bytes(data)
        # Keep the original FIRST. A stamp that cannot be removed is a cover that has to be rebuilt.
        k.execute("""INSERT INTO product_images (product_id, rank, role, label, filename, mime,
                                                 width, height, bytes, created_at)
                     SELECT product_id, 9000, 'cover_unstamped', label, filename, mime,
                            width, height, bytes, now()
                       FROM product_images WHERE id = %s""", (gid,))
        stamped = stamp_cover(original)
        im = Image.open(io.BytesIO(stamped))
        k.execute("""UPDATE product_images SET bytes=%s, mime='image/jpeg', width=%s, height=%s
                      WHERE id=%s""", (psycopg2.Binary(stamped), im.width, im.height, gid))
        done += 1
        print(f"  {slug}")
    c.commit()

    # Count what LANDED, not what was attempted. The loop reported 16 stamps on a run that produced 15:
    # one product came out with neither a stamped cover nor a backup row, and nothing said so, because
    # the number printed was the number of iterations. A write is not done until the database agrees.
    k.execute("""SELECT p.slug FROM products p
                  WHERE p.id = ANY(%s)
                    AND NOT EXISTS (SELECT 1 FROM product_images u
                                     WHERE u.product_id = p.id AND u.role = 'cover_unstamped')""",
              ([r[0] for r in rows],))
    missing = [r[0] for r in k.fetchall()]
    c.close()

    landed = done - len(missing)
    print(f"\n{landed}/{done} kapak damgalandi (orijinaller role='cover_unstamped' olarak saklandi). "
          f"Etsy'ye gitmesi icin resync gerekir.")
    if missing:
        print(f"YAZILAMADI: {missing} — tekrar calistir, damgasiz olduklari icin cift damga riski yok",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
