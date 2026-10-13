# 05 — Launch-loop gap fixes (from the 2026-10-12 end-to-end walkthrough)

> Built from driving the running app (local Postgres + MinIO, Stripe sandbox, Prodigi sandbox)
> as a parent on a 375px phone and as a grandparent arriving from a gift link. Each gap below was
> observed in the app, then traced to code. Fixes are architectural (they move a rule to the right
> layer), not UI patches. Non-negotiables touched are noted per item.

## What already works end to end (verified)
- Upload → "made real" range with no account wall; action-based terms acceptance recorded at ingest.
- Customize → basket → magic-link sign-up → Stripe sandbox checkout at the **server-computed** price.
- Signed webhook → PAID (address captured) → in-VPC render at **300 DPI** (auto-upscaled) → egress
  gate → **Prodigi sandbox order** (`ord_1181697`) → FULFILLING. Exactly the money loop.
- Keepsake kept at purchase, default **FAMILY**; Only me / Family / Extended persisted and audited.
- Invite: circle derived server-side from relationship; join requires proving the invited inbox;
  membership lands at the invite's circle/access; gift-link page is `noindex`, snapshot frozen by value.

## Gaps, root causes, fixes

| # | Gap (observed) | Root cause | Architectural fix | NN |
|---|---|---|---|---|
| G1 | **Gift-link purchase has no artwork.** A grandparent pays £65; the order has no `order_item_artwork`, so fulfilment skips it as "manual" (7 historic orders affected). | `GiftCheckout` seeds the *client basket* with a product key; the frozen snapshot + asset never reach the server. `placeOrder` only authorises artwork via *membership* (`assertCanViewAsset`), so a guest could never carry it anyway. | Gift-link orders are placed **server-side from the token**: `placeGiftLinkOrder(token, buyer)`. Authorisation comes from a **capability check in `src/authz`** (`canPurchaseViaGiftLink`: link active/unexpired/unrevoked, asset in the link's frozen snapshot, same family, CLEAR). `placeOrder` gains an explicit *grant* path, so the membership path stays untouched. Order is `isGift`, linked to the family, controller = the child's controlling parent. No client basket. | 1, 3, 8 |
| G2 | **Join & save loses the cart.** After verifying, grandpa lands on Home, not back at the gift checkout with 5% off. | `/join` always `redirect('/home?joined=1')`. | Join carries a validated `next` (only `/g/<token>` paths). Gift page re-quotes server-side for the signed-in viewer, showing the saving that `placeGiftLinkOrder` will apply from join provenance. | 3 |
| G3 | **Joined relative sees an empty "own" family.** Home auto-creates a family for every account and shows it, so grandpa is "owner" of an empty box and can't see the Extended keepsake. | `loadHome` → `ensureHomeFamily` unconditionally. | `resolveHomeFamily`: an explicit `?family=` (validated ACTIVE membership) → owned family with content → most recent joined family → create owned family. A small "families you're in" switcher. Home renders what authz lets that member see. | 1, 3 |
| G4 | **Gift-link invites are always "close friend".** No relationship/access choice. | Hard-coded in `CreateGiftLinkModal`. | Modal offers relationship (→ circle, derived server-side) + access level, matching the add-member modal. | 3 |
| G5 | **Under-resolution can be paid for.** A 400×300 drawing on an 11×14″ print can be ordered; it only fails at render, *after* payment. Customize page shows no print-quality signal; no one-tap fix. | DPI is assessed at render time only (`render.ts`), never at order time. | `placeOrder` runs `assessResolution` against the stored source dimensions **before** any write; BLOCK → friendly refusal, nothing charged. Customize shows ✓ / "we'll sharpen it" / ✗ and a one-tap "fit a size that prints well". | 8 (refund lever) |
| G6 | **Adding a child does nothing** ("child profiles are coming soon"). | Modal stub; the `children` service + table already exist. | `addChildAction` → `resolveChildSubject` (first name only, surname rejected with a friendly message) + optional birthday. Children shown on Home as "little ones". | 3, child-name rule |
| G7 | **Pending invites invisible; join links point at :3000; no email.** | Console-only delivery with a hard-coded host. | A `Mailer` port (`src/server/mail`) with a `console` adapter by default; magic links, invites, gift-link invites and order confirmations all go through it with `APP_URL`. The real provider stays a founder decision (D7) — swapping is one adapter. Pending invites shown in the circle. | 4 (no 3rd party until chosen) |
| G8 | **"Who's included" shows people who aren't in the family.** | Visibility modal renders placeholder avatars. | Feed real members per circle from `loadHome`. | 1 |
| G9 | **Copy/state mismatches.** Confirmation says "no payment was taken" after a real Stripe payment; login says "welcome back" to new parents; family named "Your family". | Static copy. | Confirmation reads the order's real state; neutral login heading; family name defaults sensibly + owner can rename (screened). | 5 |
| G10 | **No reminders.** "coming up" and the occasion engine aren't built. | Not implemented. | Occasions derived from children's birthdays only (no profiling); "coming up" card deep-links into Create; reminder planner is a pure function with a unit-tested frequency cap; sends only on a GRANTED `consent_record` (REMINDERS/EMAIL) via the Mailer; opt-in/out toggle logs consent changes. | PECR, no profiling |
| G11 | **Egress gate treats an unlinked DRAWING as not-a-child-image.** In SANDBOX it reached Prodigi's sandbox; in LIVE it would not require LG3. | `isChildImage = childSubjectId !== null \|\| kind === 'PHOTO'`. | **Founder decision (stop-and-ask).** Recommended: every user upload is a child image; sandbox testing uses explicitly marked brand-safe fixtures. Not changed in this pass because it alters the sandbox test workflow. | 1, 4 |
| G12 | **Compliance gates LG1–LG6 open.** | Paperwork / contracts, not code. | Unchanged — tracked in `project-office/LAUNCH-GATES.md`. | — |
| G13 | Small: add-on "card £4" vs shop card £5; Stripe account display name "Snicker"; mobile tile label truncation. | Config/data. | Price reconcile in catalogue; Stripe name is a dashboard setting (founder). | 5 |

## Status (2026-10-12)
| # | Status | Where |
|---|---|---|
| G1 | ✅ built + verified in-app (guest + joined) | `authz/actions.ts` `canPurchaseViaGiftLink`; `server/giftLinks.ts` `placeGiftLinkOrder`; `orders.ts` grant path; `g/[token]` |
| G2 | ✅ verified (join → back to gift list, 5% shown + charged) | `join/[token]` `safeNext`; gift page server quote |
| G3 | ✅ verified (relative lands in joined family; switcher) | `onboarding.ts` `resolveHomeFamily`, `listActiveFamilies` |
| G4 | ✅ (product + relationship + access; newest keepsake pre-checked) | `CreateGiftLinkModal`, `createGiftLink` validation |
| G5 | ✅ server gate + customize ✓/soft/✗ + one-tap size fix; checkout explains refusals | `orders.ts`, `customize/[productKey]` |
| G6 | ✅ (surname refused inline; birthday optional; audited) | `children.ts` `addChild`, `actions/family.ts` |
| G7 | ✅ Mailer port (console adapter); magic links + invites; `APP_URL` links; pending invites in circle. **Provider still D7.** | `server/mail` |
| G8 | ✅ real people per tier | `PerAssetVisibilityModal` |
| G9 | ✅ truthful confirmation; neutral login; rename family; neutral wording for relatives of unnamed families | |
| G10 | ✅ coming-up card; consented reminders (off by default), once per occasion, 7-day cap; daily job `POST /api/jobs/reminders` | `server/reminders` |
| G11 | ✅ closed 2026-10-13 (`abaf57c`): every upload is a child image at the POD gate; only `is_brand_safe_fixture` assets reach the sandbox | `fulfillment/gate.ts`, migration `0030` |
| G14 | ✅ founder call (2026-10-12): the **family calendar** is a per-invite choice, **pre-ticked** in both invite forms (add-member + gift-link), stored per membership (`memberships.sees_occasions`, from `invites.share_occasions`), changeable any time from Home ("family calendar shared with"), audited. Relatives with it see birthdays + "coming up" and may opt into their own reminders. DB default stays off (only an explicit choice shares). 🧑‍⚖️ note for the DPIA: a pre-ticked share of children's birthdays with parent-invited adults. | `invites.ts`, `home.ts`, `reminders/index.ts`, migration `0025` |
| G12 | ⚠ compliance (non-code) | `LAUNCH-GATES.md` |
| also | Stripe "back" returns a gift buyer to the gift list; stale catalogue/price test expectations updated | |


### Compliance pass (2026-10-13)

| # | Gap found | Status | Where |
|---|---|---|---|
| C1 | Screening passed everything when not configured; stub reachable in production | ✅ fails closed in production (FLAGGED `screening-not-configured`); `MODERATION_PROVIDER=real` refuses the stub | `moderation/` (`abaf57c`) |
| C2 | Originals not on a separate KMS key; claim-cookie secret had a guessable default | ✅ production refuses without `S3_KMS_KEY_ALIAS_ORIGINALS` / a ≥32-char `AUTH_SECRET` | `storage/objects.ts`, `uploadClaims.ts` |
| C3 | No way for a parent to remove a member, change access, cancel an invite, edit/remove a child; members couldn't leave | ✅ Family-page sheets + Home; removal kills sessions at once; all audited | `server/members.ts`, `children.ts`, `ManageMemberModal`, `ManageChildModal` (`2eca7d3`) |
| C4 | Gift-link holders got a signed URL to the ORIGINAL; items pulled back to "only me" still served/sold; no revoke button | ✅ ≤720px re-encoded preview via `/api/gift/[token]/preview`; ONLY_ME denied by the capability; "switch this link off" on Home | `giftLinks.ts`, `authz/actions.ts` |
| C5 | "Delete" only removed keepsakes; no real account closure | ✅ `closeAccount` — owned family + everything in it erased, own uploads elsewhere erased, orders anonymised, account row anonymised; waits on in-flight orders | `server/accountClosure.ts` (`fc040f8`) |
| C6 | Complaint form stored nothing | ✅ rights_requests intake, due date, ack email on receipt, audited without content, rate-limited | `server/rights.ts`, migration `0032` |
| C7 | Data export missed most categories | ✅ memberships, little ones, invites, gift lists, controlled keepsakes, saved designs, orders, consents, credits, referral codes, nudges, requests | `server/exportData.ts` |
| C8 | `fulfilled_at` never stamped; clock ran from upload, not fulfilment | ✅ SHIPPED/CANCELLED stamps it; purge date = fulfilment + 30d unless kept | `retention.ts` `startRetentionClockForOrder` |
| C9 | Guest claim cookie held 12 drafts — older basket thumbnails vanished | ✅ 140 claims, packed UUIDs | `uploadClaims.ts` (`eca2d59`) |

Still open — founder decision or infra, not code:
- **Provider deletion:** ask Prodigi to delete print files after dispatch (ops request + their retention terms) — record in the sub-processor register.
- **Backups:** originals excluded from / crypto-shredded in long-lived backups (bucket lifecycle + backup config).
- **Auto-keep at purchase (OQ-9):** today a bought drawing is filed + kept (`keepAndFileCreations`), so it never enters the 30-day clock. Keep, or keep only if the parent ticks it?
- **Child's birth year shared with the family calendar (OQ-4):** relatives with the calendar see the full date (and so age). Day + month only?
- **Append-only audit vs erasure:** audit rows hold ids + event names only (no names, no content) and survive erasure as the accountability trail — confirm with the DP professional.
- **Card / gift-wrap add-ons:** charged at checkout but not yet sent to the printer as their own lines — fix before launch or hide them.
- **Account closure closes the owner's whole family:** relatives' own uploads in that family are erased with it (the more private option) — confirm that's the behaviour you want.

Migrations: `0023` (audit events `CHILD_ADDED`, `FAMILY_RENAMED`), `0024` (`reminder_sends`).
Tests: 483 pass (incl. 9 new launch-loop integration tests, 8 planner, 4 mail, 9 authz).

## Order of work
G1 → G2 → G3 → G5 → G6 → G4 → G8 → G9 → G7 → G10. G11/G12 are flagged, not built.

## Tests required (same change)
- `src/authz/__tests__`: `canPurchaseViaGiftLink` matrix (active / revoked / expired / asset not in
  snapshot / wrong family / not CLEAR).
- Integration: gift-link order carries artwork for a **guest**; revoked link refused; an asset outside
  the snapshot refused; joined buyer gets the 5% exactly once; BLOCK-resolution line refused before any
  order row is written.
- Unit: reminder planner cap + consent gating; child-name surname rejection path.
