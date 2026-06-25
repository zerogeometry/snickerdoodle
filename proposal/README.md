# Snickerdoodle — Architecture Proposal (for sign-off, pre-build)

> **Status: PROPOSED — nothing has been built. Awaiting your sign-off.**
> Produced from the full requirements bundle (START-HERE, docs/00–05, the Studio spec, brand bible, roadmap, all three trust-data spines) and the three binding mockups (read at source level **and rendered in a browser**). Honours the 9 non-negotiables and your four decisions: UK/EU-first residency (covered US transfers allowed) · hybrid AI · provider-agnostic POD (default Prodigi) · responsive web + PWA.

## The documents
1. [`00-tech-stack.md`](00-tech-stack.md) — stack + reasoning, with the five explicit choices (image storage/protection, AI pipeline, POD, payments, background jobs) and supporting stack.
2. [`01-data-schema.md`](01-data-schema.md) — Postgres schema for every `docs/04` entity + the central authorization rule + the invariant→enforcement matrix.
3. [`02-folder-structure-and-CLAUDE.md`](02-folder-structure-and-CLAUDE.md) — folder structure + the proposed `CLAUDE.md` (promoted to repo root on sign-off).
4. [`03-phased-plan.md`](03-phased-plan.md) — phased plan (P0 gating spine → P1 public go-live → P2–P5) with testable acceptance criteria mapped to non-negotiables, launch gates, and success metrics.

## Stack at a glance
Next.js 15 (App Router, TS) + React, responsive web + **PWA** · **Postgres + Drizzle** · **AWS `eu-west-2` (London)** containers · **private S3 + KMS** (separate originals key, governance-mode write-once) · self-hosted in-region image worker (rembg / Real-ESRGAN / sharp-libvips) for deterministic magic edits, **contracted no-retention API for generative styling only (P3+)** · **Prodigi** behind a fulfilment adapter · **Stripe** (token only, server-side pricing) · **pg-boss** Postgres-backed jobs · Auth.js (parent accounts; magic-link + password; admin MFA) · self-hosted Fraunces/Mulish/Caveat + **Tabler Icons** sprite.

## How this was verified
Four design drafts were each stress-tested by an independent adversarial reviewer (schema-invariants skeptic, compliance-gates auditor, design-fidelity auditor, completeness critic). That caught a derailed schema agent (re-authored by hand) and **24 findings**, the material ones now folded in:

- **Authz:** family-scope is the *first* gate (cross-tenant leak prevention); `ONLY_ME` on a child asset keys on the **controller**, not the uploader; only **ACTIVE** memberships confer access; default-FAMILY is a DB column default.
- **Storage:** S3 **governance** mode (not compliance) so erasure still works; **EXIF/GPS stripped on ingest**; two signed-URL policies (interactive vs provider-ingestion).
- **Gift links:** snapshot is **frozen by-value**; deleted source → 410 (never a stale image).
- **Pricing:** the 5% join saving is enforced by **server-side provenance** on the order, not a client flag.
- **Deletion:** Postgres is the source of truth for "kept"; provider deletion is **confirmed + retried**; backups crypto-shredded / originals excluded; financial records held separately.
- **Compliance:** DSAR/s.164A backed by a real `rights_request` entity (stop-the-clock, portability export); reminder frequency cap is unit-tested; SMS=consent encoded.
- **Fidelity:** **Tabler Icons** adopted + self-hosted (the mockups use them 110×); brush **smoothness** added as a Core Studio control; a per-screen visual-diff-against-mockup gate added; account/auth/trust/admin screens flagged as "extend in the brand language + confirm".
- **AI:** **no live child image reaches any third party until P3** (gated on LG6+LG3); single-image request-builder is a unit-tested invariant; per-creation generation budget cap.

## Decisions — RESOLVED (2026-06-25)
Governing principle confirmed: **tight budget, low-ops, easy to run, UX quick & gratifying.**
1. **Self-host the Core magic edits** in-region — **CONFIRMED**, provided it stays technically/financially viable. Kept cheap via the **tiered-upscale** strategy (instant classical resample for the common case; CPU ML super-resolution only for large enlargements at launch; scale-to-zero/in-region GPU added only when heavy cases become frequent).
2. **Generative deferred to P3** — **CONFIRMED**. Zero third-party image exposure at launch.
3. **Cloud: AWS `eu-west-2` (London)** — **CONFIRMED**, using the simplest lean managed primitives to keep cost/ops low (portable if we ever want a sovereign host).
4. **Upscale must feel quick** — **CONFIRMED**; tiered strategy (above) delivers an instant common case with no standing GPU bill.
5. **ORM: Drizzle** — **CONFIRMED**. Open-source, **zero licence cost**; no financial implication.
6. **Legal placeholders** (company number, registered office, ICO number, `privacy@`) — founder to provide later; do **not** block Phase 0 build (pages built with placeholders, filled before LG4/go-live).
7. **DP-professional sign-off** of DPIA / Children's-Code assessment / transfers / DPAs — **proceed**; build the technical enforcement now, get it signed off when able (a hard gate before public go-live, not before building).

**Next:** awaiting the founder's explicit green light to start **Phase 0** (trust/data spine — authz module + tests, private storage, retention purge jobs, trust pages), in deployable increments, with no live children's data until every P0 gate is green.
