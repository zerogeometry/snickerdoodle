#!/usr/bin/env bash
# Shared helpers for the box scripts (sourced, not run). Everything here is plain bash + the AWS
# CLI + docker; nothing is installed beyond what bin/bootstrap-box.sh sets up.
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOX_ENV=/etc/snickerdoodle/box.env
STATE_DIR=/opt/snickerdoodle/state
RUN_DIR=/run/snickerdoodle
RELEASE_ENV="$STATE_DIR/release.env"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; alert "$*"; exit 1; }

need_root() { [ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }; }

load_box_env() {
  [ -r "$BOX_ENV" ] || { echo "missing $BOX_ENV — see infra/aws-london/env/box.env.example" >&2; exit 1; }
  set -a
  # shellcheck disable=SC1090
  . "$BOX_ENV"
  set +a
  : "${AWS_REGION:?AWS_REGION missing in $BOX_ENV}"
  export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
  mkdir -p "$STATE_DIR"
}

# Email the founder through SNS when ALERT_TOPIC_ARN is set; always logged. Never put personal
# data in a message.
alert() {
  local msg
  msg="snickerdoodle $(hostname): $*"
  if [ -n "${ALERT_TOPIC_ARN:-}" ]; then
    aws sns publish --topic-arn "$ALERT_TOPIC_ARN" --subject "snickerdoodle box alert" --message "$msg" >/dev/null 2>&1 \
      || log "(could not send the alert email)"
  fi
}

# The compose command, with the box's settings and the live release.
dc() {
  local files=(--env-file "$BOX_ENV")
  [ -r "$RELEASE_ENV" ] && files+=(--env-file "$RELEASE_ENV")
  docker compose -p snickerdoodle -f "$KIT_DIR/docker-compose.yml" "${files[@]}" "$@"
}

current_image()  { [ -r "$STATE_DIR/current" ] && cat "$STATE_DIR/current" || true; }
previous_image() { [ -r "$STATE_DIR/previous" ] && cat "$STATE_DIR/previous" || true; }

set_release() { # <image> — make <image> the one compose runs
  printf 'APP_IMAGE=%s\n' "$1" > "$RELEASE_ENV.tmp" && mv "$RELEASE_ENV.tmp" "$RELEASE_ENV"
}

ecr_login() {
  local registry="${IMAGE_REPO%%/*}"
  aws ecr get-login-password | docker login --username AWS --password-stdin "$registry" >/dev/null
}

# Wait until the app answers /api/health with ok:true on the loopback port.
wait_healthy() { # [seconds]
  local deadline=$(( $(date +%s) + ${1:-90} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 2
  done
  return 1
}

# A setting from the app's env file, without printing it.
app_setting() { sed -n "s/^$1=//p" "$RUN_DIR/app.env" | head -n1; }
