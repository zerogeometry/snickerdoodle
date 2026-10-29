# Test sweep 2026-10-29 · Tester 08: accounts, data rights, content safety, admin and jobs

**Branch:** `claude/sweep-8-accounts-jobs-011059` (cut from `feat/christmas-season` @ d6f890b)

**Environment:**
- Own database `snickerdoodle_t8` and own MinIO bucket `snickerdoodle-t8`. I touched no shared objects.
- e2e server: production build (`next start`) on **:3208**, with `MAIL_PROVIDER=console` and the local MinIO KMS key.
- Stripe is in **test** mode (`sk_test_`). Prodigi is the **sandbox** (`api.sandbox.prodigi.com/v4.0`).
- No dev server was needed: the stub-moderation path is covered by an integration test (C2).

**Scope:**
- Sign-up, sign-in and sign-out.
- Adopting a guest's drawing.
- Keep and keep-choice.
- See, download and delete your data. Account closure.
- Retention and every `/api/jobs/*` endpoint.
- Content-safety gates, the admin review queue and the support inbox.
- The complaint and help forms.
- Health checks.

## Summary

| | count |
|---|---|
| PASS | 57 |
| FAIL | 14 |
| NOT TESTED (reason given) | 4 |
| NOT TESTABLE LOCALLY | 3 |

**P0 / P1, one line each:**
- **08-B1 (P0):** a guest can put their own drawing into a stranger's private keepsake box just by typing the stranger's email. Tester 07 found the same thing independently (07-B5).
- **08-B2 (P0):** an unkept upload on an abandoned checkout (order left PENDING) is never deleted. Nothing ever expires a PENDING order.
- **08-B7 (P0):** today, with no real screening set up, an admin can **look at** and **clear** an upload whose known-CSAM hash check never ran. Once cleared, it can be printed.
- **08-B8 (P0, depends on timing):** a product mockup that finishes rendering just as its keepsake is erased leaves a picture of the drawing in the bucket, untracked, for ever. This happened for real in an e2e run (5 thumbnails).
- **08-B5 (P1):** "delete" goes straight through on a keepsake that a paid, not-yet-made order needs. The order fails silently and stays PAID.
- **08-B3 (P1):** a keepsake flagged *after* its order was paid (for example, reported) still renders READY and would be sent to print.

## What is real and what is stubbed (content safety)

| check | locally (dev, `next dev`) | e2e / production build with nothing set up | `MODERATION_PROVIDER=real` |
|---|---|---|---|
| Known-CSAM hash check (IWF) | **stub**: always "no match" (`providers.ts:47`) | not run. Upload held as `screening-not-configured` | **closed**: there is no IWF adapter (`iwf.ts:48`), so every check throws. But because `isModerationConfigured()` is false, the upload is labelled `screening-not-configured` too (`moderation/index.ts:86`) |
| Classifier (Rekognition, eu-west-2) | **stub**: passes everything | not run | real client. Not called by me (no AWS, by the rules) |
| Drawn-text reader (Rekognition DetectText) | stub: reads nothing | not run | real |
| Result | upload is **CLEAR**, so it can be ordered | upload is **FLAGGED**, held for review, can't be ordered | upload is **FLAGGED**, held |

So in **every production configuration today**, uploads are held. The only way a held upload gets out is a reviewer pressing "it's fine". See 08-B7: that button is currently allowed for these uploads.

## (a) Coverage checklist

Evidence is the test's file and name.

- `acc` = `e2e/sweep-08-accounts.spec.ts`
- `sj` = `e2e/sweep-08-safety-jobs.spec.ts`
- `ret` = `src/server/__tests__/sweep08-retention.int.test.ts`
- `pay` = `src/fulfillment/__tests__/sweep08-flagged-after-payment.int.test.ts`

Existing suites I re-ran on my database: 31 files, 241 tests passed. The only failures were in `launchLoop.int` (see "Other notes").

All my sweep tests passed in the final run:
- e2e `acc` + `sj`: 34 passed, 4 marked fixme as bug repros.
- New Vitest files: 4 passed, 4 skipped as bug repros.

### Accounts
| # | item | result | evidence |
|---|---|---|---|
| A1 | A guest is sent to /login from /account and /home | PASS | acc "a guest is sent to /login…" |
| A2 | The real /login form sends the one-tap email. The emailed link signs you in and lands on /home | PASS | acc "the real form: email → one-tap link…" (the link was read from the console mailer) |
| A3 | A sign-in link works once (a second browser stays signed out) | PASS | same test |
| A4 | An expired sign-in link doesn't sign in or create an account | PASS | acc "an expired sign-in link does not sign in" |
| A5 | First sign-in creates the account with `email_verified_at` set | PASS | acc "the real form…" |
| A6 | Log out deletes the database session, and /account then sends you to /login | PASS | acc "log out ends the session in the database…" |
| A7 | An expired session counts as signed out | PASS | acc "an expired session is treated as signed out" |
| A8 | Sign-in email rate limits (5 per email per hour, 20 per IP) and the "couldn't send" state | NOT TESTED | Read the code only (`auth/index.ts:26`, `login/page.tsx:41`) |
| A9 | /account at phone and desktop size | PASS | shots/08/account-390.png, account-1280.png |
| A10 | Change of email: link to the new inbox, heads-up to the old one, the link switches it once, used or made-up links refused, audited | PASS | acc "asked from the account: link to the NEW inbox…" |
| A11 | The change-of-email "taken" message reveals whether an email already has an account | FAIL (P3, read in code) | 08-B14 |
| A12 | /home when signed in | PASS | acc adoption test; shots/08/B1-stranger-home-390.png |
| A13 | Guest taps "+ keepsake", then signs in from the emailed link. The drawing is adopted: kept, FAMILY, `purge_after` cleared, in their own family | PASS | acc "\"+ keepsake\" as a guest → sign in…" |
| A14 | Adoption needs the upload claim (also on the checkout path `adoptPendingPlacement`) | PASS | keepsakes.int "without the claim, someone else's draft can't be kept" (re-run) |
| A15 | A guest can't file their drawing into someone else's keepsake box | **FAIL (P0)** | 08-B1 |
| A16 | Keep-choice after purchase (server): only the buyer is asked; yes keeps it, no leaves it on the fulfilment + 30d clock | PASS | keepChoice.int (3 tests, re-run) |
| A17 | Keep-choice UI after a real purchase | NOT TESTED | Needs a paid order through Stripe test checkout. That's the checkout tester's flow |

### Data rights
| # | item | result | evidence |
|---|---|---|---|
| D1 | "Download your data": a JSON file with the account, the keepsakes it controls and the home view | PASS | acc "download your data…" |
| D2 | The export includes everything held about the person | FAIL (P3, read in code) | 08-B11: help-form messages are missing |
| D3 | "Delete all your keepsakes" (two taps): the asset rows, `storage_objects` rows and **every key under `assets/<id>/` in the bucket** are gone. `ASSET_DELETED` is audited and an erasure-ledger object is written | PASS | acc "delete all your keepsakes…" |
| D4 | Close account (two taps): keepsakes, files, family and sessions gone. Login anonymised, display name cleared. /account then redirects | PASS | acc "close your account…" |
| D5 | Closing waits while an order is in flight; member closure; handover | PASS | accountClosure.int and accountHandover.int (re-run) |
| D6 | Deleting a keepsake that a paid, unmade order needs | **FAIL (P1)** | 08-B5 |
| D7 | Erasure removes **all** stored versions | FAIL (P2) | 08-B4 (tested on my own versioned bucket) |
| D8 | No picture of an erased keepsake is left behind | **FAIL (P0)** | 08-B8 |

### Retention (`/api/jobs/retention`)
| # | item | result | evidence |
|---|---|---|---|
| R1 | An unkept upload past its window is purged: original **and derivatives** leave the bucket, rows go, `PURGE_EXECUTED` is audited | PASS | ret "an unkept upload past its window…"; sj "retention: an unkept upload…" (over HTTP, run 3×) |
| R2 | A kept keepsake survives, even with a 400-day-old `fulfilled_at` | PASS | ret "a kept keepsake survives…"; sj retention test |
| R3 | An unkept upload still inside its window survives | PASS | ret, same test |
| R4 | Held while a PAID order needs it. After shipping, `purge_after` = shipped + 30 days exactly; still there at +29 days, gone at +31 | PASS | ret "held while a PAID order needs it…" |
| R5 | An unkept upload on an **abandoned checkout** (PENDING for 60 days) is purged | **FAIL (P0)** | 08-B2 |
| R6 | CSAM-blocked content is never auto-purged | PASS | moderation.int (re-run) |
| R7 | The job runs; a second run purges 0; `ok:true` | PASS | sj retention test; curl ×2 |
| R8 | Batching, backlog drain, failures reported as 500 | PASS | retentionRun.test (7 tests, re-run) |
| R9 | Sub-purges: 6-year audit trail, 2-year support messages, pending keeps, quarantine | PASS | auditRetention.int, support.int, keepsakes.int, directUpload.int (re-run) |

### Other jobs
| # | item | result | evidence |
|---|---|---|---|
| J1 | Every job (`retention`, `reapply-erasures`, `reminders`, `popularity`, `fulfilment`, `prodigi-sync`, `seed-catalogue`, `seed-mockups`) answers 401 with no secret, a wrong secret, or the secret without "Bearer". GET answers 405 | PASS | sj "jobs — refuse a missing or wrong JOBS_SECRET" (8 tests) |
| J2 | `reapply-erasures`: 400 without a valid `?since`. A keepsake brought back by a "restore" is erased again; a second run reports `alreadyGone` | PASS | sj "reapply-erasures…" |
| J3 | `reminders`: a consenting owner gets one email about the little one's birthday (28 days away). The second run sends nothing. After consent is withdrawn, nothing is sent | PASS | sj "reminders…" (email read from the log, names "Pip") |
| J4 | `popularity`: `christmasBundle` is first and `popular_rank = 1` on every run | PASS | sj "popularity…" |
| J5 | `prodigi-sync` against the sandbox: 475/475 SKUs ok, 29 products enriched, the same on both runs | PASS | `$TEMP/t8-sync-{1,2}.json`. Each run took about 122–132 s; the box allows 900 s (`scheduler/crontab:20`) |
| J6 | `fulfilment`: a clean tick, and a second tick changes nothing. Render + egress gate logic | PASS | sj "fulfilment…"; worker.int and submit.int (re-run) |
| J7 | All five jobs are scheduled on the box | PASS | `infra/aws-london/scheduler/crontab` |
| J8 | `/api/health` returns 200, `no-store`, and only `{ok, db, build}` | PASS | sj "/api/health…" |
| J9 | `/api/health/render`: 401 without the secret, otherwise a 400×400 webp | PASS | sj "/api/health/render…" |

### Content safety
| # | item | result | evidence |
|---|---|---|---|
| C1 | Production build with no screening: the upload is FLAGGED `screening-not-configured`, `CONTENT_FLAGGED` is audited, the bytes are kept, and the parent carries on (never rejected, never binned) | PASS | sj "with no real screening configured…" |
| C2 | Dev stub clears a normal upload | PASS | moderation.int "ingest runs the gate and (stub) clears…" |
| C3 | A FLAGGED or still-PENDING keepsake can't be ordered | PASS | pay "a FLAGGED or still-PENDING (unscreened) keepsake cannot be ordered" |
| C4 | A classifier hit is FLAGGED for review, never auto-rejected, and audited | PASS | moderation.int (re-run) |
| C5 | A CSAM hash match is BLOCKED and preserved. Nobody can view it, an admin included. The queue shows a count only | PASS | moderation.int; sj admin test (picture route 404 + "N items matched…") |
| C6 | When the hash check couldn't run (`hash-check-unavailable`), the item can only be removed: no look, no clear, picture route 404 | PASS | sj admin test |
| C7 | An upload whose hash check never ran because screening isn't set up (`screening-not-configured`) is treated the same way | **FAIL (P0)** | 08-B7 |
| C8 | A keepsake flagged after payment is held back from print | **FAIL (P1)** | 08-B3 |
| C9 | Real-provider config guard: eu-west-2 pin, a redirected endpoint refused, no quiet fallback to the stub | PASS | realProviders.test, rekognition.test, hardening.test (re-run; no AWS call) |
| C10 | Report/takedown holds a keepsake and tells the team | PASS | keepsakeReport.int, support.int (re-run). The UI path is the gifts tester's |
| C11 | Buying through a gift link needs CLEAR | NOT TESTED | Read in code (`authz/actions.ts:95`). The gift-link flow is tester 06's |

### Admin (/admin/review, /admin/support)
| # | item | result | evidence |
|---|---|---|---|
| M1 | A guest and a signed-in parent get a plain 404 on both pages and on the picture route | PASS | sj "a guest and a signed-in parent get a plain 404…" |
| M2 | An admin without two-step sees the set-up card on both pages: no queue, no inbox, picture route 404 | PASS | sj admin test |
| M3 | Enrolment: a 32-character key, nothing stored until a code proves it, a wrong code refused, the secret stored encrypted (`v1.` and not the key) | PASS | sj admin test |
| M4 | A new session asks for the code again ("your code, please") | PASS | sj admin test |
| M5 | "look": the view is written to the audit log; the picture is `no-store, private` | PASS | sj admin test |
| M6 | "it's fine" sets CLEAR and audits `CONTENT_REVIEWED`. "remove" erases the row and bucket and audits `ASSET_DELETED` by ADMIN | PASS | sj admin test |
| M7 | Admin flag removed: 404 again, even with the two-step cookie still set | PASS | sj admin test |
| M8 | A used code can't be replayed in another session | FAIL (P3) | 08-B9 |
| M9 | Log out clears the two-step proof | FAIL (P3) | 08-B10 |
| M10 | Support inbox lists a help message; "mark answered" sets ANSWERED | PASS | sj "support: a help message is acknowledged…" |
| M11 | Two-step attempts limited to 5 per 15 minutes (fails closed) | NOT TESTED | Read in code (`rateLimit.ts:115`) |

### Help form and data complaint
| # | item | result | evidence |
|---|---|---|---|
| S1 | Help message: a reference shown, an acknowledgement to the customer, a copy to support@ | PASS | sj "support…"; help.spec (re-run, 4 pass) |
| S2 | Complaint: type COMPLAINT, a 30-day due date, `complaint_ack_at` set, and an acknowledgement email carrying the shown reference | PASS | sj "data complaint…" |
| S3 | Complaint person-check; a bot without the solved check is refused | PASS | data-complaint.spec (re-run, 2 pass) |
| S4 | The team is told about every complaint | FAIL (P3, config) | 08-B12 |

### Accessibility and both sizes
| # | item | result | evidence |
|---|---|---|---|
| X1 | /login passes axe at 390 and 1280 | PASS | acc "/login passes axe — phone/desktop"; shots login-390/1280 |
| X2 | /account passes axe | FAIL (P3) | 08-B6 |
| X3 | Close-account sheet passes axe (scoped to the dialog) at both sizes | PASS | acc "/account screens + close-account sheet…"; shots close-account-390/1280 |
| X4 | Admin two-step card passes axe at both sizes | PASS | same test; shots admin-review-mfa-390/1280 |
| X5 | The tab bar on /account | FAIL (P3) | 08-B13 |

### Not testable locally
| # | item | why |
|---|---|---|
| N1 | Real IWF Image Intercept and real Rekognition | IWF isn't onboarded (no adapter exists), and the rules forbid AWS calls. The seams and fail-closed behaviour are covered above |
| N2 | Real email delivery (Resend) | The console mailer only, by the rules |
| N3 | The S3 lifecycle on AWS (non-current versions expire after 7 days) | It's an AWS bucket setting. I could only show what the code leaves behind (08-B4) |

## (b) Bugs

### 08-B1 · P0 (security): a guest can file a drawing into a stranger's keepsake box
This is the same bug as **tester 07's 07-B5**, found independently.

**Steps to reproduce:**
1. As a guest, upload a drawing and tap "+ keepsake". You land on `/login?next=/start-creating?resume=keep&keep=<id>`.
2. Type **someone else's** email and send.
3. That person gets a genuine sign-in email and taps it.

**Expected:** nothing is kept, because they never asked.

**Actual:** the guest's drawing is adopted into the stranger's family. It is kept, FAMILY-visible, off the retention clock, and shown on their Home (shots/08/B1-stranger-home-390.png). It shows there even while FLAGGED, because Home shows FLAGGED items to the family (`home.ts:132`). An attacker could place an unreviewed image in a family's private space, where invited relatives see it too.

**Cause:**
- `rememberKeepForEmail` stores the guest's claim against *any* email (`src/server/keepsakes.ts:79-90`).
- `finishPendingKeeps` adopts it for whoever signs in with that email, using the stored claim (`keepsakes.ts:93-101`).

**Repro test:** acc `08-B1` (marked fixme). Un-fixme'd it fails with: controller = the victim's account id.

### 08-B2 · P0 (privacy, retention): an abandoned checkout keeps the upload for ever
- `purgeExpiredAssets` skips any asset on an order in `PENDING`, `PAID` or `FULFILLING` (`src/server/retention.ts:10`).
- An order is created PENDING before the Stripe redirect.
- Nothing ever moves an unpaid order on: no `checkout.session.expired` handling in `src/app/api/webhooks/stripe`, and no expiry job.

So an unkept upload whose checkout was abandoned is **never deleted**. CLAUDE.md treats retaining a child's image beyond the schedule as a stop-and-ask matter.

**Repro test:** ret `08-B2` (skipped). Un-skipped it fails: an upload due 30 days ago, on a PENDING order from 60 days ago, is not in `purgedAssetIds`.

**Suggested fix:** treat PENDING older than the Stripe session lifetime (24 h) as not in flight, or expire such orders.

### 08-B7 · P0 (child safety): a reviewer can look at and clear a picture the CSAM hash check never ran on
`src/authz/review.ts:9-12` says a picture whose hash check couldn't run "may neither SHOW it nor CLEAR it".

But `hashCheckSkipped()` only recognises the label `hash-check-unavailable` (`review.ts:35-38`). In production with screening not set up — which is every configuration until IWF is onboarded (see the table above) — uploads are labelled `screening-not-configured` instead (`moderation/index.ts:86-88`, `profile.ts:74`). The reviewer is therefore offered "look" and "it's fine":
- The picture route returned **200** with the bytes (`sj` 08-B7 un-fixme'd: expected 404, got 200).
- "it's fine" sets CLEAR. `orders.ts:175` only needs CLEAR, so the picture is now printable without a hash check.
- The same applies to profile pictures.

**Repro test:** sj `08-B7` (marked fixme).

**Suggested fix:** treat `screening-not-configured` as hash-unchecked, or have the unscreened branch add `HASH_UNCHECKED_LABEL`. The e2e harness's `clearForTest` comment ("the test stands in for that reviewer") suggests the founder may expect clearing to be the pre-IWF workflow. That conflicts with CLAUDE.md ("every upload is hash-checked… before it can reach a print order"). **Founder decision needed.**

### 08-B8 · P0 (privacy; depends on timing): a late mockup leaves a picture of an erased keepsake in the bucket for ever
`persistDerivative` writes the bytes first and the `storage_objects` row second (`src/server/print/compositor.ts:715-723`). If a mockup render is in flight when its keepsake is erased (retention purge, "delete", account closure, review "remove"):
- the erase lists rows that don't yet include the mockup;
- the bytes then land;
- the row insert fails because the asset is gone;
- the file stays, untracked, with no lifecycle rule that ever removes it.

Seen for real: the HTTP retention test, while the range was still drawing, left **5** mockup thumbnails under the purged asset. Three were written after `PURGE_EXECUTED`, two before their row existed.

**Repro test:** ret `08-B8` (skipped). It's deterministic: erase, then `persistDerivative`, then the key is still in the bucket.

**Suggested fix:** insert the row first and write the bytes after (and remove them on failure), or re-check that the asset exists after the put. A periodic sweep for orphan objects under `assets/` would also catch these.

### 08-B5 · P1 (money): deleting a keepsake that a paid, unmade order needs breaks the order silently
Neither `deleteKeepsakeAction` nor "delete all your keepsakes" checks for in-flight orders (`src/server/assets.ts:255`). Account closure does check (`accountClosure.ts:62`). The Home delete UI gives no warning (`HomeView.tsx`).

What I observed:
1. Order PAID.
2. Keepsake deleted. No error.
3. Fulfilment tick: artwork `RENDER_FAILED` "no source asset (purged?)". The order stays **PAID**, with no message to the customer.

**Repro test:** pay `08-B5` (skipped). Un-skipped: "promise resolved instead of rejecting".

### 08-B3 · P1 (content safety, narrow window): a keepsake flagged after payment still prints
Placing an order requires CLEAR (`orders.ts:175`). After that, nothing checks `moderationStatus` again: not the worker (`fulfillment/worker.ts`), and not the submit step, which re-asserts only the LG3/LG6 egress gate (`submit.ts:331-345`).

So a keepsake reported while its order waits — for example, BLOCKED_GATE for days before go-live, then released — still renders READY and would be submitted.

**Repro test:** pay `08-B3` (skipped). Un-skipped: `expected 'READY' not to be 'READY'`.

### 08-B4 · P2 (privacy; documented trade-off, founder to confirm): erasure leaves the previous version on a versioned bucket
`deleteObjectConfirmed` deletes with no `VersionId`. On a versioned bucket that only adds a delete marker, and the HEAD that follows reads that as "gone".

I tested this on my own versioned bucket: after a keepsake was deleted, `original` was still there as a non-current version (96 bytes) under a delete marker.

Production has versioning ON (`ops/AWS-LONDON-RUNBOOK.md:118`). Non-current versions expire after 7 days (`infra/s3-lifecycle.json`), which `BACKUPS-AND-ERASURE.md` documents. CLAUDE.md says "storage (versions)", and the brief says "all versions gone".

`quarantine.ts:106-117` already deletes every version; the same approach would close this gap.

### 08-B6 · P3 (accessibility): /account red action labels fail contrast
"Delete all your keepsakes" and "Close your account" use `text-berry` (#E8786E) on white, which is **2.85:1**. WCAG AA needs 4.5:1 at 13px (`src/app/account/AccountActions.tsx:79,96`).

**Repro test:** acc `08-B6` (marked fixme, phone and desktop).

### 08-B9 · P3 (security hardening): a two-step code can be replayed
The code used to enrol was accepted again on a second device in the same 30-second window. Observed in a scratch run: "REPLAY ACCEPTED: true". `verifyTotp` keeps no record of used time-steps (`admin/totp.ts:66`).

### 08-B10 · P3 (security hardening): the two-step proof survives log out
After "log out", the browser still holds `sd_admin_mfa` (observed: `COOKIES AFTER LOGOUT: authjs.csrf-token,sd_admin_mfa,…`). Anyone who can sign in as that admin on the same device within 8 hours (for example, with access to their inbox) skips the second factor.

`account/page.tsx` `logout()` doesn't clear it.

### 08-B11 · P3 (privacy): help-form messages are missing from "download your data"
`collectAccountData` (`src/server/exportData.ts`) doesn't include `support_requests`. Those hold the person's email, name and message for 2 years.

Read in code; not exercised in a test.

### 08-B12 · P3 (config): the team isn't told about a complaint unless `PRIVACY_INBOX` is set
`rights.ts:88` sends the team notice only if `PRIVACY_INBOX` is set, with no fallback. The help form falls back to support@ (`support.ts:80`). The env template leaves `PRIVACY_INBOX` blank; the runbook sets it (`AWS-LONDON-RUNBOOK.md:206`). Worth a startup warning.

### 08-B13 · P3 (cosmetic): the /account tab bar highlights "home"
`BottomTabBar … active="Home"` on the account page (`account/page.tsx:76`). On desktop, `AppDesktopNav active="Account"` matches no item, so nothing is highlighted. See shots/08/account-390.png.

### 08-B14 · P3 (privacy, read in code): changing email reveals whether another account exists
`requestEmailChange` answers "that email is already used by another account" (`profile.ts:250-251`, `ProfileCard.tsx:85`). A signed-in person can find out whether an address is a customer. It's rate limited to 5 per hour.

## (c) What I couldn't test, and why
- **Real screening (IWF, Rekognition), real email, the AWS lifecycle:** see N1–N3. No external service is allowed apart from the Stripe test and Prodigi sandbox.
- **Keep-choice UI after a real purchase (A17):** needs a Stripe test checkout. The server side is covered.
- **Sign-in rate-limit states (A8) and the two-step attempt limit (M11):** read in code only.
- **Gift-link purchase needs CLEAR (C11):** read in code; it's tester 06's flow.
- **Dev server with the stub:** not started, to spare the shared machine's memory. Covered by moderation.int.

## Other notes for the coordinator
- **`src/server/__tests__/launchLoop.int.test.ts` fails on my database (2 tests): referral (`promoSavingPence` 0, expected 500) and codes.** This is the referral/promo area, not mine. It may relate to tester 07's 07-B6. For the checkout tester.
- **Running both sweep-08 specs back to back uses about 15 guest uploads.** The guest limit is 60 per hour per IP; repeat runs need `delete from rate_limits where key like 'upload:guest-ip:%'` (your own database only).
- **To get the email-reading tests to run,** set `E2E_SERVER_LOG` to the e2e server's stdout file. They skip without it.

## Test files added
- `e2e/sweep08.ts`: helpers (console-mail reader, bucket listing).
- `e2e/sweep-08-accounts.spec.ts`: 14 tests, plus fixme 08-B1 and 08-B6 ×2.
- `e2e/sweep-08-safety-jobs.spec.ts`: 20 tests, plus fixme 08-B7.
- `src/server/__tests__/sweep08-retention.int.test.ts`: 3 tests, plus skipped 08-B2 and 08-B8.
- `src/fulfillment/__tests__/sweep08-flagged-after-payment.int.test.ts`: 1 test, plus skipped 08-B3 and 08-B5.
