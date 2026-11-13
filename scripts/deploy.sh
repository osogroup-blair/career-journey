#!/usr/bin/env bash
# Run on the VM, from a trusted clone. No GitHub Actions or remote build service.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ref=${1:-main}
if [[ ! "$ref" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ || "$ref" == *..* ]]; then
  echo 'Invalid release ref' >&2; exit 2
fi
command -v docker >/dev/null
command -v flock >/dev/null
docker compose version >/dev/null
[[ -f .env ]] || { echo 'Copy .env.example to .env and configure APP_URL and the initial admin credentials first.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit or stash local changes before deploying.' >&2; exit 1; }
mkdir -p .deploy backups
exec 9>.deploy/lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
chmod 600 .env
git fetch --prune --tags origin
if git show-ref --verify --quiet "refs/tags/$ref"; then
  target=$(git rev-parse --verify "refs/tags/$ref^{commit}")
elif git show-ref --verify --quiet "refs/remotes/origin/$ref"; then
  target=$(git rev-parse --verify "refs/remotes/origin/$ref^{commit}")
else
  target=$(git rev-parse --verify "$ref^{commit}")
fi
previous=$(cat .deploy/current 2>/dev/null || true)
previous_checkout=$(git rev-parse HEAD)
new_version=${target:0:12}
stopped=false
rollback() {
  result=$?
  trap - ERR
  echo 'Deployment failed; restoring the previous application image.' >&2
  git checkout --detach "$previous_checkout" >/dev/null
  if [[ -n "$previous" && "$stopped" == true ]]; then
    APP_VERSION="${previous:0:12}" docker compose up -d --no-build --wait --wait-timeout 120 || true
  fi
  echo 'Data backups were preserved. Database restoration is intentionally manual.' >&2
  exit "$result"
}
trap rollback ERR
git checkout --detach "$target"
export APP_VERSION=$new_version
docker compose build --pull app
# Stop writers before the full data/attachment/prompt archive. First deployment has no container/data yet.
if [[ -n "$(docker compose ps -aq app)" ]]; then
  docker compose stop app
  stopped=true
  backup_path="backups/$(date -u +%Y%m%dT%H%M%SZ)-before-${new_version}.tgz"
  docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /app data server/promptConfig server/knowledgeConfig > "$backup_path"
  tar -tzf "$backup_path" >/dev/null
  echo "Backup: $backup_path"
fi
docker compose up -d --no-build --wait --wait-timeout 120
printf '%s\n' "$target" > .deploy/current
if [[ -n "$previous" ]]; then printf '%s\n' "$previous" > .deploy/previous; fi
trap - ERR
echo "Deployed $target. Data stays on persistent Docker volumes."
