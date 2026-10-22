#!/usr/bin/env bash
# Nightly database dump to S3 (runbook §6). Run by the snickerdoodle-backup systemd timer; works
# for BOTH database options (on-box or Lightsail managed — it just follows DATABASE_URL).
#
#   sudo /opt/snickerdoodle/kit/bin/backup-db.sh
#
# - The dump holds NO picture bytes (children's pictures live only in the private S3 bucket and are
#   never backed up separately — ops/BACKUPS-AND-ERASURE.md §1). It does hold names, birthdays,
#   emails and orders, so it is encrypted with the general KMS key and kept 14 days only (the
#   backups bucket's lifecycle rule, infra/aws-london/s3/backups-lifecycle.json) — the privacy
#   notice promise: "gone from backups within 14 days".
# - The object records `taken-at` (when the dump started). After a restore, every erasure since
#   that moment is replayed (bin/restore-db.sh does it).
# - The box user may write backups but not delete them, so a compromised box can't wipe them.
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
: "${BACKUP_BUCKET:?BACKUP_BUCKET missing in $BOX_ENV}"
: "${BACKUP_KMS_KEY:?BACKUP_KMS_KEY missing in $BOX_ENV}"
[ -r "$RUN_DIR/app.env" ] || "$KIT_DIR/bin/fetch-env.sh"

DATABASE_URL="$(app_setting DATABASE_URL)"
export DATABASE_URL
[ -n "$DATABASE_URL" ] || die "backup: DATABASE_URL is not set"

taken_at="$(date -u +%FT%TZ)"
key="db/$(date -u +%Y/%m/%d)/snickerdoodle-$(date -u +%Y%m%dT%H%M%SZ).dump"
net=()
[ "${COMPOSE_PROFILES:-}" = local-db ] && net=(--network snickerdoodle)

log "backup: dumping the database → s3://$BACKUP_BUCKET/$key"
# pg_dump runs in the Postgres image (its version must be ≥ the server's); the URL goes in by
# environment, never on a command line. Custom format = compressed + selective restore.
if ! docker run --rm -i "${net[@]}" -e DATABASE_URL "${POSTGRES_IMAGE:-postgres:16-bookworm}" \
      sh -c 'exec pg_dump --format=custom --compress=6 --no-owner --no-privileges "$DATABASE_URL"' \
    | aws s3 cp - "s3://$BACKUP_BUCKET/$key" \
        --sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY" \
        --metadata "taken-at=$taken_at" --only-show-errors; then
  die "backup FAILED: the database dump did not reach S3 (key $key)"
fi

size="$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" --query ContentLength --output text 2>/dev/null || echo 0)"
[ "${size:-0}" -gt 1024 ] || die "backup FAILED: the dump in S3 is empty or missing ($key, $size bytes)"
printf '%s %s %s\n' "$taken_at" "$key" "$size" >> "$STATE_DIR/backups.log"
log "backup: ok ($size bytes, taken at $taken_at)"
