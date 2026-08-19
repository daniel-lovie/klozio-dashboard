#!/usr/bin/env bash
# Push the repo's scripts to the Spark. The Spark runs code from the repo rather than its own copy:
# two implementations of the producer is the defect this codebase has already paid for once.
set -euo pipefail
rsync -az --delete \
  --include='scripts/***' --include='assets/***' --include='db/***' \
  --exclude='*' \
  -e 'ssh -o ClearAllForwardings=yes' \
  /Users/omer/Documents/code/etsy/dashboard/ dgx:~/klozio/
echo "senkron: $(ssh -o ClearAllForwardings=yes dgx 'ls ~/klozio/scripts | wc -l') script"
