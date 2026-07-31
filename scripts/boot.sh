#!/bin/sh
# Single boot path for Railway. startCommand runs WITHOUT a shell (exec-form) on
# Dockerfile deploys, so `a && b` chains silently degrade into argv junk — every
# boot step lives here instead.
set -e
node --experimental-strip-types scripts/migrate.mts
echo "[boot] migrate done, starting next on port ${PORT:-3000}"
exec ./node_modules/.bin/next start -p "${PORT:-3000}"
