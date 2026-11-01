#!/usr/bin/env bash
set -euo pipefail

release="$(readlink -f /root/rpa-bot-current)"
if [[ "$release" != /home/rpa-deploy/releases/* || ! -f "$release/index.js" ]]; then
  echo "No validated current release is configured" >&2
  exit 1
fi

cd "$release"
exec env \
  HEADLESS=true \
  INPUT_LEADS_FILE=/root/rpa-bot/leads.csv \
  OUTPUT_RESULTS_FILE=/root/rpa-bot/results.csv \
  SCREENSHOTS_DIR=/root/rpa-bot/screenshots \
  node --env-file=/root/rpa-bot/.env "$release/index.js"