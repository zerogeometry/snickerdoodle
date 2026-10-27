#!/usr/bin/env bash
# sd-backup — the nightly database backup (snickerdoodle-backup.timer runs it at 02:30 London).
#
#   pg_dump  ->  age (encrypted to the founder's backup key; this box can't decrypt it)
#            ->  private S3 backups bucket, SSE-KMS with the general key
#
# The dump never touches the disk unencrypted. The bucket deletes dumps after 13 days, so a
# deletion is gone from backups within 14 (privacy notice §8). Dumps hold no pictures: those
# live only in the picture bucket. The file name carries the time the dump STARTED — after a
# restore, erasures are replayed from that moment (restore-db.sh).
set -euo pipefail
umask 077

[[ $EUID -eq 0 ]] || {
  echo "run me with sudo" >&2
  exit 1
}
set -a
# shellcheck source=/dev/null
. /etc/snickerdoodle/backup.env
set +a
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set (box/BACKUP_BUCKET in Parameter Store, then sd-fetch-secrets)}"
: "${BACKUP_KMS_KEY_ARN:?BACKUP_KMS_KEY_ARN is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set (the public half of the backup key, age1...)}"
[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || {
  echo "BACKUP_AGE_RECIPIENT should start age1 — it is the PUBLIC key, never the secret one" >&2
  exit 1
}

AWS=(aws --profile snickerdoodle --region eu-west-2)
started="$(date -u +%Y-%m-%dT%H%M%SZ)"
key="db/snickerdoodle-${started}.dump.age"
t0=$SECONDS

runuser -u postgres -- pg_dump --format=custom --no-password snickerdoodle |
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" |
  "${AWS[@]}" s3 cp - "s3://${BACKUP_BUCKET}/${key}" \
    --sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY_ARN" --only-show-errors

bytes="$("${AWS[@]}" s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" --query ContentLength --output text)"
if ! [[ "$bytes" =~ ^[0-9]+$ ]] || ((bytes < 1024)); then
  echo "{\"level\":\"error\",\"event\":\"backup-failed\",\"key\":\"${key}\",\"reason\":\"uploaded file is missing or too small\"}"
  exit 1
fi
echo "{\"level\":\"info\",\"event\":\"backup-ok\",\"key\":\"${key}\",\"bytes\":${bytes},\"seconds\":$((SECONDS - t0))}"
