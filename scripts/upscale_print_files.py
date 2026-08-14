#!/usr/bin/env python3
"""Raise stored print files to the print envelope without changing the design.

178 products carry a print file the cutout downsampled to 2048 px, which is 205 PPI across a ten inch
print — a fifth short of the standard this shop states. Regenerating would fix the resolution and hand the
buyer a different shirt: 40 of them are live, already photographed into eight mockups each and already
approved. So the artwork is upscaled, not redrawn.

Two things the upscaler does that have to be undone. It returns RGB with no alpha at all — the test file
came back 100% opaque, which would print as a solid rectangle on the garment — so the ORIGINAL alpha is
resized and re-applied. And it doubles rather than honouring a target, so the result is resampled down to
the envelope: 3000 px, exactly ten inches at 300 PPI.

    python3 scripts/upscale_print_files.py --limit 5        # try a few first
    python3 scripts/upscale_print_files.py                  # everything under the floor
    python3 scripts/upscale_print_files.py --live           # include the live ones
"""
from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import produce_images as pi   # noqa: E402 — one authority on a product's print size
from PIL import Image

TARGET = 3000                 # 10 inches at 300 PPI
FLOOR = 2850                  # anything at or above this already prints at standard
ROOT = Path(__file__).resolve().parent


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30,
                            keepalives=1, keepalives_idle=20)


def upscale_one(pid: int, slug: str, blob: bytes) -> tuple[int, str, bytes | None, str]:
    """Returns (pid, slug, new_png_bytes or None, message). Never raises.

    An exception here used to travel out through pool.map and end the whole run: one file that hung past the
    fifteen-minute timeout took the remaining hundred and twenty with it, and the batch reported success
    because the shell saw a clean exit. One slow file is one skipped file.
    """
    try:
        return _upscale_one(pid, slug, blob)
    except Exception as e:                                   # noqa: BLE001 — a batch must outlive one item
        return pid, slug, None, f"{type(e).__name__}: {str(e)[:120]}"


def _upscale_one(pid: int, slug: str, blob: bytes) -> tuple[int, str, bytes | None, str]:
    src = Image.open(io.BytesIO(blob)).convert("RGBA")
    with tempfile.TemporaryDirectory() as td:
        p_in, p_out = Path(td) / "in.png", Path(td) / "out.png"
        src.save(p_in)
        args = {"op": "upscale", "src": str(p_in), "out": str(p_out), "width": TARGET}
        r = subprocess.run(["node", "--experimental-strip-types", str(ROOT / "hf_gen.mts"),
                            json.dumps(args)], capture_output=True, text=True, timeout=300)
        line = (r.stdout or "").strip().splitlines()[-1] if r.stdout.strip() else "{}"
        try:
            res = json.loads(line)
        except ValueError:
            return pid, slug, None, f"cikti okunamadi: {line[:120]}"
        if not res.get("ok"):
            return pid, slug, None, f"yukseltme reddedildi: {res.get('error', '?')[:120]}"

        up = Image.open(p_out).convert("RGB")

    # The alpha is the whole value of a print file; the upscaler discards it, so it comes from the original.
    alpha = src.getchannel("A").resize(up.size, Image.LANCZOS)
    out = Image.merge("RGBA", (*up.split(), alpha))
    out.thumbnail((TARGET, TARGET), Image.LANCZOS)
    # Two LANCZOS passes over a binary mask feather it. Measured on a real cutout: a source with exactly
    # two alpha values came out with 256 of them and 37,047 semi-transparent pixels — a 2-3px soft ring.
    # On screen that is invisible; in DTF the white underbase is generated FROM the alpha, so a partial
    # alpha means partial powder adhesion and a crumbly, haloed edge on dyed cotton. Put the edge back to
    # binary. The guard below thresholds at >128 and so was blind to every pixel it had just created.
    ch = list(out.split())
    ch[3] = ch[3].point(lambda v: 255 if v >= 128 else 0)
    out = Image.merge("RGBA", ch)

    # Prove it before writing. A silent alpha loss here reaches the producer as a solid block of ink.
    a0 = (np.asarray(src)[..., 3] > 128).mean()
    a1 = (np.asarray(out)[..., 3] > 128).mean()
    if abs(a0 - a1) > 0.02:
        return pid, slug, None, f"alfa degisti (%{a0*100:.1f} -> %{a1*100:.1f}), yazilmadi"
    semi = int(((np.asarray(out)[..., 3] > 0) & (np.asarray(out)[..., 3] < 255)).sum())
    if semi:
        return pid, slug, None, f"{semi} yari saydam piksel kaldi — DTF beyaz altligi bozulur, yazilmadi"
    if max(out.size) < FLOOR:
        return pid, slug, None, f"hedefe ulasilamadi ({out.size[0]}x{out.size[1]})"
    # And that it is still the same design: the point of upscaling instead of regenerating.
    s = np.asarray(src.convert("RGB").resize((256, 256), Image.LANCZOS)).astype(float)
    t = np.asarray(out.convert("RGB").resize((256, 256), Image.LANCZOS)).astype(float)
    m = np.asarray(src.getchannel("A").resize((256, 256), Image.LANCZOS)) > 128
    diff = float(np.abs(s - t)[m].mean()) if m.any() else 0.0
    if diff > 30:
        return pid, slug, None, f"tasarim degismis (fark {diff:.0f}/255), yazilmadi"

    buf = io.BytesIO()
    # Tagged sRGB and 300 DPI: an untagged PNG has no pHYs chunk and the producer's RIP imports it at its
    # own default, which is the manual step that produces a wrong-sized print.
    try:
        from PIL import ImageCms                              # noqa: PLC0415
        icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    except Exception:                                          # noqa: BLE001
        icc = None
    out.save(buf, format="PNG", optimize=True, dpi=(300, 300), **({"icc_profile": icc} if icc else {}))
    return pid, slug, buf.getvalue(), f"{src.size[0]} -> {out.size[0]} px, fark {diff:.0f}/255"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--live", action="store_true", help="yayindaki urunleri de yukselt")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()

    c = conn()
    k = c.cursor()
    k.execute(f"""SELECT id, slug, print_file FROM products
                   WHERE print_file IS NOT NULL
                     AND greatest(print_file_w, print_file_h) < {FLOOR}
                     {'' if a.live else 'AND etsy_listing_id IS NULL'}
                   ORDER BY id {f'LIMIT {int(a.limit)}' if a.limit else ''}""")
    todo = [(r[0], r[1], bytes(r[2])) for r in k.fetchall()]
    c.close()
    print(f"{len(todo)} baski dosyasi yukseltilecek", file=sys.stderr)

    ok = fail = 0
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        for pid, slug, data, msg in pool.map(lambda t: upscale_one(*t), todo):
            if data is None:
                fail += 1
                print(f"  HATA {slug}: {msg}", file=sys.stderr)
                continue
            im = Image.open(io.BytesIO(data))
            # The REAL effective PPI, not the number we wish were true. Writing 300 unconditionally is how
            # a 2048px file ended up recorded at 300 dpi (and, via template-clone, at 323): upscaling to a
            # bigger canvas does not make the artwork 300 PPI if the artwork still occupies 1900 of those
            # pixels. This column is what the product page shows the operator.
            bb = im.convert("RGBA").getbbox()
            art = max(bb[2] - bb[0], bb[3] - bb[1]) if bb else max(im.size)
            c = conn(); k = c.cursor()
            k.execute("SELECT design_params FROM products WHERE id=%s", (pid,))
            dp = (k.fetchone() or [None])[0]
            want = pi.print_placement(dp)["inches"]
            k.execute("""UPDATE products SET print_file=%s, print_file_w=%s, print_file_h=%s,
                                print_dpi=%s, updated_at=now() WHERE id=%s""",
                      (psycopg2.Binary(data), im.width, im.height, round(art / max(want, 0.1)), pid))
            c.commit(); c.close()
            ok += 1
            print(f"  {slug}: {msg}", file=sys.stderr)
    print(json.dumps({"ok": ok, "failed": fail, "total": len(todo)}))
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
