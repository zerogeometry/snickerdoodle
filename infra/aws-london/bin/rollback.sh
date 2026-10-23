#!/usr/bin/env bash
# Roll back to the previous image (runbook §5.3). Deploy keeps the previous image on the box, so
# this needs no download and takes seconds.
#
#   sudo /opt/snickerdoodle/kit/bin/rollback.sh            # to the previous image
#   sudo /opt/snickerdoodle/kit/bin/rollback.sh <tag>      # to a specific earlier tag (pulled if needed)
#
# It does NOT undo database migrations. Migrations are written to be additive (new tables/columns,
# never a drop in the same release), so the previous image runs fine on the newer database.
source "$(dirname "$0")/lib.sh"
need_root
load_box_env

exec 9>"$STATE_DIR/.deploy.lock"
flock -n 9 || { echo "another deploy or rollback is running" >&2; exit 1; }

live="$(current_image)"
if [ -n "${1:-}" ]; then
  case "$1" in *[!A-Za-z0-9._-]*) die "bad tag '$1'" ;; esac
  target="$IMAGE_REPO:$1"
else
  target="$(previous_image)"
fi
[ -n "$target" ] || die "no previous image recorded — nothing to roll back to"
[ "$target" != "$live" ] || die "$target is already live"

if ! docker image inspect "$target" >/dev/null 2>&1; then
  log "pulling $target"
  ecr_login
  docker pull -q "$target" >/dev/null || die "could not pull $target"
fi

"$KIT_DIR/bin/fetch-env.sh"
log "rolling back: $live → $target"
set_release "$target"
dc up -d --remove-orphans
wait_healthy 90 || die "rolled back to $target but it is not healthy — check: sudo $KIT_DIR/bin/logs.sh app"

printf '%s\n' "$target" > "$STATE_DIR/current"
[ -n "$live" ] && printf '%s\n' "$live" > "$STATE_DIR/previous"
printf '%s rollback %s (was %s)\n' "$(date -u +%FT%TZ)" "$target" "${live:-none}" >> "$STATE_DIR/history.log"
"$KIT_DIR/bin/smoke.sh" || log "smoke test failed after rollback — look at: sudo $KIT_DIR/bin/logs.sh app"
alert "rolled back to $target (was ${live:-none})"
log "live: $target   (run rollback.sh again to go back to ${live:-none})"
