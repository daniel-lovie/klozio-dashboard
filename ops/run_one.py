#!/usr/bin/env python3
"""Claim and run exactly one job. Separate from daily.sh so a retry is a real process boundary."""
import pathlib
import subprocess
import sys

w = pathlib.Path.home() / "klozio" / "scripts" / "factory_worker.py"
if not w.exists():
    print(f"worker yok: {w} — repo Spark'a senkronlanmali", file=sys.stderr)
    sys.exit(2)
sys.exit(subprocess.call([sys.executable, str(w), "--once"]))
