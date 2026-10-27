# Backups & erasure — runbook (founder decision 2026-10-13)

**Promise (privacy notice §8):** when we delete something it's gone from live systems straight
away and from backups within **14 days**; backups are only used to recover from a fault, and any
restore re-applies every deletion made since.

This follows the ICO's right-to-erasure guidance: backup data that can't be wiped instantly must
be put **"beyond use"** (not used for anything) until it is overwritten on a set schedule, and
people must be told plainly what happens.

## 1. Image files (object storage) — no long-lived backups at all

- **No separate image backup.** Durability comes from the storage service itself.
- **Bucket versioning ON** (protects against accidental overwrite/delete for a few days).
- **Lifecycle rules:** `infra/s3-lifecycle.json`
  - non-current versions expire after **7 days** → a deleted original is truly gone within a week;
  - `erasure-ledger/` objects expire after **30 days** (longer than the DB backup window).
- Applied on AWS by the CloudFormation stack (`infra/aws/snickerdoodle.yaml`, which carries the same
  rules — keep the two in step). For any other bucket: `aws s3api put-bucket-lifecycle-configuration
  --bucket <bucket> --lifecycle-configuration file://infra/s3-lifecycle.json`.
- Originals are encrypted with their own KMS key (`S3_KMS_KEY_ALIAS_ORIGINALS`). Crypto-shredding is
  **not** needed with backups this short-lived — revisit only if image backups are ever added.

## 2. Database — short-lived backups (D18: Postgres on the Lightsail box)

- **Nightly dump** at 02:30 UK time (`infra/lightsail/backup-db.sh`): `pg_dump`, encrypted with
  `age` to a key only the founder holds (the box can't decrypt it), stored in the private backups
  bucket with SSE-KMS. The bucket deletes dumps after **13 days**, so a deletion is out of the dumps
  within 14.
- **Lightsail automatic snapshots**, the 7 most recent kept. Never keep a *manual* snapshot past
  14 days.
- No other database copies. The DB holds no image bytes — only ids, first names, birthdays,
  emails, orders, etc. — and no pictures are stored on the box's disk.

## 3. After ANY database restore — replay the erasure ledger

Every erasure (keepsake, little one, member removal/leave, account closure incl. handover) is also
written, ids only, to `erasure-ledger/` in object storage (`src/server/erasureLedger.ts`) — outside
the database, so a restore can't roll it back.

`sudo sd-restore` (infra/README.md, "If you need to restore") does this for you: it keeps the site
offline, restores, replays and only reopens when the replay is clean. By hand, on the box, before
reopening the app (the job routes are not reachable from the internet):

```
sudo sd-job --once reapply-erasures --since <ISO time the backup was taken> --print-body
```

The response lists `reapplied`, `alreadyGone` and any `failed` entries — fix and re-run until
`failed` is empty (it is idempotent). Not replayable: *edits* (e.g. a corrected first name) — tell
affected parents if a restore loses recent edits.

## 4. Audit trail

- `audit_records` is append-only (DB trigger). Holds ids, event names, dates, counts — no names,
  no content. Kept **6 years** (limitation period), then removed by the daily retention job
  (`purgeExpiredAuditRecords`, migration `0034` allows only that narrow delete).
- Confirm the 6-year period with the DP professional (project-office/compliance/OPEN-QUESTIONS).

## 5. Print provider (Prodigi)

- They receive only the print file, via a link that expires after **24 hours**.
- **Open:** ask Prodigi (in the Article 28 DPA) how long they keep print files and whether they
  delete automatically or on request; target ≤ 30 days after dispatch. Record the answer in the
  sub-processor register and the privacy notice.
