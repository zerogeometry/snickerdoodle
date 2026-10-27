# Moderation providers — config, thresholds, costs, paperwork (D8)

> Build note, 2026-10-27. What's wired in `src/server/moderation/` and what's still needed
> before `MODERATION_PROVIDER=real` can screen a real child's picture. Not legal advice.

## What runs on every upload

1. **Known-CSAM check** (`iwfHashList.ts`) — the bytes *exactly as uploaded* are hashed
   (MD5, SHA-1, SHA-256) and looked up in a **copy of the IWF hash list held on our own box**.
   Matched in-process: the picture doesn't go anywhere for this, and no one views it.
   Match → `BLOCKED` (runbook: preserve, never view/redistribute, report).
2. **Classifier** (`rekognition.ts`) — AWS Rekognition `DetectModerationLabels`, London
   (`eu-west-2`) only. Any label at or above the threshold → `FLAGGED` into the review queue.
   It never rejects or deletes.
3. **Studio designs** also go through Rekognition `DetectText`, so hand-drawn words get the
   same abuse screen as typed ones.

**Fail-safe:** any error, timeout, odd reply, or a missing/stale/broken hash list →
`FLAGGED` (review). Never `CLEAR`, never `BLOCKED` by mistake. Production with real
screening not configured still holds every upload for review (`screening-not-configured`).

**Single image:** each Rekognition call carries only `{ Image: { Bytes } }` (+ the threshold
for moderation). The picture is re-encoded to a plain JPEG first (max 2048px, no metadata).
No ids, names, family data or filenames. Unit-tested on the exact request payload.

## Config (`.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `MODERATION_PROVIDER` | yes | `real` in production. `stub` (or unset) is dev-only — production refuses it. |
| `MODERATION_AWS_ACCESS_KEY_ID` / `MODERATION_AWS_SECRET_ACCESS_KEY` | yes | A **separate IAM user** allowed only `rekognition:DetectModerationLabels` and `rekognition:DetectText`. From the secret store. |
| `MODERATION_AWS_REGION` | no | Defaults to `eu-west-2`. Anything else is refused. The endpoint is pinned, so `AWS_ENDPOINT_URL*` can't redirect it. |
| `REKOGNITION_MIN_CONFIDENCE` | no | Default **50** (AWS's own default). 1–100. |
| `IWF_HASH_LIST_PATH` | yes | Path to the local list. Must be `chmod 600` (refused if readable by other users). |
| `IWF_HASH_LIST_MAX_AGE_HOURS` | no | Default **48**. Older than this → every upload held for review until it's refreshed. |

A misconfigured `real` setup throws a clear error naming the missing settings (never a secret
value), and `isModerationConfigured()` stays false, so production fails closed.

**Hash list file format** (our own, simple on purpose): one entry per line, `md5:<hex>`,
`sha1:<hex>` or `sha256:<hex>` (a bare hex hash is typed by its length); blank lines and `#`
comments ignored. Any malformed line rejects the whole file. Held in memory packed and sorted
(~3M SHA-256 entries ≈ 100 MB), reloaded when the file changes. Entries are never logged.

## Threshold

50 is AWS's default and errs towards catching more. A hit only means "a person takes a look",
but every flag *is* a person seeing a child's picture (a privacy event), so tune it on a
brand-safe test set of children's drawings before launch: count flags on "scary monster",
"knight with sword", beach photos etc. Raise it if the queue is noisy; don't go above ~80
without a reason written down.

Every Rekognition category flags today, including "Swimwear or Underwear", "Alcohol" and
"Gambling". A family beach photo will be flagged. **Decision to confirm** (below).

## Costs

Rekognition Image "Group 2" APIs (`DetectModerationLabels`, `DetectText`): **$0.001 per image**
for the first 1M images/month, then $0.0008 (each API call counts as one image).
Source: [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/) — London rates
can differ slightly; check the [AWS Pricing Calculator](https://calculator.aws/) for
`eu-west-2`. At launch volumes: 1,000 uploads ≈ $1; a Studio design adds 2 calls ($0.002).
The hash check costs nothing to run (IWF Image Intercept is free for eligible small platforms).

## What's unverified (couldn't reach AWS/IWF from the build box)

- No live Rekognition call has been made. Check in staging: an ordinary drawing comes back
  with `ModerationLabels: []` (an absent list is treated as "couldn't screen" → review), and
  `DetectModerationLabels` + `DetectText` are both available in `eu-west-2`.
- **IWF integration is not confirmed.** IWF's technical docs are shared at onboarding, so
  nothing here guesses at an IWF API. Ask IWF during onboarding:
  1. How Image Intercept is delivered (hash-list download, an installed tool, or an API).
     If it's their tool or API, it slots in behind the same `HashMatchProvider` interface.
  2. Which hash types we get (MD5 / SHA-1 / SHA-256 / PhotoDNA) and how often to refresh
     (sets `IWF_HASH_LIST_MAX_AGE_HOURS`).
  3. **PhotoDNA**: cryptographic hashes only catch byte-identical files; a resized or
     re-saved copy slips through. Perceptual matching (PhotoDNA, licensed by Microsoft) is the
     real gap. Ask whether Image Intercept includes it and how it runs (in-region?).
  4. Storage and handling rules for the list (encryption at rest, who may access it, audit).
  5. The exact reporting route on a match (IWF / NCA-CEOP) for the runbook.
  6. What to send IWF in their deployment notification.
- The sync step that fetches the list from IWF and writes the file above isn't built — it
  depends on (1).

## Paperwork before go-live

- **LG5 (Article 28 DPAs):** the AWS GDPR DPA (part of the AWS Service Terms) covers
  Rekognition as a processor in our own account — record it in the sub-processor register.
  **IWF:** sign the Image Intercept / Hash List licence + complete onboarding.
- **No-training (same spirit as LG6):** AWS may use content sent to some AI services
  (Rekognition included) to improve them **unless we opt out**. Set an
  **AI services opt-out policy** in AWS Organizations for Rekognition before any real image
  is sent, and keep a screenshot for the DPIA. *(Confirm in the current AWS Service Terms.)*
- **DPIA:** add Rekognition (child images, in-region, flag-only) and the IWF list (hashes,
  no images leave) to the processing record; human review of flagged items stays rare,
  logged and disclosed.

## Decisions to confirm (founder)

1. Threshold default **50** — keep, or set after the test-set tuning?
2. Flag **every** Rekognition category, or ignore some (e.g. "Swimwear or Underwear" on
   family photos)? Ignoring means fewer people seeing children's pictures but also less
   screening; currently the more cautious "flag all" is in place.
3. Stale list (> 48h) holds **every** upload for review. Safe, but a broken sync stalls
   checkout — OK, or alert-only for a grace period?
