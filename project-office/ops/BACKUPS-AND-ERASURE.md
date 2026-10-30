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
  - non-current versions expire after **7 days**. This is only a backstop: when the app deletes a
    picture (retention, "delete", account closure, review "remove") it removes **every version and
    delete marker** of it straight away (`deleteObjectConfirmed`, src/storage/objects.ts — 08-B4).
    Versioning still protects against an accidental overwrite;
  - `erasure-ledger/` objects expire after **30 days** (longer than the DB backup window);
  - `quarantine/` (direct uploads not yet checked) expire after **1 day**, non-current versions too —
    a backstop; the app deletes every version itself on finalise (ops/DIRECT-UPLOADS.md).
- Apply (AWS): `aws s3api put-bucket-versioning --bucket <bucket> --versioning-configuration Status=Enabled`
  then `aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://infra/s3-lifecycle.json`.
- Originals are encrypted with their own KMS key (`S3_KMS_KEY_ALIAS_ORIGINALS`). Crypto-shredding is
  **not** needed with backups this short-lived — revisit only if image backups are ever added.

## 2. Database — short point-in-time backups

- Managed Postgres with **point-in-time recovery, retention 14 days**. No manual long-lived dumps.
- The DB holds no image bytes — only ids, first names, birthdays, emails, orders, etc.
- *(2026-10-22)* On the AWS London box (D18) this is either the **Lightsail managed database**
  (point-in-time restore over **7 days**, inside the 14-day promise) **or** Postgres on the box;
  both add a nightly KMS-encrypted dump kept **14 days**. With Postgres on the box the nightly dump
  is the only restore point. How-to: `ops/AWS-LONDON-RUNBOOK.md` §6 (`infra/aws-london/bin/restore-db.sh`
  does the §3 replay for you and keeps the site offline until it's clean).

## 3. After ANY database restore — replay the erasure ledger

Every erasure (keepsake, little one, member removal/leave, account closure incl. handover) is also
written, ids only, to `erasure-ledger/` in object storage (`src/server/erasureLedger.ts`) — outside
the database, so a restore can't roll it back.

Immediately after restoring, before reopening the app:

```
curl -X POST "$APP_URL/api/jobs/reapply-erasures?since=<ISO time the backup was taken>" \
  -H "authorization: Bearer $JOBS_SECRET"
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
