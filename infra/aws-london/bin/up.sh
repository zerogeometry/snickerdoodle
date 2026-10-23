#!/usr/bin/env bash
# Start (or re-start) everything with the live release — run at boot by snickerdoodle.service.
# Settings are fetched fresh from SSM first, because /run is memory and empty after a reboot.
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
[ -r "$RELEASE_ENV" ] || { log "nothing deployed yet — run deploy.sh <tag>"; exit 0; }
"$KIT_DIR/bin/fetch-env.sh"
dc up -d --remove-orphans
wait_healthy 120 || die "after boot the app is not healthy — check: sudo $KIT_DIR/bin/logs.sh app"
log "up: $(current_image)"
