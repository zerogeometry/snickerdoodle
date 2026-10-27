# Shared bits for setup.sh and deploy.sh (sourced, not run).
# shellcheck shell=bash

step() { printf '\n== %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'stopped: %s\n' "$*" >&2
  exit 1
}

# A root-only file, written atomically.
write_secret_file() {
  local tmp
  tmp="$(mktemp "$1.XXXXXX")"
  chmod 0600 "$tmp"
  printf '%s\n' "$2" >"$tmp"
  mv -f "$tmp" "$1"
}

# Installs the units, Caddyfile and sd-* commands from a checkout or release folder
# (the folder holding this file).
install_box_files() {
  local from="$1"
  install -m 0644 "$from"/systemd/*.service "$from"/systemd/*.timer /etc/systemd/system/
  install -d -m 0755 /etc/systemd/system/caddy.service.d
  install -m 0644 "$from/systemd/caddy-snickerdoodle.conf" /etc/systemd/system/caddy.service.d/snickerdoodle.conf
  install -d -m 0755 /etc/caddy
  install -m 0644 "$from/Caddyfile" /etc/caddy/Caddyfile
  install -m 0755 "$from/fetch-secrets.sh" /usr/local/sbin/sd-fetch-secrets
  install -m 0755 "$from/backup-db.sh" /usr/local/sbin/sd-backup
  install -m 0755 "$from/restore-db.sh" /usr/local/sbin/sd-restore
  install -m 0755 "$from/alert.sh" /usr/local/sbin/sd-alert
  install -m 0755 "$from/sd-job.sh" /usr/local/sbin/sd-job
  install -d -m 0755 /usr/local/lib/snickerdoodle
  install -m 0644 "$from/db-grants.sql" /usr/local/lib/snickerdoodle/db-grants.sql
  systemctl daemon-reload
}

# Re-applies the least-privilege grants (after a migration or a restore).
apply_db_grants() {
  runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d snickerdoodle -f /usr/local/lib/snickerdoodle/db-grants.sql
}
