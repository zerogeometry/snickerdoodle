#!/usr/bin/env bash
# The box watching itself — hourly (snickerdoodle-watchdog.timer). Emails the founder (SNS) when
# something needs a person, with or without CloudWatch:
#   - a service isn't running, or the app's own health check fails;
#   - the disk is filling (≥ 85 %);
#   - the last VERIFIED database backup is older than 26 hours (the nightly job stopped or failed);
#   - the HTTPS certificate expires within 7 days (Caddy renews with a third of its life left —
#     30 days on a 90-day certificate, 15 on a 45-day one — so renewal is failing);
#   - in the last hour the app or scheduler logged a line that means a promise to families may be
#     broken: an erasure not recorded, retention left undone, a job failed, fulfilment stuck.
# Each problem is emailed once, then again every 12 hours while it lasts, and "resolved" once it
# clears. Messages carry counts and names of checks — never personal data.
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
[ -r "$RELEASE_ENV" ] || exit 0 # nothing deployed yet

ALERT_DIR="$STATE_DIR/alerts"
mkdir -p "$ALERT_DIR"
REPEAT_SECONDS=$((12 * 3600))
now="$(date +%s)"
problems=()

problem() { problems+=("$1"); } # "<id>|<message>"

# ── services and health ─────────────────────────────────────────────────────────────────────────
services=(app caddy scheduler)
[ "${COMPOSE_PROFILES:-}" = local-db ] && services+=(db)
running="$(dc ps --status running --format '{{.Service}}' 2>/dev/null || true)"
for s in "${services[@]}"; do
  grep -qx "$s" <<<"$running" || problem "down-$s|the $s service is not running"
done
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok":true' \
  || problem "health|the app's health check is failing (app down or database unreachable)"

# ── disk ────────────────────────────────────────────────────────────────────────────────────────
used="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
[ "${used:-0}" -lt 85 ] || problem "disk|the disk is ${used}% full"

# ── backups (verified ones only — see backup-db.sh) ─────────────────────────────────────────────
last="$(tail -n1 "$STATE_DIR/backups.log" 2>/dev/null | cut -d' ' -f1)"
if [ -z "$last" ]; then
  # first day: only complain once the box has been up for a day
  [ "$(cut -d. -f1 /proc/uptime)" -lt 93600 ] || problem "backup|no verified database backup has been recorded"
else
  age=$(( now - $(date -u -d "$last" +%s) ))
  [ "$age" -lt 93600 ] || problem "backup|the last verified database backup is $((age / 3600)) hours old"
fi

# ── HTTPS certificate ───────────────────────────────────────────────────────────────────────────
if [ -n "${SITE_DOMAIN:-}" ]; then
  end="$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$SITE_DOMAIN" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -n "$end" ]; then
    days=$(( ($(date -u -d "$end" +%s) - now) / 86400 ))
    [ "$days" -ge 7 ] || problem "cert|the HTTPS certificate expires in $days days (Caddy should have renewed it)"
  fi
fi

# ── log lines that mean a promise may be broken (last hour, a little overlap) ───────────────────
scan() { # <service> <pattern> <id> <what> [threshold]
  local n
  n="$(dc logs --no-log-prefix --since 65m "$1" 2>/dev/null | grep -cF -- "$2" || true)"
  [ "${n:-0}" -lt "${5:-1}" ] || problem "$3|$4 ($n in the last hour)"
}
scan app '[erasure-ledger] FAILED' erasure-ledger 'a deletion was NOT recorded in the erasure ledger — a restore could bring it back; see: logs.sh app'
scan app '[retention] needs attention' retention 'retention left something undone (an upload past its deletion date?)'
scan app '[fulfilment] tick needs attention' fulfilment 'fulfilment needs attention (an order stuck or blocked)'
scan app '[health] database check failed' database 'the app could not reach the database' 3
scan scheduler '[jobs] FAILED' jobs 'a scheduled job failed; see: logs.sh jobs'

# ── email: new problems, still-there problems every 12 h, and what cleared ──────────────────────
send=()
declare -A seen=()
for p in "${problems[@]}"; do
  id="${p%%|*}"
  seen[$id]=1
  stamp="$ALERT_DIR/$id"
  if [ ! -e "$stamp" ] || [ $(( now - $(stat -c %Y "$stamp") )) -ge "$REPEAT_SECONDS" ]; then
    send+=("PROBLEM: ${p#*|}")
    touch "$stamp"
  fi
done
for stamp in "$ALERT_DIR"/*; do
  [ -e "$stamp" ] || continue
  id="$(basename "$stamp")"
  if [ -z "${seen[$id]:-}" ]; then
    send+=("resolved: $id")
    rm -f "$stamp"
  fi
done
for p in "${problems[@]}"; do log "watchdog: ${p#*|}"; done
if [ "${#send[@]}" -gt 0 ]; then
  alert "$(printf '%s\n' "${send[@]}")"
fi
[ "${#problems[@]}" -eq 0 ] && log "watchdog: all well"
exit 0
