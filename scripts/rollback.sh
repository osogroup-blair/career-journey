#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f .deploy/previous ]] || { echo 'No previous deployment recorded' >&2; exit 1; }
exec 9>.deploy/lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
previous=$(cat .deploy/previous)
[[ "$previous" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid previous revision' >&2; exit 1; }
current=$(cat .deploy/current)
git checkout --detach "$previous"
APP_VERSION="${previous:0:12}" docker compose up -d --no-build --wait --wait-timeout 120
printf '%s\n' "$previous" > .deploy/current
printf '%s\n' "$current" > .deploy/previous
echo 'Previous application image restored. Data was not reverted.'
