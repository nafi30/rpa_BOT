#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected one 40-character commit SHA" >&2
  exit 2
fi

sha="$1"
release="/home/rpa-deploy/releases/$sha"
current="/root/rpa-bot-current"

if [[ -L "$release" || ! -f "$release/index.js" || ! -d "$release/node_modules" ]]; then
  echo "Release is missing or incomplete: $release" >&2
  exit 1
fi
if [[ "$(stat -c %U "$release")" != "rpa-deploy" ]]; then
  echo "Release owner is unexpected" >&2
  exit 1
fi
if [[ -e "$current" && ! -L "$current" ]]; then
  echo "Current release path is not a symlink; refusing to replace it" >&2
  exit 1
fi

node --check "$release/index.js"
node --check "$release/scripts/diagnoseVps.js"

previous="$(readlink "$current" || true)"
temporary="/root/.rpa-bot-current.$$"
if [[ -e "$temporary" || -L "$temporary" ]]; then
  echo "Temporary link already exists" >&2
  exit 1
fi
ln -s "$release" "$temporary"
mv -Tf "$temporary" "$current"
printf 'Activated %s (previous: %s)\n' "$sha" "${previous:-none}"