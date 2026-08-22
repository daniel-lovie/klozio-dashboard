#!/usr/bin/env python3
"""Ask a vision model whether the artwork has a backing plate.

The defect: a solid shape drawn BEHIND the subject — a coloured disc, a square panel, an ornamental
frame — which prints as a sticker slapped on the shirt and reads wrong on every colourway but the one
it was previewed against. It is the most persistent failure this pipeline has.

Why a model and not a measurement. Three statistical attempts failed, each recorded in
docs/dgx-backlog.md: dominant-colour share (catalogue median 39.6%, the offending design 35.2% — below
the median), largest uniform connected block as a gate (p95 sits on legitimate one-colour work), and
the same block as a score penalty (the watercolour-textured panel measures 25.5%, under the median
again). The reason they fail is the same each time: the shop's own style IS large flat colour, so no
colour statistic can separate a plate from a design. Judging it needs to look at what is FIGURE and
what is GROUND, which is a semantic question.

Measured against six real designs, the model answered all six correctly — including a cream disc with
a gold ring behind a dog that every statistic had scored as clean, and which was about to ship.

It runs on the app side over the tunnel, not on the Spark, because that is where the candidate file
already is and it needs no deployment to the other machine.

A failure to reach the model returns None. Absence of a judgement is not a verdict: this is a
preference between candidates, and an unreachable model must not turn every design into a reject.
"""
from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
TOKEN = (os.environ.get("OLLAMA_TOKEN") or "").strip()
MODEL = os.environ.get("LOCAL_VISION_MODEL", "qwen2.5vl:7b")
TIMEOUT_S = 120

# One question, one word. A longer prompt invites the model to describe the picture instead of judging
# it, and the answer then has to be parsed out of prose.
QUESTION = (
    "Look at this t-shirt print artwork. Is there a solid filled shape behind the main subject - a "
    "coloured disc, square, panel, banner or decorative frame that acts as a background plate? "
    "Answer with exactly one word: YES or NO."
)


def has_plate(png: Path | bytes) -> bool | None:
    """True if the artwork carries a backing plate, False if not, None if it could not be judged."""
    try:
        from PIL import Image                                      # noqa: PLC0415

        raw = png if isinstance(png, bytes) else Path(png).read_bytes()
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        # Composited onto white and shrunk: the model needs to see figure against ground, and a
        # transparent PNG at 3000px is both ambiguous and slow.
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, mask=im.split()[3])
        flat.thumbnail((768, 768), Image.LANCZOS)
        buf = io.BytesIO()
        flat.save(buf, "JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()

        body = json.dumps({
            "model": MODEL, "stream": False, "keep_alive": "120s",
            # Deterministic: the same candidate must not be judged differently on a retry.
            "options": {"temperature": 0},
            "messages": [{"role": "user", "content": QUESTION, "images": [b64]}],
        }).encode()
        # A User-Agent, because Cloudflare sits in front of the tunnel and answers 403 to the default
        # "Python-urllib/3.x" while letting curl and fetch through. The failure looked exactly like an
        # unjudgeable image, which is the least informative thing it could have looked like.
        headers = {"content-type": "application/json", "user-agent": "klozio-pipeline/1.0"}
        if TOKEN:
            headers["Authorization"] = f"Bearer {TOKEN}"
        req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body, headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            answer = json.loads(r.read())["message"]["content"].strip().upper()
        if answer.startswith("YES"):
            return True
        if answer.startswith("NO"):
            return False
        return None                       # neither word: no judgement rather than a guessed one
    except Exception:
        return None


if __name__ == "__main__":
    import sys
    for f in sys.argv[1:]:
        v = has_plate(Path(f))
        print(f"{f}: {'PLAKA VAR' if v else ('temiz' if v is False else 'yargilanamadi')}")
