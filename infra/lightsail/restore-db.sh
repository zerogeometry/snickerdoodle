#!/usr/bin/env bash
# sd-restore — put the database back from a nightly backup, then delete again everything that
# was deleted since (the erasure ledger). The site stays offline until that replay is clean.
#
#   sudo sd-restore list                                  the backups there are (newest last)
#   sudo sd-restore <backup name | latest> --identity <file> [--keep-old] [--yes]
#   sudo sd-restore --replay-only --since <ISO time>      after restoring a Lightsail snapshot
#
# --identity is the SECRET half of the backup key (AGE-SECRET-KEY-1...), pasted into a root-only
# file just for this; delete it afterwards. Full steps: infra/README.md, "If you need to restore".
set -euo pipefail
umask 077

AWS=(aws --profile snickerdoodle --region eu-west-2)
APP=http://127.0.0.1:3000/

main() {
  [[ $EUID -eq 0 ]] || die "run me with sudo"
  set -a
  # shellcheck source=/dev/null
  . /etc/snickerdoodle/backup.env
  set +a

  local name="" identity="" since="" keep_old=0 yes=0 replay_only=0
  while (($#)); do
    case "$1" in
      list)
        list_backups
        return
        ;;
      --identity) identity="${2:?--identity needs a file}"; shift ;;
      --since) since="${2:?--since needs a time}"; shift ;;
      --keep-old) keep_old=1 ;;
      --yes) yes=1 ;;
      --replay-only) replay_only=1 ;;
      -*) die "unknown option $1" ;;
      *) name="$1" ;;
    esac
    shift
  done

  if ((replay_only)); then
    [[ -n "$since" ]] || die "--replay-only needs --since <the time the snapshot was taken, e.g. 2026-10-27T02:00:00Z>"
    go_offline
    systemctl start snickerdoodle-app
    wait_for_app
    replay_and_reopen "$since"
    return
  fi

  [[ -n "$name" ]] || die "which backup? try: sudo sd-restore list"
  [[ -f "$identity" ]] || die "--identity <file> with the backup key's secret half is needed"
  if [[ "$name" == latest ]]; then name="$(list_backups | tail -n1)"; fi
  [[ "$name" =~ ^snickerdoodle-([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.dump\.age$ ]] ||
    die "\"$name\" doesn't look like one of our backups (try: sudo sd-restore list)"
  since="${BASH_REMATCH[1]}T${BASH_REMATCH[2]}:${BASH_REMATCH[3]}:${BASH_REMATCH[4]}Z"

  echo "This replaces the live database with $name (taken $since)."
  echo "Anything changed since then is lost, except deletions, which are re-applied."
  if ((!yes)); then
    read -rp 'Type restore to carry on: ' answer
    [[ "$answer" == restore ]] || die "nothing changed"
  fi

  go_offline
  systemctl stop snickerdoodle-app

  echo "restoring into a fresh database…"
  runuser -u postgres -- dropdb --if-exists snickerdoodle_restore
  runuser -u postgres -- createdb --owner=sd_migrator snickerdoodle_restore
  # Streamed: download -> decrypt -> restore. Nothing unencrypted is written to disk.
  "${AWS[@]}" s3 cp "s3://${BACKUP_BUCKET}/db/${name}" - --only-show-errors |
    age --decrypt --identity "$identity" |
    runuser -u postgres -- pg_restore --no-owner --no-acl --role=sd_migrator --exit-on-error --single-transaction -d snickerdoodle_restore

  local old
  old="snickerdoodle_before_restore_$(date -u +%Y%m%d%H%M%S)"
  runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d postgres <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('snickerdoodle', 'snickerdoodle_restore') AND pid <> pg_backend_pid();
ALTER DATABASE snickerdoodle RENAME TO ${old};
ALTER DATABASE snickerdoodle_restore RENAME TO snickerdoodle;
SQL
  # the least-privilege grants (a dump restores without them)
  runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d snickerdoodle -f /usr/local/lib/snickerdoodle/db-grants.sql

  systemctl start snickerdoodle-app
  wait_for_app
  replay_and_reopen "$since"

  if ((keep_old)); then
    echo "the old database is kept as ${old}. Drop it within 14 days:"
    echo "  sudo -u postgres dropdb ${old}"
  else
    runuser -u postgres -- dropdb "$old"
    echo "the old database was dropped"
  fi
  echo "done. Now delete the key file: sudo shred -u $identity"
}

list_backups() {
  "${AWS[@]}" s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix db/ --query 'Contents[].Key' --output text |
    tr '\t' '\n' | sed -n 's#^db/##p' | grep '^snickerdoodle-' | sort
}

# Caddy off = nobody reaches the site; timers off = no jobs or backups mid-restore.
go_offline() {
  systemctl stop caddy
  systemctl stop 'snickerdoodle-job-*.timer' snickerdoodle-backup.timer
  systemctl stop 'snickerdoodle-job@*.service' 2>/dev/null || true
  echo "site offline"
}

wait_for_app() {
  for _ in $(seq 1 45); do
    curl -fsS -o /dev/null --max-time 5 "$APP" && return 0
    sleep 2
  done
  die "the app didn't start — see: sudo journalctl -u snickerdoodle-app -n 100. The site stays offline."
}

replay_and_reopen() {
  echo "re-applying erasures made since $1…"
  if ! sd-job --once reapply-erasures --since "$1" --print-body; then
    die "some erasures did not re-apply. The site stays OFFLINE. Fix what the list above says, then run:
  sudo sd-restore --replay-only --since $1"
  fi
  local timers
  mapfile -t timers < <(cd /etc/systemd/system && ls snickerdoodle-job-*.timer)
  systemctl start "${timers[@]}" snickerdoodle-backup.timer
  systemctl start caddy
  echo "erasures re-applied; site back online"
}

die() {
  printf 'stopped: %s\n' "$*" >&2
  exit 1
}

main "$@"
