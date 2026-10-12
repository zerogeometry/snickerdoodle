# Review — Phase 0 (+ P1 UI prototype) — Trust/data spine & walkable front-end

> Cowork reviews Code's output against the written specs (not a pixel comparison of the running app). Cowork specifies fixes; it does not edit code.

**Phase:** P0 foundation logic + an early P1 front-end prototype
**Reviewed:** 2026-06-26
**Specs checked against:** docs/00, docs/03, docs/04, docs/05; proposal/00 + /03; START-HERE non-negotiables (NN1–NN9)
**Verification run:** `npm run typecheck` clean; `npm test` → **107/107 pass** (47 pricing, 37 visibility, 18 action checks, 5 schema).

## What this build actually is
A **front-end prototype + the load-bearing pure logic**, not a running product. Three real layers exist and are tested: the central **authz** module, the **server-side pricing** engine, and the **Drizzle schema/migration** for the trust spine. Every user flow (upload, basket, checkout, gift link, family, keepsakes) is walkable but wired to **in-memory client stores** (`src/lib/store.ts`), explicitly labelled "clearly a demo, not persistence." **No backend is wired:** no real auth, no object storage/signed URLs, no image pipeline, no Stripe, no email, no retention/purge jobs, no third-party calls of any kind (only env var: a local `DATABASE_URL`).

## ✅ Matches spec
- **Authz (NN1/2/3, docs/04).** `canViewAsset` evaluates the family-scope precondition *first* (an ACTIVE same-family membership is required for any access, including the uploader/controller), then ONLY_ME → controller alone, then tier × circle, with default-deny. ONLY_ME is keyed on the **controller**, not the raw uploader. Removal/leaving revokes access immediately by construction. Exhaustively unit-tested incl. cross-family deny and EXTENDED-denied-on-FAMILY.
- **Privacy by default at the DB layer (NN2, LG2).** `assets.visibility` is `NOT NULL DEFAULT 'FAMILY'` — no insert path can default wider. Schema comment makes the intent explicit.
- **Server-side pricing (NN3, docs/04).** Client may send only product key + qty; the server reprices from the trusted `CATALOGUE`; the 5% join saving applies **only** from server-resolved provenance (`resolveJoinProvenance()` returns null until auth lands, so it correctly never fires yet). Defensive clamps prevent negative totals or a saving exceeding goods.
- **Schema anticipates the full spine.** Tables/flags for EXIF-stripped derivatives, write-once originals, append-only audit records, `rights_request` (DSAR), and an AI sub-processor **no-training attestation** are modelled even though the backend isn't built.
- **No live child-data path exists (NN1, NN4; proposal sequencing rule).** Confirmed by scan: no storage, no AI, no third-party egress. The "no live children's data until P0 gates green / no third-party image until P3" rule is respected because none of that machinery is wired yet.
- **Design system in code references the right tokens.** Self-hosted Fraunces/Mulish/Caveat and Tabler icons are wired per the fidelity proposal (the intentional GDPR deviation from the mockups' CDN load).

## ⚠ Drift from spec / mockups
| What | Should be | Doc + section | Severity |
|---|---|---|---|
| Trackers were left at "not started" through ~14 commits of real work | Build log / decisions kept current | COWORK-PROJECT-OFFICE §1,4 | med (now corrected by this review) |
| D1–D7 still logged "open" though Code built on four directional decisions (UK/EU residency, hybrid AI, Prodigi-default POD, web+PWA) | Decisions logged + propagated into docs/ | DECISIONS.md | med — reconcile needed (see "For Simon") |
| Visual fidelity vs mockups not verified | Per-screen visual diff at ~390px + desktop | docs/00; proposal P1 criterion 15 | unverified — **out of my remit; needs Simon's eye** |

## 🚨 Non-negotiable risks
**None found in what's built.** The non-negotiables that *can* be expressed at this layer (NN1/2/3 authz, NN2 default, NN3 pricing, NN4 no third-party exposure, NN8 originals modelled write-once) are all honoured and tested. The remaining non-negotiables (real cascading deletion, no-retention AI contract, encrypted storage, accessibility, full design fidelity) live in machinery **not yet built** — so they are *unproven*, not *violated*. They must be re-reviewed as each lands.

## 🔧 Fixes for Claude Code (prioritised)
1. **Nothing blocking.** This is a clean prototype foundation.
2. When the backend lands, the first things to wire to the tested logic: real session/membership resolution feeding `ViewerContext`, the signed-URL minter gated behind `assertCanViewAsset`, and `resolveJoinProvenance()` against real invite/membership data.
3. Keep `src/lib/store.ts` strictly demo-only; ensure no flow silently persists a real child image before P0 storage + purge jobs exist.

## ❓ For Simon
- **Reconcile the decisions log.** You gave Code four directional calls; D1–D7 in `DECISIONS.md` were never formally logged. Confirm the specifics (storage provider, AI generative provider, payments = Stripe, POD = Prodigi, email/SMS, background jobs = pg-boss) so I can log them and propagate into `docs/`. Until then they're "directionally set, not finalised."
- **Visual fidelity is yours to judge.** I can't pixel-compare a running app to the mockups. Walk the screens at phone + desktop widths against `/mockups` before P1 is called done.
- **Sign-off status.** `proposal/` is still marked "PROPOSED — pending founder sign-off." If you're happy with the stack as built, say so and I'll mark it accepted in the log.
