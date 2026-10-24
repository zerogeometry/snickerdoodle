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
# - A dump only COUNTS once it has been read back from S3 and restored in full to nowhere
#   (pg_restore to /dev/null — a cut-short or corrupt dump fails that), and its manifest
#   (<key>.manifest.json: size, sha256, taken-at) is written. restore-db.sh only offers dumps with a
#   manifest and checks the sha256 before restoring. The box user can't delete objects, so a dump
#   that failed its check simply sits there unlisted until the 14-day rule removes it.
# - `taken-at` is when the dump started. After a restore, every erasure since then is replayed.
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
: "${BACKUP_BUCKET:?BACKUP_BUCKET missing in $BOX_ENV}"
: "${BACKUP_KMS_KEY:?BACKUP_KMS_KEY missing in $BOX_ENV}"
[ -r "$RUN_DIR/app.env" ] || "$KIT_DIR/bin/fetch-env.sh"

taken_at="$(date -u +%FT%TZ)"
key="db/$(date -u +%Y/%m/%d)/snickerdoodle-$(date -u +%Y%m%dT%H%M%SZ).dump"
sse=(--sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY")

log "backup: dumping the database → s3://$BACKUP_BUCKET/$key"
# custom format = compressed + selective restore. pg_dump's version must be ≥ the server's.
if ! pg_run 'exec pg_dump --format=custom --compress=6 --no-owner --no-privileges "$DATABASE_URL"' \
    | aws s3 cp - "s3://$BACKUP_BUCKET/$key" "${sse[@]}" --metadata "taken-at=$taken_at" --only-show-errors; then
  die "backup FAILED: the database dump did not reach S3 (key $key)"
fi

# Read it back (into memory — /run is tmpfs) and prove it restores in full.
work="$(mktemp -d "$RUN_DIR/.backup.XXXXXX")"
trap 'rm -rf "$work"' EXIT
aws s3 cp "s3://$BACKUP_BUCKET/$key" "$work/dump" --only-show-errors || die "backup FAILED: can't read $key back"
bytes="$(stat -c %s "$work/dump")"
sha="$(sha256sum "$work/dump" | cut -d' ' -f1)"
[ "$bytes" -gt 1024 ] || die "backup FAILED: $key is only $bytes bytes"
PG_FLAGS="--mount type=bind,src=$work,dst=/work,readonly" \
  pg_run 'pg_restore --list /work/dump >/dev/null && pg_restore -f /dev/null /work/dump' \
  || die "backup FAILED: $key does not restore cleanly (cut short or corrupt) — it will not be offered for restore"

jq -n --arg key "$key" --arg sha "$sha" --arg at "$taken_at" --arg checked "$(date -u +%FT%TZ)" --argjson bytes "$bytes" \
  '{key: $key, bytes: $bytes, sha256: $sha, takenAt: $at, verifiedAt: $checked}' \
  | aws s3 cp - "s3://$BACKUP_BUCKET/$key.manifest.json" "${sse[@]}" --content-type application/json --only-show-errors \
  || die "backup FAILED: could not write the manifest for $key"

printf '%s %s %s %s\n' "$taken_at" "$key" "$bytes" "$sha" >> "$STATE_DIR/backups.log"
log "backup: ok and verified ($bytes bytes, taken at $taken_at)"
