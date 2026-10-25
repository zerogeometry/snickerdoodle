#!/usr/bin/env bash
# Restore the database, then REPLAY THE ERASURE LEDGER so nothing a family deleted comes back
# (ops/BACKUPS-AND-ERASURE.md §3). The site is OFF the internet (Caddy stopped) from the start
# until the replay has finished with nothing failed.
#
#   sudo restore-db.sh --list                         # the VERIFIED dumps available (last 14 days)
#   sudo restore-db.sh --from <s3 key> --yes          # restore a nightly dump INTO DATABASE_URL
#   sudo restore-db.sh --replay-only --since <ISO time> --yes
#        # after a Lightsail point-in-time restore (runbook §6.3): DATABASE_URL in SSM already
#        # points at the restored database; this only replays erasures since <ISO time>
#
# --from REPLACES the contents of the database DATABASE_URL points at. It only takes a dump that
# passed its nightly check (it has a manifest) and whose sha256 still matches; it takes a fresh
# safety dump first; and the restore is ONE transaction, so a failure leaves the database as it was.
# After either kind of restore the current image's migrations run, so the app never meets an
# older schema than it expects.
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
  # one line per dump that passed its check: key, taken at, size
  aws s3 ls "s3://$BACKUP_BUCKET/db/" --recursive | awk '{print $4}' | grep '\.manifest\.json$' | sort | while read -r m; do
    aws s3 cp "s3://$BACKUP_BUCKET/$m" - --only-show-errors | jq -r '"\(.key)  taken \(.takenAt)  \(.bytes) bytes"'
  done
  exit 0
fi
[ -n "$mode" ] || { sed -n '2,15p' "$0"; exit 2; }
[ "$yes" = 1 ] || { echo "add --yes to confirm (this takes the site offline while it runs)" >&2; exit 2; }

exec 9>"$STATE_DIR/.deploy.lock"
flock -n 9 || { echo "a deploy or rollback is running — wait for it" >&2; exit 1; }
"$KIT_DIR/bin/fetch-env.sh"

if [ "$mode" = replay ]; then # refuse a bad time BEFORE taking the site offline
  [ -n "$since" ] || { echo "--replay-only needs --since <ISO time of the restore point>" >&2; exit 2; }
  date -u -d "$since" >/dev/null 2>&1 || { echo "'$since' is not a date-time" >&2; exit 2; }
fi

live_image="$(current_image)"
[ -n "$live_image" ] || die "nothing deployed yet — deploy first, then restore"
work="$(mktemp -d "$RUN_DIR/.restore.XXXXXX")" # memory only (/run is tmpfs)
trap 'rm -rf "$work"' EXIT

# Fetch and check the dump BEFORE anything is touched: a dump that never passed its nightly check,
# or no longer matches it, is refused with the site still online.
if [ "$mode" = restore ]; then
  [ -n "$key" ] || die "restore: --from <s3 key> is required"
  manifest="$(aws s3 cp "s3://$BACKUP_BUCKET/$key.manifest.json" - --only-show-errors 2>/dev/null)" \
    || die "restore: $key has no manifest — it never passed its check, so it is not restored. Pick another (--list)"
  since="$(jq -r .takenAt <<<"$manifest")"
  want_sha="$(jq -r .sha256 <<<"$manifest")"
  aws s3 cp "s3://$BACKUP_BUCKET/$key" "$work/dump" --only-show-errors || die "restore: can't download $key"
  [ "$(sha256sum "$work/dump" | cut -d' ' -f1)" = "$want_sha" ] \
    || die "restore: $key does not match its manifest (changed or damaged) — not restoring; nothing was touched"
fi

log "taking the site offline (Caddy stopped) and pausing the scheduled jobs"
dc stop caddy scheduler

if [ "$mode" = restore ]; then
  log "safety dump of the current database first"
  "$KIT_DIR/bin/backup-db.sh" || die "restore: the safety dump failed — not restoring (the site is still offline: sudo $KIT_DIR/bin/up.sh brings it back as it was)"
  dc stop app
  log "restoring $key (taken at $since)"
  PG_FLAGS="--mount type=bind,src=$work,dst=/work,readonly" \
    pg_run 'exec pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -d "$DATABASE_URL" /work/dump' \
    || die "restore FAILED and was rolled back — the database is as it was before. The site is still offline: sudo $KIT_DIR/bin/up.sh brings it back, or restore another dump."
fi

[ -n "$since" ] || die "replay: --since <ISO time the backup / restore point was taken> is required"
date -u -d "$since" >/dev/null 2>&1 || die "replay: '$since' is not a date-time"
log "bringing the restored database up to this release's schema"
app_run "$live_image" infra/migrate.mjs || die "migrations failed on the restored database — the site stays offline"
dc up -d --force-recreate app
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
