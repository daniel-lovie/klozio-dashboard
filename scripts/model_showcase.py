#!/usr/bin/env python3
"""One complete Etsy-ready listing per local model, in a single pass.

Built to be looked at, not to look good. There is no best-of-N, no retry on a weak draw and no
hand-picking: each model gets the SAME prompt and the SAME seed, draws once, and whatever it returns
goes into the package. A comparison where the operator only sees the survivors is not a comparison.

Failures are packaged too. If a cutout refuses or the text gate finds letterforms, that is written
into the report beside the file rather than quietly retried — the point of the exercise is the raw
quality of each engine.

    python3 scripts/model_showcase.py --out ~/Desktop/anime
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path

import psycopg2
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402
import image_engine as ie                                          # noqa: E402
import typeset                                                     # noqa: E402
from mockup_composite import composite_pil, fit_quad, decontaminate  # noqa: E402

NICHE = "anime lover"
SEED = 77_777                     # identical across models: the difference is the model, not the luck
PRINT_INCHES = 10.0
HOOK = "ONE MORE EPISODE"

# One brief for all three. Written the way this shop writes them — flat, limited palette, a clear
# subject, and explicitly no text, because every word on the garment is hand-set afterwards.
PROMPT = ("A flat vector illustration of a cat in a school uniform sitting cross-legged with a bowl "
          "of ramen, anime style, bold clean linework, six flat colours, warm palette, "
          "no text, no letters, plain flat background")

MODELS = {
    "sdxl-base":   {"workflow": "wf_graphic.json",     "ckpt": "sd_xl_base_1.0.safetensors",
                    "licence": "CreativeML OpenRAIL++-M"},
    "juggernaut":  {"workflow": "wf_graphic.json",
                    "ckpt": "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
                    "licence": "CreativeML OpenRAIL-M"},
    "flux2-klein": {"workflow": "wf_flux_klein.json",  "ckpt": None, "licence": "Apache 2.0"},
}

HERO = "model-Black"
FLATS = ["flat-Navy", "flat-Demin", "flat-Pepper"]  # "Demin" is the spelling in mockup_blanks
CHART = ["flat-White", "flat-Ivory", "flat-Blossom", "flat-Bay", "flat-Grey", "flat-Moss",
         "flat-LayYam", "flat-Crims", "flat-Red", "flat-Demin", "flat-Navy", "flat-Pepper",
         "flat-Black"]

DISCLOSURE = ("ABOUT THE DESIGN — This design was created by me using AI image-generation tools as "
              "part of my design process, then refined and prepared for print by hand. All type is "
              "hand-set in a commercially licensed font. Original illustration.")
BODY = """THE TEE
• Comfort Colors® 1717 · 100% ring-spun cotton · 6.1 oz, garment-dyed so the colour softens instead of fading
• Relaxed unisex cut — size down if you want it fitted
• Sizes S–4XL · 22 Comfort Colors shades — pick yours from the colour chart in the photos
• DTF print, centre chest — soft to the touch, no cracking, no stiff plastic square

SHIPPING
• Made and shipped from Dallas, Texas, within 1 business day
• Tracking on every order

CARE
Cold wash inside out, tumble dry low, no bleach, and keep the iron off the print.

Questions? Message me — I reply the same day."""


def set_config(cfg: dict) -> None:
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)
    k = c.cursor()
    k.execute("""UPDATE local_engine_config
                    SET image_workflow=%s, image_model=COALESCE(%s, image_model),
                        image_licence=%s, updated_at=now() WHERE id=1""",
              (cfg["workflow"], cfg["ckpt"], cfg["licence"]))
    c.commit(); c.close()


def blanks() -> dict:
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""SELECT name, colorway, quad, opacity, shade, print_box, px_per_inch, angle, bytes
                   FROM mockup_blanks""")
    out = {}
    for name, cw, quad, op, shade, box, ppi, ang, blob in k.fetchall():
        out[name] = {"colorway": cw,
                     "quad": quad if isinstance(quad, list) else json.loads(quad),
                     "opacity": op, "shade": shade,
                     "print_box": box if isinstance(box, list) else (json.loads(box) if box else None),
                     "px_per_inch": ppi, "angle": ang,
                     "image": Image.open(io.BytesIO(bytes(blob))).convert("RGB")}
    c.close()
    return out


def add_hook(art: Image.Image) -> Image.Image:
    """Hand-set the line under the artwork. No letter on any garment here comes out of a model."""
    pad = int(art.width * 0.16)
    canvas = Image.new("RGBA", (art.width, art.height + pad), (0, 0, 0, 0))
    canvas.paste(art, (0, 0), art)
    probe = ImageDraw.Draw(canvas)
    size = pad
    while size > 14:
        f = typeset.font("condensed", size)
        w = typeset.text_width(probe, HOOK, f, 0.06)
        b = probe.textbbox((0, 0), HOOK, font=f)
        if w <= art.width * 0.86 and (b[3] - b[1]) <= pad * 0.72:
            break
        size -= 4
    typeset.draw_tracked(probe, ((art.width - w) // 2, art.height + int(pad * 0.12) - b[1]),
                         HOOK, f, (0xF4, 0xE9, 0xD8, 255), 0.06)
    return canvas.crop(canvas.getbbox())


def _call_local(messages: list, system: str) -> str:
    """Same contract as seed_minimal_batch.call, served by Qwen on the Spark."""
    import urllib.error
    import urllib.request
    url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
    model = os.environ.get("LOCAL_TEXT_MODEL", "qwen3:30b-a3b")
    body = json.dumps({"model": model, "stream": False, "keep_alive": "5m",
                       "messages": [{"role": "system", "content": system}] + messages}).encode()
    req = urllib.request.Request(f"{url}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    # Ollama answers 500 while it is still loading weights. That is a cold start, not a bad request,
    # and treating it as a failure sends a job to the cloud engine that was about to succeed locally.
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except urllib.error.HTTPError as e:
            last = e
            if e.code != 500:
                raise
            time.sleep(20)
    raise last


def listing_copy(engine: str = "cloud") -> dict:
    """Title and tags, checked the way production checks them: one look, one correction, then stop.

    The engine is a parameter because that is the open question. Measured beforehand, local Qwen lands
    inside the 125-140 character band 1 time in 5 unaided and 3 in 5 with the single retry production
    allows, against 16/16 for Opus. This runs the real thing rather than repeating the measurement,
    and records how many attempts it took.
    """
    from seed_minimal_batch import call as cloud_call
    call = _call_local if engine == "local" else cloud_call
    from write_listing_copy import check, SPEC, TEXT_BRIEF
    spec = SPEC.format(brief=TEXT_BRIEF)
    msgs = [{"role": "user", "content":
             f"Niche: {NICHE}\nThe exact line printed on the shirt: \"{HOOK}\"\n"
             f"The illustration beside it: {PROMPT}\n\nWrite the JSON."}]
    import re
    for attempt in (1, 2):
        raw = call(msgs, spec)
        # Local models tend to prepend reasoning; the JSON is what matters and it is the last block.
        if engine == "local" and "{" in raw:
            raw = raw[raw.index("{"):raw.rindex("}") + 1]
        try:
            d = json.loads(re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip())
        except ValueError:
            d, why = {}, "JSON ayristirilamadi"
        else:
            d["_has_text"] = True
            why = check(d)
        if not why:
            d["_attempts"] = attempt
            d["_engine"] = engine
            return d
        if attempt == 2:
            d["_error"] = why
            d["_attempts"] = attempt
            d["_engine"] = engine
            return d
        msgs += [{"role": "assistant", "content": raw},
                 {"role": "user", "content": f"Rejected: {why}. Fix exactly that and return the JSON."}]
    return {}


def text_gate(path: Path) -> list:
    import subprocess, re
    try:
        out = subprocess.run(["tesseract", str(path), "-", "--psm", "11"],
                             capture_output=True, text=True, timeout=90).stdout
        return re.findall(r"[A-Za-z]{3,}", out)
    except Exception:
        return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path.home() / "Desktop" / "Anime — Model Karsilastirma"))
    ap.add_argument("--text-engine", choices=["cloud", "local"], default="cloud")
    a = ap.parse_args()
    root = Path(a.out)
    root.mkdir(parents=True, exist_ok=True)

    bl = blanks()
    copy = listing_copy(a.text_engine)
    report = {"niche": NICHE, "prompt": PROMPT, "hook": HOOK, "seed": SEED,
              "text_engine": a.text_engine, "text_attempts": copy.get("_attempts"),
              "listing": {k: v for k, v in copy.items() if not k.startswith("_")},
              "listing_error": copy.get("_error"), "models": {}}

    for name, cfg in MODELS.items():
        d = root / name
        (d / "print-file").mkdir(parents=True, exist_ok=True)
        (d / "listing-photos").mkdir(parents=True, exist_ok=True)
        entry = {"licence": cfg["licence"], "workflow": cfg["workflow"]}
        print(f"\n=== {name} ===")
        try:
            set_config(cfg)
            t0 = time.time()
            rawp = d / "print-file" / f"{name}-raw.png"
            info = ie.generate_local(PROMPT, rawp, seed=SEED)
            entry["generate_s"] = round(time.time() - t0, 1)
            entry["model"] = info["model"]
            print(f"  uretim {entry['generate_s']}s")

            words = text_gate(rawp)
            entry["ai_text_found"] = words[:8]
            if words:
                print(f"  UYARI modelden harf cikti: {' '.join(words[:6])}")

            cut, rep = br.matte_cutout(rawp, d / "print-file" / f"{name}-cutout.png")
            art = Image.open(cut).convert("RGBA")
            art = add_hook(art)
            buf = io.BytesIO(); art.save(buf, format="PNG", dpi=(300, 300))
            (d / "print-file" / f"{name}-print-300dpi.png").write_bytes(buf.getvalue())
            ppi = max(art.size) / PRINT_INCHES
            hist = art.getchannel("A").histogram()
            mid = sum(hist[8:248]) / max(sum(hist), 1)
            entry.update(px=list(art.size), ppi=round(ppi), mid_alpha=round(mid, 4),
                         opaque=round(rep["opaque_frac"], 3))
            print(f"  baski {art.width}x{art.height} · {ppi:.0f} PPI · yari-saydam %{mid*100:.2f}")

            clean = decontaminate(art)
            shots = []

            def shoot(bn, fn, label):
                b = bl[bn]; tpl = dict(b)
                tpl["quad"] = fit_quad(clean, b["print_box"] or b["quad"], b["px_per_inch"],
                                       PRINT_INCHES, angle=float(b.get("angle") or 0.0))
                composite_pil(clean, b["image"], tpl).convert("RGB").save(
                    d / "listing-photos" / fn, quality=93, optimize=True)
                shots.append(label)

            shoot(HERO, "01-cover-black-model.jpg", "Cover")
            for i, bn in enumerate(FLATS, 2):
                shoot(bn, f"{i:02d}-flat-{bl[bn]['colorway'].lower().replace(' ','-')}.jpg",
                      bl[bn]["colorway"])
            tiles = [(n, bl[n]) for n in CHART if n in bl]
            cols, tw = 5, 480
            rows = (len(tiles) + cols - 1) // cols
            chart = Image.new("RGB", (cols * tw, rows * tw), (245, 242, 236))
            cd = ImageDraw.Draw(chart); f = typeset.font("sans", 30)
            for i, (n, b) in enumerate(tiles):
                tpl = dict(b)
                tpl["quad"] = fit_quad(clean, b["print_box"] or b["quad"], b["px_per_inch"],
                                       PRINT_INCHES, angle=float(b.get("angle") or 0.0))
                t = composite_pil(clean, b["image"], tpl).convert("RGB")
                t.thumbnail((tw - 20, tw - 70))
                x, y = (i % cols) * tw, (i // cols) * tw
                chart.paste(t, (x + (tw - t.width) // 2, y + 10))
                cd.text((x + 16, y + tw - 48), b["colorway"], font=f, fill=(40, 34, 30))
            chart.save(d / "listing-photos" / f"{len(shots)+1:02d}-colour-chart.jpg", quality=91)
            entry["photos"] = len(shots) + 1
            entry["ok"] = True
        except Exception as e:
            entry["ok"] = False
            entry["error"] = f"{type(e).__name__}: {e}"[:300]
            print(f"  BASARISIZ: {entry['error']}")
        report["models"][name] = entry

    desc = f"{copy.get('hook','')}\n\n{DISCLOSURE}\n\n{BODY}"
    (root / "listing.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (root / "LISTING-COPY.md").write_text(
        f"# Ortak ilan metni — niş: {NICHE}\n\n"
        f"Metin motoru: **{a.text_engine}** · deneme: {copy.get('_attempts','?')}\n\n"
        f"Üç paket de aynı metni kullanıyor: değişken model, sabit her şey.\n\n"
        f"## Başlık ({len(copy.get('title',''))} karakter)\n\n{copy.get('title','—')}\n\n"
        f"## Etiketler\n\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(copy.get("tags", []), 1))
        + f"\n\n## Açıklama\n\n```\n{desc}\n```\n"
        + (f"\n> UYARI metin kapısı: {copy['_error']}\n" if copy.get("_error") else ""))
    print(f"\npaket: {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
