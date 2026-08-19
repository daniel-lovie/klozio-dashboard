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


def generate_local(prompt: str, out: Path, aspect: str = "1:1", seed: int | None = None) -> dict:
    """Draw on the Spark through ComfyUI. Raises on any failure so the caller can fall back."""
    cfg = config()
    wf = Path.home() / "ComfyUI" / "workflows" / cfg["workflow"]
    if not wf.exists():
        raise RuntimeError(f"workflow yok: {wf}")
    g = json.loads(wf.read_text())
    seed = seed if seed is not None else time.time_ns() % (2 ** 31)

    w, h = (1024, 1024)
    if aspect == "4:5":
        w, h = 896, 1152
    elif aspect == "3:4":
        w, h = 896, 1216
    elif aspect == "16:9":
        w, h = 1344, 768

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
            out.write_bytes(src.read_bytes())
            return {"engine": "local-comfyui", "model": cfg["model"], "licence": cfg["licence"],
                    "seed": seed, "steps": cfg["steps"], "seconds": round(time.time() - t0, 1)}
        time.sleep(2)
    raise TimeoutError(f"ComfyUI {IMAGE_TIMEOUT_S}s icinde bitirmedi")
