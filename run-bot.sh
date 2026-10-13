#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "                    STARTING RPA BOT                                  "
echo "======================================================================"

# AdsPower's browser launch mode is controlled by HEADLESS in .env or the shell.
# Profile configuration is an explicit setup step, not part of each outreach run.
npm start
