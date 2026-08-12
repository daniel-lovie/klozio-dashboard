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

    python3 scripts/make_emb_render.py <slug> [--force] [--head "shape description"]
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
from batch_runner import (local_cutout, palette_line, drop_background_specks,      # noqa: E402
                          key_cutout, KEY_COLOR)


def br_key() -> str:
    return KEY_COLOR

# NOT a patch. Asking for a patch got a patch: a white backing disc with a satin border round it,
# which is a separate object sewn onto a shirt. We stitch into the garment itself, so the motif has
# to be thread and nothing else — where there is no thread the customer sees their own shirt.
#
# The clause is split because "NO text" cannot stand when the shape description IS lettering — a
# prompt that asks for a stitched word and forbids letters in the same breath leaves the model to
# resolve the contradiction at random, which is how 98 catalogue prompts ended up unpredictable.
_STITCH_BASE = (
    "the motif stitched DIRECTLY onto fabric as machine embroidery, NOT a patch, NO backing disc, "
    "NO border ring around the outside, no badge edge, only the embroidered shapes themselves: "
    "dense satin stitch fills with visible individual thread strands, raised glossy rayon thread "
    "catching the light, stitch direction visible in every shape, thread sheen and depth, "
    "every shape complete and resting on nothing, "
    # Asked for a stitched word once and got it sitting on a stitched sunburst: rays radiating behind
    # the lettering, thread-textured so no cutout would ever drop them. Name what must not be behind.
    "nothing behind the motif — no sunburst, no rays, no starburst, no halo, no panel or plaque, "
    "bare background between and around every shape, "
    # Not white. White satin thread on a white backdrop is the same unkeyable image as a white duck on
    # white paper, and this clause is what put it there. The key colour cannot appear in thread.
    f"the motif sits alone on a plain solid uniform bright magenta {br_key()} background filling the whole "
    "frame, flat, no gradient, no shadow, no vignette; that magenta appears nowhere in the stitching, "
    "photographed straight on, no watermark"
)
_NO_LETTERS = ", NO text, NO letters, NO numbers"


def stitch_clause(with_text: bool = False) -> str:
    return _STITCH_BASE if with_text else _STITCH_BASE + _NO_LETTERS


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


def build(slug: str, force: bool = False, head_override: str | None = None,
          with_text: bool = False) -> dict:
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

    # A listing whose title promises stitched names has to SHOW them, and neither the stored idea nor
    # the hook is written as an image prompt. --head takes the shape description directly so the
    # lettering can be described properly; the model draws thread lettering cleanly, and the
    # typesetting step never reaches embroidery because the listing composites emb_render, not
    # print_file.
    spec = json.loads((HERE / "batch_gaming_01.json").read_text())
    concept = next((c for c in spec["concepts"] if c["slug"] == slug), None)
    if head_override:
        head = head_override.strip().rstrip(",")
    elif concept:
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
    prompt = (f"{head}, {stitch_clause(with_text)}, "
              f"{palette_line(threads or (concept or {}).get('threads'))}")

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

    # Key on the named colour and check it, exactly as the print path does: a leftover background is the
    # one defect that reaches the customer as visible dirt.
    cut, rep = key_cutout(raw, tmp / f"{slug}-cut.png")
    print(f"  kesim: opak %{rep['opaque_frac']*100:.1f}, zemin %{rep['bg_frac']*100:.1f}, "
          f"kalan anahtar piksel {rep['leftover_key_px']}", file=sys.stderr)
    if rep["bg_frac"] < 0.15 or rep["leftover_key_px"] > 200:
        raise SystemExit(f"{slug}: anahtar renk zemin cizilmedi ya da temizlenemedi "
                         f"(zemin %{rep['bg_frac']*100:.1f}, kalan {rep['leftover_key_px']}) — tekrar dene")
    im = drop_smooth_pockets(Image.open(cut).convert("RGBA"))
    im, cleared = drop_background_specks(im)
    if cleared:
        print(f"  {slug}: {cleared} beyaz zemin lekesi temizlendi", file=sys.stderr)
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
    ap.add_argument("--head", help="shape description to use instead of the stored idea/concept")
    ap.add_argument("--with-text", action="store_true",
                    help="the shape description asks for stitched lettering; drop the no-letters ban")
    a = ap.parse_args()
    print(json.dumps(build(a.slug, a.force, a.head, a.with_text)))


if __name__ == "__main__":
    main()
