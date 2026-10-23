#!/usr/bin/env bash
# Deploy a new image to the box — the ROUTINE DEPLOY (runbook §5).
#
#   sudo /opt/snickerdoodle/kit/bin/deploy.sh <tag>          # e.g. 20261023-0915-ab12cd3
#   sudo /opt/snickerdoodle/kit/bin/deploy.sh --restart      # same image, fresh settings from SSM
#   options: --no-seed  skip the catalogue refresh
#
# What it does, in order — and it stops at the first problem, leaving the live site untouched:
#   1. reads the settings from SSM (fetch-env.sh)
#   2. pulls the image from ECR
#   3. applies database migrations with the NEW image (they are additive, so the live app keeps
#      working against the new tables)
#   4. starts the new image ON THE SIDE (not serving anyone) and checks it: /api/health, the
#      mockup render check, and it refreshes the catalogue (prices + products live in code)
#   5. swaps: the app restarts on the new image (Caddy holds requests for the few seconds it takes)
#   6. health-checks the live app; if that fails it ROLLS BACK by itself to the previous image
#   7. runs the smoke test, records current/previous, and deletes images older than those two
source "$(dirname "$0")/lib.sh"
need_root
load_box_env

restart_only=0 seed=1 tag=""
for a in "$@"; do
  case "$a" in
    --restart) restart_only=1 ;;
    --no-seed) seed=0 ;;
    -*) echo "unknown option $a" >&2; exit 2 ;;
    *) tag="$a" ;;
  esac
done

exec 9>"$STATE_DIR/.deploy.lock"
flock -n 9 || { echo "another deploy or rollback is running" >&2; exit 1; }

"$KIT_DIR/bin/fetch-env.sh"

if [ "$restart_only" = 1 ]; then
  image="$(current_image)"
  [ -n "$image" ] || die "nothing deployed yet — run deploy.sh <tag> first"
  log "restarting $image with fresh settings"
  dc up -d --force-recreate app scheduler
  wait_healthy 90 || die "the app did not come back healthy after a settings restart — check: sudo $KIT_DIR/bin/logs.sh app"
  "$KIT_DIR/bin/smoke.sh"
  exit 0
fi

[ -n "$tag" ] || { echo "usage: deploy.sh <tag> | --restart [--no-seed]" >&2; exit 2; }
case "$tag" in *[!A-Za-z0-9._-]*) die "bad tag '$tag'" ;; esac
: "${IMAGE_REPO:?IMAGE_REPO missing in $BOX_ENV}"
image="$IMAGE_REPO:$tag"
live="$(current_image)"
[ "$image" != "$live" ] || die "$image is already live (use --restart to reload settings)"

# ── 2. pull ──────────────────────────────────────────────────────────────────────────────────────
log "pulling $image"
ecr_login
docker pull -q "$image" >/dev/null || die "could not pull $image from ECR"

# The database: on this box (compose network) or the managed one (reachable from the default network).
net=()
if [ "${COMPOSE_PROFILES:-}" = local-db ]; then
  APP_IMAGE="$image" dc up -d --wait db
  net=(--network snickerdoodle)
fi

# ── 3. migrations ────────────────────────────────────────────────────────────────────────────────
log "applying database migrations"
docker run --rm "${net[@]}" --env-file "$RUN_DIR/app.env" "$image" node infra/migrate.mjs \
  || die "migrations failed — nothing was swapped; the live site is unchanged"

# ── 4. the new image, on the side ────────────────────────────────────────────────────────────────
cand=snickerdoodle-candidate
docker rm -f "$cand" >/dev/null 2>&1 || true
trap 'docker rm -f '"$cand"' >/dev/null 2>&1 || true' EXIT
log "starting the new image on the side to check it"
docker run -d --name "$cand" "${net[@]}" --init --env-file "$RUN_DIR/app.env" \
  --read-only --tmpfs /tmp:size=512m,mode=1777 --tmpfs /app/.next/cache:size=256m,uid=1000,gid=1000,mode=0700 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v /opt/snickerdoodle/prodigi-assets:/app/.prodigi-assets:ro \
  "$image" >/dev/null

# in-container requests (the candidate publishes no port); the jobs secret stays inside it
in_cand() { # <method> <path> [timeout-ms] — prints the body, fails on a non-2xx
  docker exec "$cand" node -e '
    const [m, p, t] = process.argv.slice(1);
    fetch("http://127.0.0.1:3000" + p, { method: m, headers: { authorization: "Bearer " + process.env.JOBS_SECRET }, signal: AbortSignal.timeout(Number(t)) })
      .then(async (r) => { const b = await r.text(); console.log(b.slice(0, 400)); process.exit(r.ok ? 0 : 1); })
      .catch((e) => { console.log(String(e.message)); process.exit(1); });' "$1" "$2" "${3:-10000}"
}
ok=0
for _ in $(seq 1 ${CANDIDATE_TRIES:-45}); do
  if in_cand GET /api/health 3000 2>/dev/null | grep -q '"ok":true'; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { docker logs --tail 40 "$cand" >&2 || true; die "the new image never became healthy — not swapped; the live site is unchanged"; }
in_cand POST /api/health/render 30000 | grep -q '"ok":true' \
  || die "the new image could not draw a mockup (sharp/resvg) — not swapped"
log "new image healthy and drawing mockups"
if [ "$seed" = 1 ]; then
  log "refreshing the catalogue"
  in_cand POST /api/jobs/seed-catalogue 300000 || die "catalogue refresh failed — not swapped"
fi
docker rm -f "$cand" >/dev/null

# ── 5. swap ──────────────────────────────────────────────────────────────────────────────────────
log "swapping the live app to $tag"
set_release "$image"
dc up -d --remove-orphans

# ── 6. live health check, with automatic rollback ────────────────────────────────────────────────
if ! wait_healthy 90; then
  if [ -n "$live" ]; then
    log "the live app is NOT healthy on $tag — rolling back to $live"
    set_release "$live"
    dc up -d
    wait_healthy 90 && die "deploy of $tag failed its live health check; ROLLED BACK to $live (healthy)" \
      || die "deploy of $tag failed AND the rollback to $live is not healthy either — the site may be down"
  fi
  die "first deploy of $tag is not healthy — check: sudo $KIT_DIR/bin/logs.sh app"
fi

# ── 7. record, smoke, tidy ───────────────────────────────────────────────────────────────────────
[ -n "$live" ] && printf '%s\n' "$live" > "$STATE_DIR/previous"
printf '%s\n' "$image" > "$STATE_DIR/current"
printf '%s deploy %s (previous %s)\n' "$(date -u +%FT%TZ)" "$image" "${live:-none}" >> "$STATE_DIR/history.log"

"$KIT_DIR/bin/smoke.sh" || alert "deployed $tag but the smoke test failed — look now; roll back with: sudo $KIT_DIR/bin/rollback.sh"

keep="$(current_image) $(previous_image)"
docker image ls "$IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}' | while read -r old; do
  case " $keep " in *" $old "*) ;; *) docker image rm "$old" >/dev/null 2>&1 || true ;; esac
done
docker image prune -f >/dev/null 2>&1 || true
log "deployed $tag (previous: ${live:-none})"
