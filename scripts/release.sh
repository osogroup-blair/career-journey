#!/usr/bin/env bash
# Local, explicit release checks and GitHub push. No workflows are installed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
tag=${1:?Usage: scripts/release.sh v1.2.3}
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || { echo 'Use a version tag such as v1.2.3' >&2; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit local changes before releasing.' >&2; exit 1; }
if git rev-parse --verify "refs/tags/$tag" >/dev/null 2>&1; then echo 'Tag already exists' >&2; exit 1; fi
branch=$(git symbolic-ref --quiet --short HEAD) || { echo 'Check out a named branch before releasing.' >&2; exit 1; }
git fetch --tags origin
if git rev-parse --verify "refs/tags/$tag" >/dev/null 2>&1; then echo 'Tag already exists on the remote' >&2; exit 1; fi
npm ci
npm test
npm run lint
npm run build
git push origin "HEAD:refs/heads/$branch"
git tag -a "$tag" -m "Career Journey $tag"
git push origin "refs/tags/$tag"
printf 'Release published. On the VM run: ./scripts/deploy.sh %s\n' "$tag"
