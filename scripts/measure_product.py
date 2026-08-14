#!/usr/bin/env python3
"""Deterministic measurements of one product's actual output, as JSON.

The web agent could act but not check. It has SQL and it has produce, so "the cutout is clean" was always
a quote of what the pipeline printed rather than a look at the file — and the one rule this project keeps
learning the hard way is that you judge the OUTPUT, not the input. This gives it the numbers.

Everything here is measured from the stored bytes, not read back from a column, because a column is what
someone claimed and the bytes are what the producer will print.

    python3 scripts/measure_product.py <product_id>
"""
from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batch_runner as br                                    # noqa: E402

# Comfort Colors shades the mockups use, so a design can be judged against the cloth it will sit on.
GARMENTS = {"Ivory": (240, 234, 214), "Pepper": (77, 74, 70), "Black": (28, 28, 28),
            "White": (248, 246, 242), "Bay": (122, 150, 158), "Moss": (107, 114, 80)}


def lum(rgb) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def main() -> int:
    pid = int(sys.argv[1])
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=25)
    k = c.cursor()
    k.execute("""SELECT slug, print_file, hero_colorway, technique, hook, design_params,
                        price_cents, pod_cost_cents, label_cost_cents, gross_margin_pct, net_margin_pct,
                        (SELECT count(*) FROM product_images g WHERE g.product_id = p.id) AS images
                   FROM products p WHERE id = %s""", (pid,))
    row = k.fetchone()
    c.close()
    if not row:
        print(json.dumps({"error": f"urun {pid} yok"}))
        return 1
    (slug, pf, hero, technique, hook, params, price, pod, label, gross, net, images) = row

    out: dict = {"product_id": pid, "slug": slug, "technique": technique, "hook": hook,
                 "hero_colorway": hero, "images": images}

    if not pf:
        out["print_file"] = None
        out["note"] = "baski dosyasi yok — olculecek bir cikti yok"
        print(json.dumps(out, ensure_ascii=False))
        return 0

    im = Image.open(io.BytesIO(bytes(pf))).convert("RGBA")
    a = np.asarray(im)
    alpha = a[..., 3]
    opaque = alpha > 128
    rgb = a[..., :3]

    # Resolution against the size this design says it prints at, not against a fixed ten inches.
    import produce_images as pi                              # noqa: PLC0415
    want_in = pi.print_placement(params if isinstance(params, dict) else None)["inches"]
    out["print_file"] = {
        "px": [im.width, im.height],
        "size_in_at_300": round(max(im.size) / br.PRINT_PPI, 1),
        "declared_in": want_in,
        "meets_300ppi": max(im.size) / br.PRINT_PPI >= want_in * 0.95,
        "opaque_pct": round(float(opaque.mean()) * 100, 1),
    }

    # Edge contact: the matte filled the canvas, so artwork on the border means the composition ran off it.
    band = max(float(b.mean()) for b in (opaque[:2, :], opaque[-2:, :], opaque[:, :2], opaque[:, -2:]))
    out["print_file"]["edge_contact_pct"] = round(band * 100, 2)
    out["print_file"]["cropped"] = band > 0.02

    # Leftover key colour — the one defect that reaches the buyer as visible dirt.
    kr, kg, kb = (int(br.KEY_COLOR[i:i + 2], 16) for i in (1, 3, 5))
    dist = np.sqrt(((rgb.astype(int) - np.array([kr, kg, kb])) ** 2).sum(axis=2))
    out["print_file"]["leftover_key_px"] = int((opaque & (dist <= 60)).sum())

    # A large flat pale field inside the artwork is a backing plate: invisible on ivory, a cream slab on
    # Pepper. This is what the other model's die-cut sticker looked like, and it is measurable.
    if opaque.any():
        pale = opaque & (np.apply_along_axis(lum, 2, rgb) > 215)
        out["print_file"]["pale_field_pct"] = round(float(pale.sum()) / float(opaque.sum()) * 100, 1)

    # Contrast against every garment, so the answer to "which shirt" is measured rather than remembered.
    if opaque.any():
        ink = float(np.apply_along_axis(lum, 2, rgb)[opaque].mean())
        out["ink_luminance"] = round(ink, 1)
        out["garment_contrast"] = {name: round(abs(ink - lum(v)), 1) for name, v in GARMENTS.items()}
        out["garment_best"] = max(out["garment_contrast"], key=out["garment_contrast"].get)
        if hero and hero in out["garment_contrast"]:
            out["hero_contrast"] = out["garment_contrast"][hero]
            # 35 is the floor the image builder uses before it drops a model shot as unreadable.
            out["hero_readable"] = out["garment_contrast"][hero] >= 35

    # Margin from what the buyer pays, not from the anchor.
    if price and pod is not None:
        eff = price * 0.70 / 100
        cogs = (pod + (label or 0)) / 100
        g = (eff - cogs) / eff * 100 if eff else 0.0
        out["margin"] = {
            "anchor": round(price / 100, 2), "effective": round(eff, 2), "cogs": round(cogs, 2),
            "gross_pct": round(g, 1), "stored_gross_pct": float(gross) if gross is not None else None,
            "stored_net_pct": float(net) if net is not None else None,
            "meets_gross_floor": g >= 55,
        }

    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
