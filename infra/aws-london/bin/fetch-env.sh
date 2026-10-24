#!/usr/bin/env bash
# Reads the app's settings from SSM Parameter Store (SSM_PATH, e.g. /snickerdoodle/prod/) into
# memory-only files under /run/snickerdoodle (tmpfs, root-only, gone on reboot — the systemd unit
# runs this again at boot):
#   app.env       every setting, for the app container (LOCAL_DB_PASSWORD left out)
#   jobs_secret   JOBS_SECRET alone, for the scheduler
#   db_password   LOCAL_DB_PASSWORD alone, for the on-box database (empty otherwise)
# Never prints a value.
#   sudo /opt/snickerdoodle/kit/bin/fetch-env.sh
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
: "${SSM_PATH:?SSM_PATH missing in $BOX_ENV}"

umask 077
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
tmp="$(mktemp "$RUN_DIR/.fetch.XXXXXX")"
trap 'rm -f "$tmp" "$tmp.env"' EXIT

aws ssm get-parameters-by-path --path "$SSM_PATH" --recursive --with-decryption --output json > "$tmp" \
  || die "could not read settings from SSM ($SSM_PATH) — check the box user's key and policy"

# NAME=value lines; the NAME is the last part of the parameter path. Refuse multi-line values
# (an env file can't hold them) rather than silently cutting one short.
jq -r '.Parameters[] | [(.Name | split("/") | last), .Value] | @json' "$tmp" | while IFS= read -r row; do
  name="$(jq -r '.[0]' <<<"$row")"
  value="$(jq -r '.[1]' <<<"$row")"
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "skip: parameter name '$name' is not an env-var name" >&2; continue; }
  if [[ "$value" == *$'\n'* ]]; then echo "refusing: $name has more than one line" >&2; exit 3; fi
  printf '%s=%s\n' "$name" "$value"
done > "$tmp.env" || die "a setting in SSM can't be used (see above)"

count="$(wc -l < "$tmp.env")"
[ "$count" -gt 0 ] || die "no settings found under $SSM_PATH"

has() { grep -q "^$1=." "$tmp.env"; }
missing=()
for k in DATABASE_URL AUTH_SECRET AUTH_URL APP_URL JOBS_SECRET S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY \
         S3_KMS_KEY_ALIAS S3_KMS_KEY_ALIAS_ORIGINALS MAIL_PROVIDER; do
  has "$k" || missing+=("$k")
done
[ "${#missing[@]}" -eq 0 ] || die "missing in SSM: ${missing[*]}"
# developer-only switches must never reach the real box
for k in DEV_UPLOADS_ARE_BRAND_SAFE_FIXTURES S3_ENDPOINT S3_FORCE_PATH_STYLE NEXT_DIST_DIR; do
  has "$k" && die "$k is set in SSM — it is for local development only; delete that parameter"
done
# The AWS SDK obeys AWS_ENDPOINT_URL / AWS_ENDPOINT_URL_<SERVICE>: one of these could send
# children's pictures (S3, Rekognition) somewhere other than AWS London. Never allowed.
if grep -q '^AWS_ENDPOINT_URL' "$tmp.env"; then
  die "an AWS_ENDPOINT_URL* setting is in SSM — it would redirect AWS calls; delete it"
fi
# real content-safety screening calls Rekognition with the app user's key (standard AWS chain)
if grep -q '^MODERATION_PROVIDER=real$' "$tmp.env"; then
  for k in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do has "$k" || missing+=("$k"); done
  [ "${#missing[@]}" -eq 0 ] || die "MODERATION_PROVIDER=real but missing in SSM: ${missing[*]}"
fi
# not fatal, but worth a line: an unverified database certificate, an unpinned client-IP header
db_url="$(sed -n 's/^DATABASE_URL=//p' "$tmp.env")"
if [[ "$db_url" != *@db:* && "$db_url" != *sslmode=verify-full* ]]; then
  log "warning: DATABASE_URL does not use sslmode=verify-full — the database's certificate is not checked (runbook §3.8)"
fi
has CLIENT_IP_HEADER || log "warning: CLIENT_IP_HEADER is not set — set it to x-real-ip (runbook §3.6)"
if [ "${COMPOSE_PROFILES:-}" = local-db ] && ! has LOCAL_DB_PASSWORD; then
  die "COMPOSE_PROFILES=local-db but LOCAL_DB_PASSWORD is not in SSM"
fi

grep -v '^LOCAL_DB_PASSWORD=' "$tmp.env" > "$RUN_DIR/app.env.new"
sed -n 's/^JOBS_SECRET=//p' "$tmp.env" | tr -d '\n' > "$RUN_DIR/jobs_secret.new"
sed -n 's/^LOCAL_DB_PASSWORD=//p' "$tmp.env" | tr -d '\n' > "$RUN_DIR/db_password.new"
for f in app.env jobs_secret db_password; do
  chmod 400 "$RUN_DIR/$f.new"
  # if Docker ever created a directory here (a mount whose file was missing), clear it
  [ -d "$RUN_DIR/$f" ] && rm -rf "${RUN_DIR:?}/$f"
  mv -f "$RUN_DIR/$f.new" "$RUN_DIR/$f"
done
# the app runs as its own user id (docker-compose.yml): only it and root can read its settings
chown "$APP_UID:$APP_UID" "$RUN_DIR/app.env"
log "settings loaded from SSM: $count (values not shown)"
