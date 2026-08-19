#!/usr/bin/env python3
"""The DGX Spark worker: claims generation jobs, runs them locally, falls back to cloud per stage.

Runs in tmux on the Spark. It polls OUTBOUND — the home network has no inbound port, and it is going
to stay that way. The only thing the cloud app knows about this machine is a heartbeat row.

Design rules, each of them load-bearing:

  IT CLAIMS FROM generation_jobs AND NOTHING ELSE. `products` already has an owner in the agent
  service's producer. A second claimant there means two workers racing and paying twice for one
  product, which this codebase has already done once.

  TEXT AND IMAGE FALL BACK INDEPENDENTLY. `fallback_text` and `fallback_image` are separate functions
  with separate triggers on purpose. A stalled LLM must not push the image to Higgsfield: they are
  different services, different failure modes, and different money.

  IT RECORDS WHAT RAN, NOT WHAT WAS ASKED FOR. engine_pref is the request; engine_text/engine_image
  are what actually did the work. Without both, nobody can say how much load local is really carrying.

  PROVENANCE IS A COLUMN. Checkpoint, licence, seed and steps are written with the result. A design
  cannot be published here without them, and a local model is the first setup able to state them
  exactly rather than approximately.

    python3 scripts/factory_worker.py --once      # claim one job, run it, exit
    python3 scripts/factory_worker.py             # loop
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import psycopg2

WORKER = os.environ.get("FACTORY_WORKER", "dgx-spark")
COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
LOCAL_TEXT_MODEL = os.environ.get("LOCAL_TEXT_MODEL", "qwen3:32b")

TEXT_TIMEOUT_S = 90
IMAGE_TIMEOUT_S = 600
POLL_S = 10
LOG = Path(os.environ.get("FACTORY_LOG", str(Path.home() / "factory-jobs.jsonl")))


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def jlog(**kw):
    kw["ts"] = datetime.now(timezone.utc).isoformat()
    kw.setdefault("worker", WORKER)
    with LOG.open("a") as f:
        f.write(json.dumps(kw, ensure_ascii=False) + "\n")
    print(f"[{kw['ts'][11:19]}] " + " ".join(f"{k}={v}" for k, v in kw.items()
                                             if k not in ("ts", "worker")), flush=True)


def beat(detail: dict):
    """The only signal the cloud has that this machine is alive.

    Written before and after every job, and on every idle poll: routing to the Spark because nothing
    has failed yet is how a job sits queued until someone notices in the morning.
    """
    try:
        c = conn(); k = c.cursor()
        k.execute("""INSERT INTO worker_heartbeat (worker, beat_at, detail) VALUES (%s, now(), %s)
                     ON CONFLICT (worker) DO UPDATE SET beat_at = now(), detail = EXCLUDED.detail""",
                  (WORKER, json.dumps(detail)))
        c.commit(); c.close()
    except Exception as e:
        print(f"heartbeat yazilamadi: {e}", file=sys.stderr)


def claim():
    c = conn(); k = c.cursor()
    # Same shape as claimDue() in publish.ts, including the stale-lock release: a worker that dies
    # holding a claim must not park a job forever.
    k.execute("""
        UPDATE generation_jobs j
           SET status='running', claimed_at=now(), worker=%s, attempts=j.attempts+1, updated_at=now()
         WHERE j.id IN (
           SELECT id FROM generation_jobs
            WHERE (status='queued' AND run_at <= now())
               OR (status IN ('claimed','running') AND claimed_at < now() - INTERVAL '20 minutes')
            ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, product_id, kind, payload, engine_pref, attempts""", (WORKER,))
    row = k.fetchone()
    c.commit(); c.close()
    if not row:
        return None
    keys = ("id", "product_id", "kind", "payload", "engine_pref", "attempts")
    job = dict(zip(keys, row))
    if isinstance(job["payload"], str):
        job["payload"] = json.loads(job["payload"])
    return job


def finish(job_id: int, **cols):
    sets = ", ".join(f"{k}=%s" for k in cols)
    c = conn(); k = c.cursor()
    k.execute(f"UPDATE generation_jobs SET {sets}, updated_at=now() WHERE id=%s",
              (*cols.values(), job_id))
    c.commit(); c.close()


# ── text stage ───────────────────────────────────────────────────────────────────────────────────
def text_local(prompt: str, system: str) -> str:
    import urllib.request
    body = json.dumps({"model": LOCAL_TEXT_MODEL, "stream": False,
                       "messages": [{"role": "system", "content": system},
                                    {"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TEXT_TIMEOUT_S) as r:
        return json.loads(r.read())["message"]["content"]


def text_cloud(prompt: str, system: str) -> str:
    """The permanent safety net. Never deleted, never bypassed — it is also the kill switch target."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from seed_minimal_batch import call
    return call([{"role": "user", "content": prompt}], system)


def fallback_text(prompt: str, system: str, want_local: bool) -> tuple[str, str, str | None]:
    """Returns (text, engine_used, fallback_reason). Retries local once, then goes to Sonnet."""
    if want_local:
        for attempt in (1, 2):
            try:
                return text_local(prompt, system), "local-qwen", None
            except Exception as e:
                reason = f"{type(e).__name__}: {e}"[:200]
                if attempt == 2:
                    jlog(stage="text", event="fallback", reason=reason)
                    return text_cloud(prompt, system), "sonnet", reason
                time.sleep(2)
    return text_cloud(prompt, system), "sonnet", None


# ── image stage ──────────────────────────────────────────────────────────────────────────────────
def image_local(payload: dict) -> dict:
    """Submit a versioned API-format graph to ComfyUI and wait for the result.

    The graph is a file in workflows/, not a literal in this module: the spec asks for workflows as
    code so a change is a diff rather than someone's browser session.
    """
    import urllib.request
    wf_name = payload.get("workflow", "wf_graphic.json")
    wf_path = Path.home() / "ComfyUI" / "workflows" / wf_name
    graph = json.loads(wf_path.read_text())
    sha = __import__("hashlib").sha256(wf_path.read_bytes()).hexdigest()[:12]

    seed = int(payload.get("seed") or time.time_ns() % (2**31))
    steps = int(payload.get("steps", 28))
    for node in graph.values():
        ins = node.get("inputs", {})
        if "seed" in ins:
            ins["seed"] = seed
        if "noise_seed" in ins:
            ins["noise_seed"] = seed
        if "steps" in ins:
            ins["steps"] = steps
        if node.get("_meta", {}).get("title") == "POSITIVE" and "text" in ins:
            ins["text"] = payload["prompt"]
        if node.get("_meta", {}).get("title") == "NEGATIVE" and "text" in ins:
            ins["text"] = payload.get("negative", "")

    req = urllib.request.Request(f"{COMFY}/prompt",
                                 data=json.dumps({"prompt": graph}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        pid = json.loads(r.read())["prompt_id"]

    deadline = time.time() + IMAGE_TIMEOUT_S
    while time.time() < deadline:
        with urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read())
        if pid in hist:
            outs = hist[pid].get("outputs", {})
            imgs = [i for o in outs.values() for i in o.get("images", [])]
            if not imgs:
                raise RuntimeError("ComfyUI bitirdi ama gorsel dondurmedi")
            return {"images": imgs, "seed": seed, "steps": steps, "workflow_sha": sha,
                    "model": payload.get("model", wf_name), "licence": payload.get("licence")}
        time.sleep(3)
    raise TimeoutError(f"ComfyUI {IMAGE_TIMEOUT_S}s icinde bitirmedi")


def image_cloud(payload: dict) -> dict:
    raise NotImplementedError(
        "Higgsfield yolu scripts/batch_runner.py icinde yasiyor ve MCP oturumu gerektirir; "
        "bulut gorsel fallback'i app tarafindan surulur, worker'dan degil")


def fallback_image(payload: dict, want_local: bool) -> tuple[dict, str, str | None]:
    if want_local:
        try:
            return image_local(payload), "local-comfyui", None
        except Exception as e:
            reason = f"{type(e).__name__}: {e}"[:200]
            jlog(stage="image", event="fallback", reason=reason)
            # The worker cannot reach Higgsfield's MCP session. It marks the job so the app requeues
            # it on the cloud engine — a fallback that silently does nothing is worse than none.
            raise RuntimeError(f"CLOUD_REQUEUE:{reason}")
    raise RuntimeError("CLOUD_REQUEUE:local istenmedi")


# ── job ──────────────────────────────────────────────────────────────────────────────────────────
def run_job(job: dict) -> None:
    jid = job["id"]
    p = job["payload"]
    want_local = (job.get("engine_pref") or "local") .startswith("local")
    t0 = time.time()
    timings, cols = {}, {}
    jlog(job=jid, event="start", kind=job["kind"], pref=job.get("engine_pref"))

    try:
        if job["kind"] in ("text", "both"):
            ts = time.time()
            txt, eng, reason = fallback_text(p.get("prompt", ""), p.get("system", ""), want_local)
            timings["text_s"] = round(time.time() - ts, 1)
            cols.update(engine_text=eng)
            if reason:
                cols["fallback_reason"] = f"text: {reason}"
            p["text_result"] = txt

        if job["kind"] in ("image", "both"):
            ts = time.time()
            out, eng, reason = fallback_image(p, want_local)
            timings["image_s"] = round(time.time() - ts, 1)
            cols.update(engine_image=eng, seed=out["seed"], steps=out["steps"],
                        workflow_sha=out["workflow_sha"], model=out["model"],
                        model_licence=out.get("licence"))
            p["images"] = out["images"]

        timings["total_s"] = round(time.time() - t0, 1)
        finish(jid, status="done", timings=json.dumps(timings),
               result_url=json.dumps(p.get("images", [])), **cols)
        jlog(job=jid, event="done", **timings, **{k: v for k, v in cols.items() if k.startswith("engine")})

    except Exception as e:
        msg = str(e)
        requeue = msg.startswith("CLOUD_REQUEUE:")
        finish(jid, status="queued" if requeue else "failed",
               last_error=msg[:1900],
               engine_pref="cloud" if requeue else job.get("engine_pref"),
               fallback_reason=msg[:400] if requeue else None,
               timings=json.dumps(timings), **{k: v for k, v in cols.items() if k.startswith("engine")})
        jlog(job=jid, event="requeue_cloud" if requeue else "failed", error=msg[:160])
        if not requeue:
            traceback.print_exc()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    jlog(event="worker_up", host=socket.gethostname(), comfy=COMFY, model=LOCAL_TEXT_MODEL)
    while True:
        beat({"state": "polling"})
        job = claim()
        if job:
            beat({"state": "running", "job": job["id"]})
            run_job(job)
            beat({"state": "idle", "last_job": job["id"]})
        elif a.once:
            jlog(event="no_jobs")
        if a.once:
            return 0
        if not job:
            time.sleep(POLL_S)


if __name__ == "__main__":
    sys.exit(main())
