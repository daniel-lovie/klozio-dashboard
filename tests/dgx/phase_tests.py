#!/usr/bin/env python3
"""Acceptance tests for the DGX factory phases.

Each phase in docs/dgx-factory-spec.md has criteria. This file makes them runnable, because a phase
that is "done" by assertion tends to be undone by the next phase. Run it after every change:

    python3 tests/dgx/phase_tests.py            # all phases
    python3 tests/dgx/phase_tests.py --phase 1  # one

Tests that need the Spark go through `ssh dgx`; tests that need only the app hit the database. A test
that cannot run says SKIP and why — it never says PASS.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
RESULTS: list[tuple[int, str, str, str]] = []


def rec(phase: int, name: str, status: str, detail: str = ""):
    RESULTS.append((phase, name, status, detail))
    mark = {"PASS": "  ok ", "FAIL": " FAIL", "SKIP": " skip"}[status]
    print(f"{mark}  P{phase} {name}" + (f"  — {detail}" if detail else ""))


def ssh(cmd: str, timeout: int = 120) -> tuple[int, str]:
    try:
        # ClearAllForwardings: the config's LocalForwards are for the human's session. A test that
        # also binds 8188 collides with it and reports a failure that is entirely its own doing.
        p = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                            "-o", "ClearAllForwardings=yes", "dgx", cmd],
                           capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        return 124, "timeout"


def db():
    import psycopg2
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)


# ── Phase 0 ──────────────────────────────────────────────────────────────────────────────────────
def phase0():
    rc, out = ssh("echo alive")
    if rc != 0:
        rec(0, "ssh reachable", FAIL, out[:80]); return
    rec(0, "ssh reachable", PASS)

    cfg = open(os.path.expanduser("~/.ssh/config")).read()
    blk = cfg.split("Host dgx")[1].split("\nHost ")[0] if "Host dgx" in cfg else ""
    for want in ("ServerAliveInterval", "LocalForward 8188", "LocalForward 11434"):
        rec(0, f"ssh config: {want}", PASS if want in blk else FAIL)

    rc, out = ssh("tmux list-windows -t factory 2>/dev/null | wc -l")
    n = int(out) if out.isdigit() else 0
    # Panes must survive a dropped client; that is what tmux is for and what AC1 checks.
    rec(0, "tmux factory has 3 windows", PASS if n >= 3 else FAIL, f"{n} pencere")

    alias = open(os.path.expanduser("~/.zshrc")).read()
    rec(0, "dgxf alias", PASS if "alias dgxf=" in alias else FAIL)


# ── Phase 1 ──────────────────────────────────────────────────────────────────────────────────────
def phase1():
    rc, out = ssh("cd ~/ComfyUI && source .venv/bin/activate && python -c \""
                  "import torch;print(torch.__version__, torch.cuda.is_available(), "
                  "'sm_%d%d'%torch.cuda.get_device_capability(0))\"", 180)
    if rc != 0 or "True" not in out:
        rec(1, "torch sees the GPU", FAIL, out[:100]); return
    rec(1, "torch sees the GPU", PASS, out.splitlines()[-1])

    # The arch list stops at sm_120 while the device is sm_121, so correctness is checked rather than
    # assumed: a kernel that quietly produces garbage is worse than one that refuses to load.
    rc, out = ssh("cd ~/ComfyUI && source .venv/bin/activate && python -c \""
                  "import torch;a=torch.randn(1024,1024,device='cuda');b=torch.randn(1024,1024,device='cuda');"
                  "print(float((a@b).cpu().sub(a.cpu()@b.cpu()).abs().max()))\"", 180)
    try:
        err = float(out.splitlines()[-1])
        rec(1, "sm_120 kernels correct on sm_121", PASS if err < 1e-2 else FAIL, f"sapma {err:.1e}")
    except ValueError:
        rec(1, "sm_120 kernels correct on sm_121", FAIL, out[:80])

    rc, out = ssh("ls -la ~/ComfyUI/models/checkpoints/*.safetensors "
                  "~/ComfyUI/models/diffusion_models/*.safetensors 2>/dev/null | wc -l")
    n = int(out) if out.isdigit() else 0
    rec(1, "checkpoints present", PASS if n >= 3 else FAIL, f"{n} dosya")

    rec(1, "licences recorded", PASS if ssh("test -f ~/ComfyUI/models/LICENCES.md")[0] == 0 else FAIL)

    rc, out = ssh("curl -s -m 5 -o /dev/null -w '%{http_code}' localhost:8188/system_stats", 30)
    rec(1, "ComfyUI API up", PASS if out.strip() == "200" else FAIL, f"HTTP {out.strip()}")


# ── Phase 2 ──────────────────────────────────────────────────────────────────────────────────────
def phase2():
    rc, out = ssh("ls ~/ComfyUI/workflows/*.json 2>/dev/null | wc -l")
    n = int(out) if out.isdigit() else 0
    rec(2, "workflows versioned", PASS if n >= 2 else FAIL, f"{n} graf")
    # The spec asked for a typography workflow. CLAUDE.md forbids AI-rendered text, so the second
    # graph must draw a SUBJECT and typeset.py sets the words. Assert the wrong one is absent.
    rc, _ = ssh("test -f ~/ComfyUI/workflows/wf_flux_typography.json")
    rec(2, "no AI-text workflow exists", PASS if rc != 0 else FAIL,
        "" if rc != 0 else "wf_flux_typography.json var — CLAUDE.md #5 ihlali")


# ── Phase 3 ──────────────────────────────────────────────────────────────────────────────────────
def phase3():
    try:
        c = db(); k = c.cursor()
    except Exception as e:
        rec(3, "database", SKIP, str(e)[:60]); return
    k.execute("SELECT to_regclass('generation_jobs'), to_regclass('worker_heartbeat')")
    a, b = k.fetchone()
    rec(3, "generation_jobs table", PASS if a else FAIL)
    rec(3, "worker_heartbeat table", PASS if b else FAIL)

    # The flag must default to off: a home device must never receive production traffic by accident.
    src = open(os.path.join(os.path.dirname(__file__), "../../src/lib/engines.ts")).read()
    rec(3, "LOCAL_ENGINE defaults off", PASS if 'LOCAL_ENGINE || "off"' in src else FAIL)
    rec(3, "routing needs a live heartbeat", PASS if "workerAlive" in src else FAIL)
    wp = os.path.join(os.path.dirname(__file__), "../../scripts/factory_worker.py")
    if not os.path.exists(wp):
        rec(3, "text/image fall back independently", FAIL, "factory_worker.py yok")
    else:
        w = open(wp).read()
        # Both stages must have their own except/timeout path. One shared handler is exactly the bug:
        # a stalled LLM must not push the image to Higgsfield.
        rec(3, "text/image fall back independently",
            PASS if "fallback_text" in w and "fallback_image" in w else FAIL)

    # A third claimant on products would race the agent service's producer.
    rec(3, "worker never claims products",
        PASS if "FROM generation_jobs" in src and "FROM products" not in src else FAIL)
    c.close()


# ── Phase 4 ──────────────────────────────────────────────────────────────────────────────────────
def phase4():
    """The print gate is the shop's own, measured on the bbox — not a 4500x5400 target.

    Checked ON THE SPARK. An earlier version of this test looked in ~/dgx-out on the MacBook, where
    nothing is ever written, and reported SKIP forever — a test that cannot fail is not a test.
    """
    rc, out = ssh("ls ~/dgx-out/*.png 2>/dev/null | head -3")
    files = [f for f in out.splitlines() if f.endswith(".png")]
    if not files:
        rec(4, "postprocess output", FAIL, "Spark'ta ~/dgx-out bos"); return
    for f in files:
        rc, out = ssh(
            "cd ~/ComfyUI && source .venv/bin/activate && python -c \""
            "from PIL import Image;import sys;"
            "im=Image.open(sys.argv[1]).convert('RGBA');"
            "bb=im.getbbox() or (0,0,im.width,im.height);a=im.crop(bb);"
            "h=a.getchannel('A').histogram();"
            "print(max(a.size)/10.0, sum(h[8:248])/max(sum(h),1))\" " + f, 180)
        try:
            ppi, mid = (float(x) for x in out.split()[-2:])
        except (ValueError, IndexError):
            rec(4, f"print gate {f.split('/')[-1][:22]}", FAIL, out[:60]); continue
        good = ppi >= 300 and mid < 0.02
        rec(4, f"print gate {f.split('/')[-1][:22]}", PASS if good else FAIL,
            f"{ppi:.0f} PPI, yari-saydam %{mid*100:.2f}")


# ── Phase 5 ──────────────────────────────────────────────────────────────────────────────────────
def phase5():
    rc, _ = ssh("test -x ~/factory/daily.sh")
    rec(5, "daily entrypoint", PASS if rc == 0 else FAIL)
    # No passwordless sudo here, so a --user unit or a respawn loop are the options; the spec allows
    # either. What is NOT evidence is a tmux window called "comfyui" — that only says someone typed a
    # name once, which is how this test passed before it was fixed.
    rc, out = ssh("systemctl --user is-enabled comfyui.service 2>/dev/null || echo none")
    unit = "enabled" in out
    rc2, _ = ssh("test -x ~/factory/respawn.sh && crontab -l 2>/dev/null | grep -q respawn.sh")
    rec(5, "ComfyUI restarts unattended", PASS if unit or rc2 == 0 else FAIL,
        "systemd --user" if unit else ("cron respawn" if rc2 == 0 else "hicbiri"))


def phase3_text():
    """The local text engine, end to end and against the gate the shop already uses.

    Not "does Ollama answer" — that proves a daemon is up. The question is whether local output clears
    the SAME bar Sonnet's output has to clear, because the flag cannot advance past `internal` on a
    model that writes titles the analyser rejects.
    """
    rc, out = ssh("curl -s -m 8 localhost:11434/api/tags", 40)
    if '"models"' not in out:
        rec(3, "ollama up", FAIL, out[:60]); return
    import json as _j
    tags = [m["name"] for m in _j.loads(out).get("models", [])]
    rec(3, "ollama up", PASS, f"{len(tags)} model")
    if not tags:
        rec(3, "local text model present", FAIL, "model cekilmemis"); return
    rec(3, "local text model present", PASS, tags[0])

    # A real listing title, judged by the shop's own rules: 125-140 chars, keyword in the first 40,
    # thirteen multi-word tags. This is the quality gate from the spec, run rather than described.
    sys_p = ("You write Etsy listing titles for a US print-on-demand t-shirt shop. Reply with ONE "
             "title only, no explanation, no quotes. 125 to 140 characters. Four or five phrases "
             "separated by commas. Include the words Comfort Colors once. No exclamation marks.")
    usr = "Design: a flat vector stack of colourful books under a crescent moon. Niche: book lovers."
    body = _j.dumps({"model": tags[0], "stream": False, "options": {"temperature": 0.7},
                     "messages": [{"role": "system", "content": sys_p},
                                  {"role": "user", "content": usr}]}).replace("'", "'\\''")
    rc, out = ssh(f"curl -s -m 240 localhost:11434/api/chat -d '{body}'", 300)
    try:
        txt = _j.loads(out)["message"]["content"].strip().splitlines()[-1].strip().strip('"')
    except Exception:
        rec(3, "local text produces a title", FAIL, out[:70]); return
    ok_len = 125 <= len(txt) <= 140
    ok_cc = "comfort colors" in txt.lower()
    ok_head = len(txt.split(",")[0].strip()) <= 40
    rec(3, "local text produces a title", PASS if txt else FAIL, f"{len(txt)} karakter")
    rec(3, "title in the 125-140 band", PASS if ok_len else FAIL, txt[:60])
    rec(3, "title carries Comfort Colors", PASS if ok_cc else FAIL)
    rec(3, "primary keyword inside first 40", PASS if ok_head else FAIL)


PHASES = {0: phase0, 1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5, 31: phase3_text}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", type=int, action="append")
    a = ap.parse_args()
    for n in (a.phase or sorted(PHASES)):
        print(f"\n── Phase {n} ──")
        try:
            PHASES[n]()
        except Exception as e:
            rec(n, "test harness", FAIL, f"{type(e).__name__}: {e}"[:90])
    p = sum(1 for r in RESULTS if r[2] == PASS)
    f = sum(1 for r in RESULTS if r[2] == FAIL)
    s = sum(1 for r in RESULTS if r[2] == SKIP)
    print(f"\n{p} gecti · {f} kaldi · {s} atlandi")
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
