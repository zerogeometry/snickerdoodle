#!/usr/bin/env bash
# Linux / macOS / WSL twin of build-push.ps1: build the image for linux/amd64 and push it to ECR.
#   infra/aws-london/bin/build-push.sh <repo> [user@box]
#   e.g. infra/aws-london/bin/build-push.sh 123456789012.dkr.ecr.eu-west-2.amazonaws.com/snickerdoodle ubuntu@1.2.3.4
# Extra docker build flags can go in BUILD_FLAGS (e.g. a mirror: --build-arg NODE_IMAGE=…).
set -euo pipefail
repo="${1:?usage: build-push.sh <ecr repo> [user@box]}"
box="${2:-}"
profile="${AWS_PROFILE:-snickerdoodle-builder}"
cd "$(dirname "$0")/../../.."

[[ "$repo" =~ ^[0-9]{12}\.dkr\.ecr\.eu-west-2\.amazonaws\.com/[a-z0-9._/-]+$ ]] || { echo "repo should look like 123456789012.dkr.ecr.eu-west-2.amazonaws.com/snickerdoodle" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || echo "note: you have uncommitted changes — they WILL be in this image"
tag="$(date -u +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"

aws ecr get-login-password --region eu-west-2 --profile "$profile" | docker login --username AWS --password-stdin "${repo%%/*}"
# shellcheck disable=SC2086
docker buildx build --platform linux/amd64 -f infra/aws-london/Dockerfile \
  --build-arg "APP_BUILD=$tag" ${BUILD_FLAGS:-} -t "$repo:$tag" --push .
echo "pushed $repo:$tag"

if [ -n "$box" ]; then
  ssh "$box" "sudo /opt/snickerdoodle/kit/bin/deploy.sh $tag"
else
  echo "deploy it with:  ssh ubuntu@<box> sudo /opt/snickerdoodle/kit/bin/deploy.sh $tag"
fi
