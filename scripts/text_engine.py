#!/usr/bin/env python3
"""Listing copy from the local model, by consensus rather than by first-that-passes.

Measured head to head on ten briefs with an identical retry budget: local Qwen clears the shop's
checks 6/10 on a single draw and 9/10 with one correction; Opus clears 10/10 first time. The gap is
real and small, and the local engine is free — so the way to close it is to spend the free thing.

Two INDEPENDENT draws, not one draw and a correction. Those are different tools:

  A CORRECTION inherits the first answer's framing. Told "that was 118 characters, make it 125-140",
  the model pads the title it already wrote. It fixes the count and keeps whatever else was weak.

  A SECOND DRAW is a different title. When both are valid there is a choice to make, and choosing is
  where the quality comes from — this is the same reason the design pipeline draws best-of-N instead
  of accepting the first artwork that passes its gates.

Only if BOTH draws fail does it fall back to the corrective retry, and only if that fails too does the
cloud engine get the job. Nothing here is a new rule: `check()` from write_listing_copy is the judge,
so local copy is held to exactly the bar the shop already publishes against.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from write_listing_copy import check                               # noqa: E402

OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
LOW, HIGH = 125, 140


def _config() -> dict:
    import psycopg2
    try:
        c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15)
        k = c.cursor()
        k.execute("SELECT text_engine, text_model, text_samples FROM local_engine_config WHERE id=1")
        row = k.fetchone(); c.close()
        return {"engine": row[0], "model": row[1], "samples": row[2]} if row else {}
    except Exception:
        return {}


def _ask_local(messages: list, system: str, model: str, temperature: float) -> str:
    body = json.dumps({"model": model, "stream": False, "keep_alive": "5m",
                       "options": {"temperature": temperature},
                       "messages": [{"role": "system", "content": system}] + messages}).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    # Ollama answers 500 while it loads weights. That is a cold start, not a bad request, and treating
    # it as failure hands the cloud a job that was about to succeed locally.
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


def _parse(raw: str) -> dict:
    """Local models narrate before answering. The JSON object is the answer."""
    if "{" in raw and "}" in raw:
        raw = raw[raw.index("{"):raw.rindex("}") + 1]
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    d = json.loads(raw)
    d["_has_text"] = True
    return d


def _quality(d: dict) -> tuple:
    """Rank two valid candidates. Every term is a rule the shop already states, scored rather than
    merely passed — a title at 126 characters and one at 138 both pass, and one of them is using the
    space Etsy gives it."""
    title = d.get("title", "")
    tags = d.get("tags", [])
    return (
        len(title),                                   # more of the 140 characters used
        len({t.strip().lower() for t in tags}),       # distinct tags, not near-duplicates
        -len(d.get("title", "").split(",")[0]),       # primary keyword nearer the front
        sum(len(t) for t in tags) / max(len(tags), 1),
    )


def write_copy(prompt: str, system: str, samples: int | None = None) -> dict:
    """Return validated listing copy, or raise so the caller can fall back to the cloud engine."""
    cfg = _config()
    model = cfg.get("model", "qwen3:30b-a3b")
    n = samples if samples is not None else cfg.get("samples", 2)
    msgs = [{"role": "user", "content": prompt}]

    valid, seen = [], []
    for i in range(max(1, n)):
        # Different temperatures, so the second draw is a genuinely different title rather than the
        # first one again. Two identical samples are one sample.
        raw = _ask_local(msgs, system, model, 0.6 + 0.25 * i)
        try:
            d = _parse(raw)
        except (ValueError, KeyError):
            seen.append("JSON ayristirilamadi")
            continue
        why = check(d)
        seen.append(why or "gecti")
        if not why:
            valid.append(d)

    if valid:
        best = max(valid, key=_quality)
        best["_engine"] = "local-qwen"
        best["_samples"] = n
        best["_valid"] = len(valid)
        return best

    # Both draws failed. Now the correction is the right tool: there is a specific reason to give.
    msgs += [{"role": "assistant", "content": json.dumps({"note": "previous attempt"})},
             {"role": "user", "content": f"Rejected: {seen[-1]}. Fix exactly that and return the JSON, "
                                         f"nothing else."}]
    raw = _ask_local(msgs, system, model, 0.4)
    d = _parse(raw)
    why = check(d)
    if why:
        raise RuntimeError(f"yerel metin {n} ornek + duzeltme sonrasi gecemedi: {why}")
    d["_engine"] = "local-qwen"
    d["_samples"] = n + 1
    d["_valid"] = 1
    return d
