#!/usr/bin/env python3
"""Phase 2 bake-off: which local checkpoint becomes the default workflow.

The spec leaves this as open question 3 and names the criterion as prompt adherence against ten
reference Higgsfield outputs. That is the right primary test and it needs a human eye, so this script
does not pretend to judge it. What it DOES do is measure the three things that can be measured, and
that a human eye is bad at:

  FLATNESS after background removal. Every design here is printed by DTF, and partly-transparent
  pixels are what a transfer cannot lay down. The shop's drawn files run 0.02-0.48%; a candidate at
  15% has produced something unprintable however good it looks on screen.

  PALETTE DISCIPLINE. Flat vector work should resolve to a small number of inks. A model that returns
  4,000 distinct colours for "flat, limited palette" is not following the brief.

  EFFECTIVE PPI after the standard 4x upscale, measured on the bounding box at the ten inches the
  producer actually prints.

Each candidate draws the same prompts with the same seeds, so the comparison is of models, not luck.

    python3 bakeoff.py --out ~/dgx-out/bakeoff
"""
from __future__ import annotations

import argparse, json, subprocess, sys, time, urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
WFDIR = Path.home() / "ComfyUI" / "workflows"

# Deliberately the shop's own kind of brief, not generic prompt-adherence bait: flat, limited palette,
# a clear subject, no text. If a model cannot do this it cannot do the job regardless of its benchmarks.
PROMPTS = [
    "flat vector illustration of a stack of colourful books under a crescent moon, bold shapes, limited palette, sticker style, plain background",
    "flat vector illustration of a leaping trout over a mountain range, retro outdoor badge, four flat colours, plain background",
    "flat vector illustration of a sleeping cat curled on an open book, warm limited palette, bold shapes, plain background",
    "flat vector illustration of a cup of coffee with steam forming constellations, two-tone, bold simple shapes, plain background",
    "flat vector illustration of a vintage camping tent under pine trees and stars, retro badge style, flat colours, plain background",
]
NEGATIVE = "text, words, letters, typography, watermark, signature, gradient, photorealistic, 3d render, drop shadow, busy detail"
SEEDS = [101, 202, 303]

CANDIDATES = {
    "sdxl-base":  {"wf": "wf_graphic.json", "ckpt": "sd_xl_base_1.0.safetensors",
                   "licence": "CreativeML OpenRAIL++-M"},
    "juggernaut": {"wf": "wf_graphic.json", "ckpt": "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
                   "licence": "CreativeML OpenRAIL-M"},
    # The spec's primary candidate, and the only one whose licence carries no use restrictions at all.
    # It is not a checkpoint: UNET, text encoder and VAE load separately, so it needs its own graph.
    "flux2-klein": {"wf": "wf_flux_klein.json", "ckpt": None, "licence": "Apache 2.0"},
}


def submit(cand: dict, prompt: str, seed: int) -> str:
    g = json.loads((WFDIR / cand["wf"]).read_text())
    if cand.get("ckpt"):
        g["4"]["inputs"]["ckpt_name"] = cand["ckpt"]
    g["6"]["inputs"]["text"] = prompt
    g["7"]["inputs"]["text"] = NEGATIVE if cand.get("ckpt") else ""
    g["3"]["inputs"]["seed"] = seed
    req = urllib.request.Request(f"{COMFY}/prompt", data=json.dumps({"prompt": g}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())["prompt_id"]


def wait(pid: str, timeout: int = 400):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.loads(urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30).read())
        if pid in h:
            imgs = [i for o in h[pid].get("outputs", {}).values() for i in o.get("images", [])]
            return imgs, time.time() - t0
        time.sleep(2)
    raise TimeoutError(pid)


def measure(path: Path) -> dict:
    from PIL import Image
    from rembg import remove
    im = Image.open(path).convert("RGBA")
    cut = remove(im)
    a = cut.getchannel("A").point(lambda v: 0 if v < 96 else (255 if v > 168 else v))
    cut.putalpha(a)
    bb = cut.getbbox() or (0, 0, cut.width, cut.height)
    art = cut.crop(bb)
    up = art.resize((art.width * 4, art.height * 4), Image.LANCZOS)
    hist = up.getchannel("A").histogram()
    mid = sum(hist[8:248]) / max(sum(hist), 1)
    # Colours counted on the opaque body only; the alpha edge would otherwise dominate the count.
    px = [p[:3] for p in art.convert("RGBA").getdata() if p[3] == 255]
    inks = len({(r // 16, g // 16, b // 16) for r, g, b in px})
    return {"ppi": max(up.size) / 10.0, "mid_alpha": mid, "inks": inks}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path.home() / "dgx-out" / "bakeoff"))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    rows = []
    for name, cand in CANDIDATES.items():
        if cand.get("ckpt"):
            ck = Path.home() / "ComfyUI" / "models" / "checkpoints" / cand["ckpt"]
            if not ck.exists():
                print(f"{name}: checkpoint yok, atlandi"); continue
        if not (WFDIR / cand["wf"]).exists():
            print(f"{name}: workflow yok, atlandi"); continue
        for pi, prompt in enumerate(PROMPTS):
            for seed in SEEDS:
                try:
                    pid = submit(cand, prompt, seed)
                    imgs, el = wait(pid)
                except Exception as e:
                    print(f"  {name} p{pi} s{seed}: HATA {type(e).__name__}"); continue
                src = Path.home() / "ComfyUI" / "output" / imgs[0]["subfolder"] / imgs[0]["filename"]
                m = measure(src)
                dst = out / f"{name}-p{pi}-s{seed}.png"
                subprocess.run(["cp", str(src), str(dst)], check=False)
                rows.append({"model": name, "licence": cand["licence"], "prompt": pi, "seed": seed,
                             "seconds": round(el, 1), **m, "file": dst.name})
                print(f"  {name:11} p{pi} s{seed}  {el:5.1f}s  {m['ppi']:4.0f} PPI  "
                      f"yari-saydam %{m['mid_alpha']*100:5.2f}  {m['inks']:4d} ink")

    (out / "bakeoff.json").write_text(json.dumps(rows, indent=2) + "\n")
    print(f"\n{'model':12} {'sure':>7} {'PPI':>6} {'yari-saydam':>12} {'ink':>6}")
    for name in CANDIDATES:
        r = [x for x in rows if x["model"] == name]
        if not r: continue
        n = len(r)
        print(f"{name:12} {sum(x['seconds'] for x in r)/n:6.1f}s {sum(x['ppi'] for x in r)/n:6.0f} "
              f"{sum(x['mid_alpha'] for x in r)/n*100:11.2f}% {sum(x['inks'] for x in r)/n:6.0f}")
    print(f"\ngorseller: {out}  ({len(rows)} adet) — prompt uyumu goze bakar, karar operatorun")
    return 0


if __name__ == "__main__":
    sys.exit(main())
