#!/usr/bin/env bash
# One command, one day of designs. Everything runs on the Spark; the MacBook is a viewer.
#
# Sequential on purpose. Diffusion and the LLM both want the whole GPU, and running them together on
# a single unified-memory device makes both slower and occasionally makes one of them fail — the spec
# calls this out and it is the one scheduling rule worth obeying.
set -uo pipefail
cd ~/ComfyUI && source .venv/bin/activate
LOG=~/factory/daily-$(date +%F).log
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date -Is) gunluk parti ==="

systemctl --user is-active --quiet comfyui.service || {
  echo "ComfyUI kapali, baslatiliyor"; systemctl --user start comfyui.service; sleep 30; }

COUNT="${1:-10}"
mkdir -p ~/dgx-out
FAILED=0
for i in $(seq 1 "$COUNT"); do
  echo "--- $i/$COUNT ---"
  # A failure retries once and then moves on. One bad prompt must not cost the whole overnight run.
  python ~/factory/run_one.py || python ~/factory/run_one.py || { echo "  atlandi"; FAILED=$((FAILED+1)); }
done
echo "=== $(date -Is) bitti · $FAILED atlandi ==="

# Generated frames pile up fast and this box has one job. Keep a fortnight.
find ~/ComfyUI/output -type f -mtime +14 -delete 2>/dev/null || true
find ~/dgx-out -type f -mtime +14 -delete 2>/dev/null || true
df -h / | tail -1
