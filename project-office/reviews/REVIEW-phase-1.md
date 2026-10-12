# Review — Phase 1 — Backend landing: storage, moderation, fulfilment, payments

**Phase:** P1 — real backend coming online on the P0 spine
**Reviewed:** 2026-06-30 (≈50 commits since REVIEW-phase-0 at f14ddee; HEAD ffa4d40)
**Specs checked against:** docs/00, docs/03, docs/04, docs/05; proposal/00–04; D8 + D9; START-HERE NN1–NN9
**Verification run:** `npm run typecheck` clean; **198/198 unit tests pass** (15 files). The ~17 `*.int.test.ts` integration suites require a live Postgres and were **not run here** — Code should confirm they pass in CI.

## What shipped since last review
The prototype has grown a real backend. New since f14ddee: **Auth.js** adapter + sessions; **S3 storage** layer (private, presigned, EXIF strip); **content moderation** (D8) with providers; **fulfilment** worker + egress gate; **Stripe** payments + signed/idempotent webhook; **Prodigi** POD adapter + catalogue sync; in-VPC **print compositor**; a full `src/server/*` services layer; **real data-rights** delete/download (NN8); Family/Home wired to the DB; **14 migrations**; **36 test files**; Playwright e2e wow-flow.

## ✅ Matches spec — and enforces the non-negotiables at real chokepoints
- **POD egress gate (`src/fulfillment/gate.ts`) — exemplary.** A server-side, asset-aware predicate (explicitly *not* an env flag), defaulting to **SANDBOX** (a child image can never be sent even to the sandbox). LIVE child-image egress requires **both** LG3 transfer-assessment sign-off **and** a POD sub-processor with a DPA + transfer mechanism **recorded in the register and checked against the DB**. A `PHOTO` is treated conservatively as a child image even when unlinked. Enforced in `worker.ts` and `prodigi/client.ts`, and unit-tested (10 tests) as a launch gate. This *is* NN1/NN4 made real. (docs/05; proposal §7)
- **Moderation (`src/server/moderation/index.ts`) — implements D8 precisely.** CSAM hash-check runs **first** → BLOCKED (preserve, never view/redistribute, audited as the runbook trigger); the classifier only **FLAGS** (never auto-rejects a child's drawing); a malformed/unknown verdict **fails safe to FLAGGED**, never silently CLEAR. Wired at **ingest** (every upload), and **orders are gated on `moderationStatus === 'CLEAR'`** (`orders.ts:85`) so nothing un-cleared can reach print. (D8; CLAUDE.md content-safety)
- **Payments (`src/payments/webhook.ts`).** Signature verified via `constructEvent` (local HMAC, stale-timestamp reject); **idempotent** via `webhook_events` (replayed id = no-op, `onConflictDoNothing`); an order is marked paid **only** on a verified `checkout.session.completed`. Server-side pricing remains the only quote authority. (NN3; spine §3/§12)
- **Storage.** No `public-read`/ACL/`makePublic` anywhere in `src` (scanned — clean); presigned GETs with a short TTL (120s default); **EXIF strip** wired at ingest and into magic/print/compositor derivatives. (NN1; proposal §1)
- **NN8 data rights.** Real on-demand delete + download wired to the controls (commits `f2dce55`, `f0…`); deletion is the cascading job, not a stub.
- **Coverage deepened.** Authz now 69 tests (was 55), pricing 48, gate 10, webhook 4, plus integration suites for assets/children/deletion/gift-links/invites/keepsakes/moderation/orders/retention.

## ⚠ Drift / watch-outs
| What | Should be | Where | Severity |
|---|---|---|---|
| `gate.ts` comment says "Order submission itself is **Phase 3** and not built yet", but proposal/roadmap put Prodigi fulfilment in **P1** | One phase vocabulary across code + trackers | gate.ts vs proposal/03 | low — reconcile naming so trackers and code agree |
| A **real child-data path now exists in code** (upload → S3). Fine for dev/staging with brand-safe seed, but it means the **P0 compliance gates are now the critical path** to any live use | Gates closed before any real child image is processed live | program-level | **med — flag, not a code defect** (the egress gate + SANDBOX default already prevent a live child image reaching Prodigi pre-gates) |
| Integration suites not runnable here (no Postgres) | Green in CI | — | info — unverified by Cowork |
| Consent at upload reworked to "contract basis, no tickbox" | Confirm `consent_record` still cleanly separates contract-terms acceptance from **marketing/PECR** consent | guestUpload/ingest | low — DP-professional detail |

## 🚨 Non-negotiable risks
**None found.** Every non-negotiable that this layer can express is not just respected but **enforced at a tested chokepoint** (egress gate, moderation-before-print, signed/idempotent webhook, private storage, EXIF strip, cascading delete). The standout is that child-image POD egress is gated on the *actual* launch gates via the sub-processor register, not a flag.

## 🔧 Fixes for Claude Code (prioritised)
1. **Reconcile phase vocabulary** — align the code's "Phase 3" comments with the proposal's P0–P5 so the build log and code agree on what's P1 vs later. (docs only.)
2. **Confirm CI runs the `*.int.test.ts` suites** and they're green (Cowork can't run them without a DB).
3. Confirm `consent_record` distinguishes contract-terms acceptance from marketing consent (for the DP review).

## ❓ For Simon
- **The build is racing ahead of the paperwork.** Engineering now enforces the gates technically (egress gate, moderation), which is great — but **no real children's images may be processed live until the P0 compliance gates close** (DPIA, Children's-Code, transfers, DPAs, ICO). Worth deciding when to start the DP-professional + IP-lawyer engagements, since they're now the long pole, not the code.
- **Design fidelity** on the many new screens (customize, share-wish, join, position, full-catalogue modal) still needs your eye — Cowork can't pixel-judge.
