# Build Log — Snickerdoodle

> Maintained by Cowork. The at-a-glance "where are we." Phases follow Claude Code's own plan — rename/renumber to match once Code proposes it.

**Current status:** _Real backend landing — auth, S3 storage, moderation, fulfilment egress gate, Stripe, Prodigi, real data-rights. Non-negotiables enforced at tested chokepoints. Compliance gates now the critical path._
**Current phase:** P1 (build well advanced; live use blocked on P0 compliance gates, not code)
**Last updated:** 2026-06-30 (REVIEW-phase-1; HEAD ffa4d40, ~50 commits since last review)

---

## Phase status

| Phase | Goal | Status | Shipped | Notes |
|---|---|---|---|---|
| 0 | Architecture & plan signed off | ◐ in progress | proposal/00–03 + CLAUDE.md | Stack proposed & built against; still marked "PROPOSED — pending founder sign-off". Four directional decisions made (UK/EU residency, hybrid AI, Prodigi-default POD, web+PWA) |
| 0 | Trust/data **spine — logic layer** | ◐ in progress | authz module (+tests), Drizzle schema/migration, server-side pricing (+tests) | Pure logic + schema only. Storage, signed URLs, purge jobs, audit/DSAR backend, auth = **not built** |
| 1 | **UI prototype** — marketing, Studio shell, catalogue, checkout, gift link, family home, trust pages | ◐ in progress | full screen set in `src/app` | Walkable end-to-end on **in-memory client stores** (`src/lib/store.ts`) — demo, not persistence |
| 1+ | Real backend: auth, encrypted storage, image pipeline, Stripe, Prodigi, retention, data-rights | ◐ in progress | Auth.js + sessions; S3 storage (private, presigned, EXIF strip); fulfilment worker + **egress gate**; Stripe + signed/idempotent webhook; Prodigi adapter + sync; print compositor; real NN8 delete/download; 14 migrations; 36 test files | Non-negotiables enforced at tested chokepoints. Email + retention purge still to confirm. Int suites need CI/DB |
| 0 | **Content safety (decision D8)** — moderation gate + report/takedown | ◐ in progress | Moderation module (CSAM-hash-first → BLOCKED; classifier FLAGS; fail-safe); wired at ingest; **orders gated on moderationStatus=CLEAR** | IWF **Image Intercept** provider + report/takedown UX still to wire to the real classifier/runbook |
| — | **Verification (2026-06-30):** typecheck clean; **198/198 unit tests pass**; ~17 integration suites present (need a live DB — confirm green in CI) | | | |

Status key: ☐ not started · ◐ in progress · ☑ done · ⚠ blocked

**Verification (2026-06-26):** `typecheck` clean; `npm test` 107/107 pass (authz 55, pricing 47, schema 5).

## Open questions for Simon
- **Stack accepted** ✓ (2026-06-26). Remaining provider picks still open: generative-AI provider (D3/LG6), email/SMS (D7), P3 book printer (D4).
- **Content-safety (D8) decided** ✓ — now needs two external sign-offs: **IP/brand lawyer** (copyright posture S3-b) and the **DP professional** (OSA scope wording + CSAM reporting workflow + human-review-of-children's-images assessment).
- Visual fidelity vs `/mockups` — Simon will advise when ready (Cowork can't pixel-judge).

## Recently shipped (newest first)
- Preview programme Tiers A–D (all four): (A) the positioner is a direct-manipulation editor
  (drag/pinch/double-tap with 60fps live transforms committing through the shared print geometry;
  snapping + guides; undo/redo; full keyboard equivalents per WCAG 2.5.1/2.5.7; actionable DPI
  fixes; design↔product view toggle); (B) the compositor gained self-calibrating fabric fx
  (displacement + shading from the blank photo's own luminance — cushion creases/blanket fleece
  read through the art; mean-relative, so untextured regions are identity ops); (C) client-side
  3D "spin it around" for mug + framed print (parametric models built in code — no licence risk;
  drawing painted onto a CanvasTexture through the shared geometry; lazy three.js); (D) "see it on
  your wall" for framed prints — a true-scale room composite (100% of devices, canvas, side-table
  scale anchor) + wall AR via <model-viewer> (client-built GLB from the same parametric frame,
  ar-modes "webxr quick-look" only — Scene Viewer dropped for privacy; USDZ auto-generated
  on-device). ⚠ AR itself needs on-device sign-off (founder's phone). three.js + model-viewer
  are the only new deps, both lazy-loaded, in-VPC by construction
- Prodigi ORDER SUBMISSION — the last leg of the money loop: paid → rendered in-VPC → egress gate
  re-asserted per asset at the URL-minting moment (deny-by-default on unresolvable assets) →
  submitted from the FROZEN sold-spec (idempotencyKey = order id; verified live against the real
  sandbox: ord_… returned, synced InProgress) → polled to SHIPPED with tracking stored. Stripe now
  collects the GB delivery address (webhook capture + submit-time session backfill). Nothing stalls
  silently: stale-claim recovery sweep, BLOCKED_GATE release sweep, bounded backoff retries,
  provider-text URL redaction, SANDBOX/LIVE split-brain guard, structured console.error surfacing.
  20 adversarial-review findings fixed in-increment. 357 tests green ×3.
- Family set ("dress the whole family"): set builder from Start Creating; server-side 5% family-set
  saving (3+ garments, derived from line keys — no client flag) through quote → order → Stripe;
  order lines now FREEZE the sold spec (sku/attributes/provider SKU+config) so re-seeds can't change
  a paid order; adult tee → ONE unisex Stanley/Stella Sparker 2.0 SKU (Bella+Canvas dropped — not
  organic); white bodysuit → GB long-sleeve RS-4411 (white RS-4424 was CA/AU-fulfilled: residency +
  delivery); niche-band reprice (kids tee 24.95, adult 31.95, mug 17.95, storybook A5 25.95) per
  project-office/briefs/PRICING-elasticity-premium.md
- Catalogue: Most Popular + full-catalogue modal; in-VPC photoreal product-mockup compositor
- Prodigi POD adapter wired (typed client, real-SKU catalogue, live-validated sync) + fulfilment worker with egress gate
- Stripe (test) + signed/idempotent webhook; atomic paid-flip + fulfilment enqueue
- Content moderation (D8) wired at ingest; orders gated on CLEAR; moderation fail-safe
- Real on-demand delete + download (NN8); Family/Home wired to real DB; child-subject filing
- Auth.js + sessions; storage layer (private S3, presigned, EXIF strip); Share a Wish; Edit-in-Studio
- Server-side pricing authority + local Postgres spine
- Studio made interactive (keep, basket, magic edits, DPI badge)
- Missing pages built; app nav reconciled; modals + cookie banner wired
- Upload / basket / checkout / gift-link wired via client store
- Public trust pages (privacy, family promise, cookies, s.164A complaint)
- Studio MVP shell; visibility / add-member / create-gift-link modals
- Phase-0 trust-spine schema + migration; central authz module + tests
- Architecture proposal, CLAUDE.md, scaffolding
