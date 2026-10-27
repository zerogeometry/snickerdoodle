#!/usr/bin/env bash
# sudo sd-fetch-secrets [--restart]
#
# Copies the settings from AWS Parameter Store (London) into root-only files that systemd hands
# to each service. Run it after changing a setting in Parameter Store; --restart then restarts
# the app and reloads Caddy. Prints setting NAMES only, never values.
#
#   /snickerdoodle/prod/app/*  -> /etc/snickerdoodle/app.env  (the app), jobs.env (the job runner)
#   /snickerdoodle/prod/box/*  -> caddy.env, backup.env, alert.env (the box itself)
#
# Uses the app user's access key from `sudo aws configure --profile snickerdoodle`.
set -euo pipefail
umask 077

ETC=/etc/snickerdoodle
AWS=(aws --profile snickerdoodle --region eu-west-2)

main() {
  [[ $EUID -eq 0 ]] || die "run me with sudo"
  local restart=0
  [[ "${1:-}" == --restart ]] && restart=1

  local access_key secret_key
  access_key="$("${AWS[@]}" configure get aws_access_key_id || true)"
  secret_key="$("${AWS[@]}" configure get aws_secret_access_key || true)"
  [[ -n "$access_key" && -n "$secret_key" ]] || die "no AWS key yet: run  sudo aws configure --profile snickerdoodle"

  local app box
  app="$(as_env_lines /snickerdoodle/prod/app)"
  box="$(as_env_lines /snickerdoodle/prod/box)"

  # The real site is never a test site (test mode relaxes the KMS rule), and some settings are
  # made on the box, not stored in Parameter Store.
  for k in SITE_MODE TEST_SITE_PASSWORD DATABASE_URL S3_ACCESS_KEY S3_SECRET_KEY S3_ENDPOINT S3_FORCE_PATH_STYLE; do
    if has "$app" "$k"; then die "$k must not be set in Parameter Store for the real site — delete /snickerdoodle/prod/app/$k"; fi
  done
  local missing=()
  for k in APP_URL AUTH_SECRET JOBS_SECRET S3_BUCKET S3_REGION S3_KMS_KEY_ALIAS S3_KMS_KEY_ALIAS_ORIGINALS; do
    has "$app" "$k" || missing+=("app/$k")
  done
  for k in SITE_DOMAIN ACME_EMAIL; do
    has "$box" "$k" || missing+=("box/$k")
  done
  ((${#missing[@]} == 0)) || die "missing in Parameter Store: ${missing[*]} (infra/aws/put-secrets.sh adds them)"
  has "$app" AUTH_URL || app+=$'\n'"AUTH_URL=$(value_of "$app" APP_URL)"

  write_file "$ETC/app.env" "# From Parameter Store by sd-fetch-secrets — do not edit; change it there.
$app
S3_ACCESS_KEY=\"$access_key\"
S3_SECRET_KEY=\"$secret_key\""
  write_file "$ETC/jobs.env" "JOBS_BASE_URL=\"http://127.0.0.1:3000\"
$(pick "$app" JOBS_SECRET)"
  write_file "$ETC/caddy.env" "$(pick "$box" SITE_DOMAIN ACME_EMAIL)"
  write_file "$ETC/backup.env" "$(pick "$box" BACKUP_BUCKET BACKUP_KMS_KEY_ARN BACKUP_AGE_RECIPIENT)"
  write_file "$ETC/alert.env" "$(pick "$box" ALERT_WEBHOOK_URL)"

  for k in BACKUP_BUCKET BACKUP_KMS_KEY_ARN BACKUP_AGE_RECIPIENT; do
    has "$box" "$k" || warn "box/$k is not set — the nightly backup will fail until it is"
  done
  has "$box" ALERT_WEBHOOK_URL || warn "box/ALERT_WEBHOOK_URL is not set — failures will only be in the system log"

  echo "app settings: $(names "$app")"
  echo "box settings: $(names "$box")"
  if ((restart)); then
    systemctl try-restart snickerdoodle-app
    systemctl reload-or-restart caddy
    echo "app restarted, caddy reloaded"
  else
    echo "written. To use them: sudo systemctl restart snickerdoodle-app (or run me with --restart)"
  fi
}

# KEY="value" lines for every parameter under a path. Refuses values a settings file can't hold
# safely (naming the setting, never showing the value).
as_env_lines() {
  "${AWS[@]}" ssm get-parameters-by-path --path "$1" --recursive --with-decryption --output json |
    jq -r '.Parameters[] | (.Name | split("/") | last) as $k
      | if ($k | test("^[A-Z][A-Z0-9_]*$") | not) then error("setting name \($k) must look LIKE_THIS")
        elif (.Value | test("[\"\\\\$`\\n\\r]")) then error("the value of \($k) has a quote, backslash, dollar, backtick or line break, which the settings file cannot hold")
        else "\($k)=\"\(.Value)\"" end'
}

has() { grep -q "^$2=" <<<"$1"; }
pick() {
  local lines="$1"
  shift
  for k in "$@"; do grep "^$k=" <<<"$lines" || true; done
}
value_of() { sed -n "s/^$2=//p" <<<"$1" | head -n1; }
names() { sed -n 's/=.*//p' <<<"$1" | grep -v '^#' | paste -sd' ' -; }

write_file() {
  local tmp
  tmp="$(mktemp "$1.XXXXXX")"
  chmod 0600 "$tmp"
  printf '%s\n' "$2" >"$tmp"
  mv -f "$tmp" "$1"
}

warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'stopped: %s\n' "$*" >&2
  exit 1
}

main "$@"
