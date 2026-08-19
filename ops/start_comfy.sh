#!/usr/bin/env bash
# ComfyUI, bound to loopback only. It is reached through the SSH tunnel and must never be listening
# on the LAN, let alone the internet: it executes arbitrary graphs and has no authentication.
set -euo pipefail
cd ~/ComfyUI && source .venv/bin/activate
exec python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
