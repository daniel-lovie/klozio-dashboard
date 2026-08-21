#!/usr/bin/env python3
"""Which engine draws a design — the local Spark, or Higgsfield.

This is the seam the whole DGX project turns on. `produce_product.py` made exactly one call to
Higgsfield; it now makes one call to here, and here decides. Nothing else in the pipeline changes:
same prompt, same file on disk, same cutout and gates afterwards.

Three rules it exists to keep:

  THE CLOUD PATH IS NEVER DELETED. `LOCAL_ENGINE=off` — the default — restores byte-identical
  behaviour with no deploy. It is the kill switch for a device sitting in someone's flat.

  ROUTING NEEDS A LIVE HEARTBEAT, not an absence of errors. A Spark that is switched off has not
  failed, it is simply silent, and sending work to it means a product that never gets drawn.

  THE MODEL IS NOT DECIDED HERE. Which checkpoint draws is a row in `local_engine_config`, because
  that choice belongs to the team's votes on the output and will change when they have seen enough.
  A constant in code is a decision nobody can revisit without a deploy.

Falling back is silent by design at the product level and loud in the record: `design_feedback` gets
the engine that actually drew, so nobody has to guess later how much work local really carried.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
HEARTBEAT_STALE_S = 300
IMAGE_TIMEOUT_S = 600
WORKER = "dgx-spark"


def _db():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)


def rollout() -> str:
    raw = (os.environ.get("LOCAL_ENGINE") or "off").strip()
    if raw in ("off", "internal", "default_on") or raw.startswith("percent:"):
        return raw
    # A typo must not route production traffic at a home machine.
    print(f"UYARI image_engine: LOCAL_ENGINE={raw!r} anlasilmadi, 'off' varsayildi")
    return "off"


def worker_alive() -> bool:
    try:
        c = _db(); k = c.cursor()
        k.execute("SELECT beat_at FROM worker_heartbeat WHERE worker=%s", (WORKER,))
        row = k.fetchone(); c.close()
    except Exception:
        return False
    if not row:
        return False
    return (datetime.now(timezone.utc) - row[0]).total_seconds() < HEARTBEAT_STALE_S


def config() -> dict:
    c = _db(); k = c.cursor()
    k.execute("""SELECT image_workflow, image_model, image_licence, steps, batch_size
                   FROM local_engine_config WHERE id=1""")
    row = k.fetchone(); c.close()
    keys = ("workflow", "model", "licence", "steps", "batch_size")
    return dict(zip(keys, row)) if row else {}


def use_local(product_id: int | None = None) -> tuple[bool, str]:
    """(route locally?, why not). The reason is returned so the caller can record it."""
    stage = rollout()
    if stage == "off":
        return False, "LOCAL_ENGINE=off"
    if not worker_alive():
        return False, "Spark heartbeat bayat"
    if stage == "internal":
        return True, ""
    if stage == "default_on":
        return True, ""
    pct = int(stage.split(":")[1])
    # A stable hash, not a coin flip: a product that starts local stays local across retries instead
    # of ping-ponging between engines and producing two different designs for one row.
    return ((product_id or 0) * 2654435761) % 100 < pct, ""


# The producer prints ten inches at 300 PPI, so the artwork needs ~3000 px on its long side. ComfyUI
# draws at 1024 and the hosted engine was asked for "4k", which is why local output first came out at
# 3.2 inches with the pipeline correctly refusing it. Upscaling here rather than downstream keeps every
# gate reading the same shape of file whichever engine drew it.
PRINT_LONG_PX = 3200


def _upscale_for_print(src: Path, dst: Path) -> None:
    from PIL import Image                                          # noqa: PLC0415
    im = Image.open(src)
    if max(im.size) >= PRINT_LONG_PX:
        dst.write_bytes(src.read_bytes())
        return
    f = PRINT_LONG_PX / max(im.size)
    # LANCZOS, not a learned upscaler: this artwork is flat shapes with hard edges, and an ESRGAN
    # invents texture that the DTF flatness gate then has to reject.
    im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS).save(dst)


def comfy_reachable(timeout: float = 3.0) -> bool:
    """Is ComfyUI on this machine? That decides HOW the Spark draws, not whether it does.

    Running on the Spark, ComfyUI is a loopback call away and there is no reason to involve a queue.
    Running on Railway, the Spark is behind a home network with no inbound route, so the only way to
    reach it is the way the spec designed: leave a job and let it poll.
    """
    try:
        urllib.request.urlopen(f"{COMFY}/system_stats", timeout=timeout).read()
        return True
    except Exception:
        return False


QUEUE_TIMEOUT_S = 900


def generate_via_queue(prompt: str, out: Path, aspect: str, seed: int | None,
                       product_id: int | None) -> dict:
    """Leave a job for the Spark and wait for the drawn image to come back in the row.

    The result travels as BYTES in the job row, not as a path. A filename on a machine with no inbound
    route is useless to the caller, and that mistake would only show up in production.
    """
    import psycopg2
    w, h = _dims(aspect)
    payload = {"prompt": prompt, "aspect": aspect, "width": w, "height": h,
               "negative": NEGATIVE, "seed": seed}
    c = _db(); k = c.cursor()
    k.execute("""INSERT INTO generation_jobs (product_id, kind, payload, engine_pref)
                 VALUES (%s,'image',%s,'local') RETURNING id""",
              (product_id, json.dumps(payload)))
    jid = k.fetchone()[0]
    c.commit(); c.close()
    print(f"  is {jid} kuyruga birakildi, Spark bekleniyor")

    deadline = time.time() + QUEUE_TIMEOUT_S
    while time.time() < deadline:
        time.sleep(5)
        c = _db(); k = c.cursor()
        k.execute("""SELECT status, engine_image, model, model_licence, seed, steps,
                            last_error, result_image, result_meta
                       FROM generation_jobs WHERE id=%s""", (jid,))
        st, eng, model, lic, sd, steps, err, img, meta = k.fetchone()
        c.close()
        if st == "done" and img:
            out.write_bytes(bytes(img))
            meta = meta or {}
            return {"engine": eng or "local-comfyui", "model": model, "licence": lic,
                    "seed": sd, "steps": steps, "seconds": 0, "job": jid,
                    # Measured on the Spark, which is where the OCR lives; judged by the caller.
                    "text_found": meta.get("text_found"), "cutout": meta.get("cutout")}
        if st in ("failed", "cancelled"):
            raise RuntimeError(f"is {jid} {st}: {err}")
    raise TimeoutError(f"is {jid} {QUEUE_TIMEOUT_S}s icinde bitmedi")


# The negative prompt is where a recurring defect gets fixed, because it is the only place the model
# reliably listens. Everything here was added after seeing it in a finished product, not in advance.
#
# The BACKING PLATE is the newest and the most expensive. Asked for "a minimalist dragon with a castle
# in the background", Juggernaut drew the dragon on a solid dusty-pink disc — a shape nobody asked for,
# which prints as a sticker slapped on the shirt and reads as a mistake on every colourway but the one
# it was previewed against. It does this because "t-shirt graphic" pulls diffusion models toward badge
# and sticker compositions; nano_banana_pro was dropped for the same behaviour (a die-cut base plate
# over 53.8% of the opaque area, measured 2026-08-12) and Juggernaut does a milder version of it.
#
# Why here rather than a gate: I looked for one. Across 140 catalogue files the obvious metric —
# largest single-colour share of the opaque area — has a MEDIAN of 39.6%, while the offending dragon
# measured 35.2%. It cannot separate a plate from the shop's own flat-colour style, and the
# one-colour `vibe-*` designs sit at 100% while being exactly right. A threshold there would refuse
# good work and still pass this. The pale-plate gate in produce_product.py stays as the backstop for
# the cream-slab case it was calibrated for; this is the fix for the coloured one.
NEGATIVE = ("text, words, letters, typography, watermark, signature, gradient, photo, 3d render, "
            "drop shadow, "
            "sticker, die-cut sticker, badge, emblem, logo, circular background, solid circle behind "
            "subject, coloured disc, background shape, backing plate, filled panel, framed panel, "
            "border, frame, plaque, label shape, rounded rectangle background, banner")


def _dims(aspect: str) -> tuple[int, int]:
    return {"4:5": (896, 1152), "3:4": (896, 1216), "16:9": (1344, 768)}.get(aspect, (1024, 1024))


def generate_local(prompt: str, out: Path, aspect: str = "1:1", seed: int | None = None,
                   product_id: int | None = None) -> dict:
    """Draw on the Spark. Directly if this IS the Spark, through the queue if it is not."""
    if not comfy_reachable():
        return generate_via_queue(prompt, out, aspect, seed, product_id)
    cfg = config()
    wf = Path.home() / "ComfyUI" / "workflows" / cfg["workflow"]
    if not wf.exists():
        raise RuntimeError(f"workflow yok: {wf}")
    g = json.loads(wf.read_text())
    seed = seed if seed is not None else time.time_ns() % (2 ** 31)

    w, h = _dims(aspect)

    for node in g.values():
        ins = node.get("inputs", {})
        title = node.get("_meta", {}).get("title")
        if title == "POSITIVE" and "text" in ins:
            ins["text"] = prompt
        if title == "CHECKPOINT" and "ckpt_name" in ins:
            ins["ckpt_name"] = cfg["model"]
        if title == "SAMPLER":
            ins["seed"] = seed
            ins["steps"] = cfg["steps"]
        if title == "LATENT":
            ins["width"], ins["height"] = w, h

    req = urllib.request.Request(f"{COMFY}/prompt", data=json.dumps({"prompt": g}).encode(),
                                 headers={"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req, timeout=60).read())["prompt_id"]

    t0 = time.time()
    while time.time() - t0 < IMAGE_TIMEOUT_S:
        hist = json.loads(urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30).read())
        if pid in hist:
            imgs = [i for o in hist[pid].get("outputs", {}).values() for i in o.get("images", [])]
            if not imgs:
                raise RuntimeError("ComfyUI bitirdi ama gorsel dondurmedi")
            src = (Path.home() / "ComfyUI" / "output" / imgs[0].get("subfolder", "")
                   / imgs[0]["filename"])
            _upscale_for_print(src, out)
            return {"engine": "local-comfyui", "model": cfg["model"], "licence": cfg["licence"],
                    "seed": seed, "steps": cfg["steps"], "seconds": round(time.time() - t0, 1)}
        time.sleep(2)
    raise TimeoutError(f"ComfyUI {IMAGE_TIMEOUT_S}s icinde bitirmedi")
