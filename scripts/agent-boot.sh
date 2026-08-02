#!/bin/sh
# Railway `agent` service entrypoint (exec-form startCommand — no && chains).
set -e
echo "[agent-boot] starting personalizer worker"
exec node --experimental-strip-types scripts/personalizer.mts loop
