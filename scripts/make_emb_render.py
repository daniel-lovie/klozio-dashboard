#!/usr/bin/env python3
"""Generate the embroidery MOCKUP image — the one that has to look stitched.

An embroidery product needs two different pictures of the same design, and confusing them is why
every mockup so far read as DTF:

  print_file   flat, exact thread hexes, no texture. This is what gets digitised, and any texture in
               it would be read as colour by the digitiser and stitched as such.
  emb_render   the same design rendered as real thread — satin fills, visible strands, sheen and
               relief. This is what the listing shows.

A flat vector composited onto a shirt looks like a print because it is one. Procedural texture over
it was tried — banding, rim shadow, ragged edge — and never convinced; the generator draws thread
far better than a filter imitates it.

    python3 scripts/make_emb_render.py <slug> [--force]
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from batch_runner import local_cutout, palette_line                 # noqa: E402

# NOT a patch. Asking for a patch got a patch: a white backing disc with a satin border round it,
# which is a separate object sewn onto a shirt. We stitch into the garment itself, so the motif has
# to be thread and nothing else — where there is no thread the customer sees their own shirt.
STITCH_CLAUSE = (
    "the motif stitched DIRECTLY onto fabric as machine embroidery, NOT a patch, NO backing disc, "
    "NO border ring around the outside, no badge edge, only the embroidered shapes themselves: "
    "dense satin stitch fills with visible individual thread strands, raised glossy rayon thread "
    "catching the light, stitch direction visible in every shape, thread sheen and depth, "
    "every shape complete and resting on nothing, "
    "isolated on a plain pure white background, photographed straight on, "
    "NO text, NO letters, NO numbers, no watermark"
)


def drop_smooth_pockets(im: Image.Image, min_frac: float = 0.004) -> Image.Image:
    """Open up enclosed areas that are background rather than thread.

    The general cutout keeps an enclosed light region on purpose — that rule exists because it once
    erased the white interior of a personalisation ribbon. On an embroidery render the same rule
    keeps the plain white disc inside a ring, and the listing then shows a patch stuck on the shirt
    instead of a motif stitched into it.

    Thread and paper are easy to tell apart without knowing which is which: stitching has grain, and
    the generator's backdrop does not. Enclosed regions whose local variation is near zero are
    background and are opened; anything with texture is thread and stays.
    """
    from scipy import ndimage

    a = np.asarray(im).astype(np.uint8).copy()
    alpha = a[:, :, 3] > 128
    if not alpha.any():
        return im
    grey = np.asarray(Image.fromarray(a[:, :, :3]).convert("L")).astype(float)
    m = ndimage.uniform_filter(grey, 7)
    var = np.sqrt(np.maximum(ndimage.uniform_filter(grey * grey, 7) - m * m, 0))

    holes = ndimage.binary_fill_holes(alpha) & ~alpha            # already-open pockets
    lab, n = ndimage.label(alpha)
    # look at enclosed BRIGHT regions inside the motif
    bright = alpha & (grey > 205)
    lb, nb = ndimage.label(bright)
    total = alpha.sum()
    opened = 0
    for i in range(1, nb + 1):
        region = lb == i
        if region.sum() < total * min_frac:
            continue
        if float(np.median(var[region])) < 2.5:                  # smooth -> backdrop, not stitching
            a[:, :, 3][region] = 0
            opened += int(region.sum())
    if opened:
        # the freshly opened edge is background-coloured again; pull colour in from what remains
        keep = a[:, :, 3] > 128
        if keep.any():
            idx = ndimage.distance_transform_edt(~keep, return_distances=False, return_indices=True)
            a[:, :, :3] = a[:, :, :3][idx[0], idx[1]]
    return Image.fromarray(a, "RGBA")


def build(slug: str, force: bool = False) -> dict:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""SELECT id, technique, thread_colors, emb_render IS NOT NULL
                     FROM products WHERE slug=%s""", (slug,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"{slug}: urun yok")
    pid, technique, threads, have = row
    if technique != "embroidery":
        raise SystemExit(f"{slug}: nakis urunu degil")
    if have and not force:
        return {"slug": slug, "skipped": "zaten var"}

    # The batch spec only covers the current campaign. Older products predate it, so their shape
    # description comes from the row itself — visual_idea is the human sentence, design_prompt the
    # generated one, and either describes the same emblem.
    spec = json.loads((HERE / "batch_gaming_01.json").read_text())
    concept = next((c for c in spec["concepts"] if c["slug"] == slug), None)
    if concept:
        head = concept["prompt_head"].strip().rstrip(",")
    else:
        cur.execute("SELECT visual_idea, design_prompt, hook FROM products WHERE id=%s", (pid,))
        idea, dprompt, hook = cur.fetchone()
        head = (idea or hook or "").strip()
        if not head and dprompt:
            # strip any instruction to render words: the motif is the shape, never the lettering
            head = re.split(r"the design contains", dprompt, flags=re.I)[0].strip()
        if not head:
            raise SystemExit(f"{slug}: sekil tarifi yok, elle prompt gerekiyor")
        head = head.rstrip(",")
    prompt = f"{head}, {STITCH_CLAUSE}, {palette_line(threads or concept.get('threads'))}"

    tmp = Path(tempfile.mkdtemp())
    raw = tmp / f"{slug}-emb.png"
    args = {"op": "generate", "prompt": prompt, "out": str(raw),
            "model": "gpt_image_2", "resolution": "2k", "quality": "medium"}
    proc = subprocess.run(["node", "--experimental-strip-types", str(HERE / "hf_gen.mts"),
                           json.dumps(args)], capture_output=True, text=True, timeout=900)
    line = (proc.stdout or "").strip().split("\n")[-1] or "{}"
    res = json.loads(line)
    if not res.get("ok"):
        raise SystemExit(f"{slug}: uretim basarisiz {res.get('error')}")

    cut = local_cutout(raw, tmp / f"{slug}-cut.png")
    im = drop_smooth_pockets(Image.open(cut).convert("RGBA"))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    cur.execute("UPDATE products SET emb_render=%s, updated_at=now() WHERE id=%s",
                (psycopg2.Binary(buf.getvalue()), pid))
    conn.commit()
    return {"slug": slug, "size": list(im.size), "kb": len(buf.getvalue()) // 1024}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    print(json.dumps(build(a.slug, a.force)))


if __name__ == "__main__":
    main()
