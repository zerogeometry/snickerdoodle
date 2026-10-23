#!/usr/bin/env bash
# Restore the database, then REPLAY THE ERASURE LEDGER so nothing a family deleted comes back
# (ops/BACKUPS-AND-ERASURE.md §3). The site is OFF the internet (Caddy stopped) from the start
# until the replay has finished with nothing failed.
#
#   sudo restore-db.sh --list                         # the dumps available (last 14 days)
#   sudo restore-db.sh --from <s3 key> --yes          # restore a nightly dump INTO DATABASE_URL
#   sudo restore-db.sh --replay-only --since <ISO time> --yes
#        # after a Lightsail point-in-time restore (runbook §6.3): DATABASE_URL in SSM already
#        # points at the restored database; this only replays erasures since <ISO time>
#
# --from REPLACES the contents of the database DATABASE_URL points at. There is no undo, so it
# takes a fresh safety dump first (bin/backup-db.sh).
source "$(dirname "$0")/lib.sh"
need_root
load_box_env

mode="" key="" since="" yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) mode=list ;;
    --from) mode=restore; key="${2:-}"; shift ;;
    --replay-only) mode=replay ;;
    --since) since="${2:-}"; shift ;;
    --yes) yes=1 ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$mode" = list ]; then
  aws s3 ls "s3://$BACKUP_BUCKET/db/" --recursive | sort
  exit 0
fi
[ -n "$mode" ] || { sed -n '2,15p' "$0"; exit 2; }
[ "$yes" = 1 ] || { echo "add --yes to confirm (this takes the site offline while it runs)" >&2; exit 2; }

exec 9>"$STATE_DIR/.deploy.lock"
flock -n 9 || { echo "a deploy or rollback is running — wait for it" >&2; exit 1; }
"$KIT_DIR/bin/fetch-env.sh"

net=()
[ "${COMPOSE_PROFILES:-}" = local-db ] && net=(--network snickerdoodle)

log "taking the site offline (Caddy stopped) and pausing the scheduled jobs"
dc stop caddy scheduler

if [ "$mode" = restore ]; then
  [ -n "$key" ] || die "restore: --from <s3 key> is required"
  since="$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" --query 'Metadata."taken-at"' --output text)" \
    || die "restore: can't read $key"
  [ -n "$since" ] && [ "$since" != None ] || die "restore: $key has no taken-at time"
  log "safety dump of the current database first"
  "$KIT_DIR/bin/backup-db.sh" || die "restore: the safety dump failed — not restoring"
  dc stop app
  DATABASE_URL="$(app_setting DATABASE_URL)"
  export DATABASE_URL
  log "restoring $key (taken at $since)"
  aws s3 cp "s3://$BACKUP_BUCKET/$key" - --only-show-errors \
    | docker run --rm -i "${net[@]}" -e DATABASE_URL "${POSTGRES_IMAGE:-postgres:16-bookworm}" \
        sh -c 'exec pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -d "$DATABASE_URL"' \
    || die "restore FAILED — the site stays offline. Fix, or restore another dump."
  dc up -d app
fi

[ -n "$since" ] || die "replay: --since <ISO time the backup / restore point was taken> is required"
date -u -d "$since" >/dev/null 2>&1 || die "replay: '$since' is not a date-time"
if [ "$mode" = replay ]; then dc up -d --force-recreate app; fi
wait_healthy 120 || die "the app is not healthy after the restore — the site stays offline"

secret="$(cat "$RUN_DIR/jobs_secret")"
for attempt in $(seq 1 "${REPLAY_TRIES:-3}"); do
  log "replaying erasures since $since (attempt $attempt)"
  out="$(curl -fsS -X POST --max-time 900 -H "authorization: Bearer $secret" \
    "http://127.0.0.1:3000/api/jobs/reapply-erasures?since=$(jq -rn --arg s "$since" '$s|@uri')")" \
    || { log "the replay call failed"; sleep 10; continue; }
  log "replay: $(jq -c '{entries, reapplied, alreadyGone, failed: (.failed | length)}' <<<"$out")"
  if [ "$(jq '.failed | length' <<<"$out")" = 0 ]; then
    log "every erasure since $since is re-applied — putting the site back online"
    dc up -d caddy scheduler
    printf '%s restore since=%s from=%s\n' "$(date -u +%FT%TZ)" "$since" "${key:-pitr}" >> "$STATE_DIR/history.log"
    "$KIT_DIR/bin/smoke.sh" || true
    alert "database restored (data as of $since) and erasures replayed; the site is back online"
    exit 0
  fi
  sleep 10
done
die "erasure replay still has failures after ${REPLAY_TRIES:-3} tries — the site STAYS OFFLINE. Run the replay again (it is safe to repeat): sudo $0 --replay-only --since $since --yes"
