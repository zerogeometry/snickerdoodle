# 00 — Tech Stack & Infrastructure

> **Status: PROPOSED — pending founder sign-off. Not yet built.**
> Every choice is justified against a non-negotiable (NN1–NN9, `START-HERE.md`) and/or a launch gate (`docs/05`). Built on your four decisions: **UK/EU-first residency (covered US transfers allowed)**, **hybrid AI**, **provider-agnostic POD (default Prodigi)**, **responsive web + PWA**.

## Cross-cutting principles
- **Lean & low-ops by default.** Solo operator on a tight budget who needs things *easy*. Favour the simplest managed primitives, scale-to-zero where possible, and **no standing GPU** until volume justifies it. Keep the monthly bill small and visible. UX must still feel **quick and gratifying** (esp. Studio upscale).
- **UK/EU-first residency** is the default for every store, queue, log and compute that can touch a child's image or identifier. A US processor is allowed only via a documented route (UK–US Data Bridge for a certified recipient, or IDTA/UK Addendum + a "not materially lower" transfer risk assessment), and is **never** the default for children's images.
- **The central authorization module is the only gate to any asset.** No signed URL, read, or mutation is minted without it. *(NN1, NN3; docs/04)*
- **Originals are sacred and immutable to edits** (NN8); derivatives/creations are separate, disposable objects.
- **Deletion is real and cascading** across DB + object storage + provider + backups. *(docs/05 §7)*

---

## 0. Hosting, runtime, region

| Choice | Decision | Reasoning |
|---|---|---|
| **Framework** | **Next.js 15 (App Router) + TypeScript + React 19**, as a responsive web app + installable **PWA**. | Per decision. Server Components/Actions keep authz + pricing server-side and off the client (NN3). PWA gives the mobile-first, link-openable experience grandparents need (NN6). |
| **Hosting / region** | Containers in **AWS `eu-west-2` (London)** (ECS Fargate / App Runner). EU (`eu-west-1` Dublin) as DR. **No global edge runtime** for any route touching child data. | London-region default is the cleanest answer to the DUAA transfer test and Children's-Code "high privacy by default". Containers (not opaque edge) give control over where bytes and logs live. *(NN1; LG3; spine-1 §8/§12)* |
| **One account, one primary region** | Postgres, object storage, KMS, queue, sessions, audit log, observability, email all in `eu-west-2`. | Minimising regions/providers shrinks the sub-processor register and the transfer-assessment surface. |

---

## 1. Storing & protecting children's images  *(the highest-sensitivity data)*

- **Storage:** S3-compatible **private** object storage, AWS S3 `eu-west-2`. **Block Public Access ON** at account + bucket level, enforced by an IaC policy check that fails any deploy that would open a bucket. *(NN1/NN2; spine-1 §12)*
- **Encryption:** TLS 1.2+ + HSTS in transit; **SSE-KMS with a customer-managed key** at rest, with **separate keys for originals vs derivatives** (tightest policy + independent rotation on originals). No human IAM principal has standing decrypt rights. *(spine-1 §12)*
- **Access only via authz + short-lived signed URLs.** Every read: request → API route → **central authz check** → only on allow, mint a **short-lived pre-signed GET URL**. The minter has no business logic and is unreachable except via the authz allow-path. **Two distinct URL policies:** *(verifier fix)*
  - **interactive read** — very short TTL (~5 min), single-use intent;
  - **provider-ingestion** — minimal TTL sufficient for the POD pull, single-fetch, **audit-logged**, and revoked once `submitOrder` confirms ingestion (so a child image is never reachable on a replayable URL outside the authz module).
- **Three object classes** (bucket/prefix + lifecycle): `originals/` (write-once, **governance-mode** immutability so erasure still works — *never compliance mode*); `derivatives/` (disposable, regenerable); `creations/` (Studio layer binaries; project graph in Postgres). An original delete cascades to its derivatives/creations; the reverse never touches the original. *(NN8; verifier fix)*
- **EXIF/GPS stripped on ingest** — a phone photo of a drawing carries home coordinates; strip GPS/device/timestamp before any processing or storage of derivatives. *(DPIA minimisation; verifier fix)*
- **Deletion** is hard, cascading, and version-removing: user-initiated (one tap, Children's-Code requirement) and the scheduled retention purge (§5). **Postgres is the source of truth** for "kept" state; the purge job JOINs the DB (S3 tags are only a defence-in-depth hint). Provider copies deleted with **confirmation + retry** (`order_fulfilment.asset_deletion_requested_at`/`_confirmed_at`). Backups: originals **crypto-shredded / excluded from long-lived backups**; financial records held separately so a 6-year tax record never re-introduces an erased image. *(docs/05 §7; verifier fix)*

## 2. AI "magic edits" — HYBRID

- **Self-hosted, in-region (no third party ever sees the image)** — an isolated **image-worker** service in `eu-west-2` runs all deterministic ops: **background removal** (`rembg`/U²-Net), **brighten/tidy/auto-enhance, brightness/contrast/saturation/warmth, recolour, preset filters, deskew/auto-crop, thumbnails/DPI renditions/bleed composite** (`sharp`/libvips/OpenCV), and **upscale-to-print**. Runs async as jobs so **the canvas stays interactive**; the original is never overwritten. The image-worker shares the app's container infra (no separate GPU at launch). *(NN4; studio §4/§8/§9/§13/§15/§19a)*
- **Upscale strategy — tiered, so the common case is instant on a tight budget** *(CONFIRMED — budget/UX)*: most "upscale to print quality" needs are modest enlargements where a **classical high-quality resample** (libvips Lanczos + light denoise/sharpen) is **instant and good enough** — that's the gratifying default. **ML super-resolution (Real-ESRGAN)** is reserved for *large* enlargement factors where classical isn't enough. At launch (tiny volume) ML runs on **CPU** — slower (tens of seconds, async, canvas stays interactive) but **zero standing cost and fully in-VPC**. A **scale-to-zero / in-region GPU** is added only when those heavy cases become frequent; at that threshold we choose, on real numbers, between an in-region GPU box (no new processor) or an EU no-retention serverless-GPU **processor** running our own model under a DPA (cheap-per-use, easy, but a sub-processor + transfer note). *(reconciles "self-hosted + tight budget + easy + quick"; verifier/founder input)*
  - **CONFIRMED:** self-host the Core edits in-region (no third party sees the image) — *provided it stays technically and financially viable on a tight budget*. The tiered-upscale strategy above is what keeps it cheap and easy; if a self-hosted edit's quality ever disappoints in testing, that single op moves to a contracted no-retention API via a one-line adapter swap.
- **Contracted no-retention API — generative styling ONLY** ("make it watercolour/storybook", generated backgrounds, describe-an-edit, photo-restore — all `[Enhanced]`/`[Later]`). Requirements (hard gate): **zero-data-retention mode + Article 28 DPA with explicit no-retention/no-training term**; **in-region/UK-adequate endpoint preferred**, US only via Data Bridge/IDTA + TRA; a **request-builder that sends exactly one image + the minimal instruction** (no name/DOB/family/account/other assets) — and this single-image rule is a **unit-tested invariant**. Result is a new derivative; original preserved. **A per-creation/per-account generation budget cap** keeps cosmetic generative spend cheap (matches the brand bible's unit-economics rule). *(NN4; docs/05 §5; spine-1 §8; verifier fixes)*
- **Sequencing (CONFIRMED):** no live image is sent to any third party until **Phase 3** (storybook), which is gated on LG6 (no-retention contract) + LG3 (transfer route). **Phase 1 go-live has zero third-party image exposure.**

## 3. Print-on-demand — provider-agnostic adapter (default Prodigi)

A single `FulfilmentProvider` port; Prodigi (UK, white-label) is the default adapter:
- `getPrintSpec(variant)` → required DPI / print area / bleed / format → feeds the Studio's print-readiness gate.
- `mapVariant(variant)` → our catalogue → provider SKU/attributes (the per-provider mapping lives here).
- `submitOrder(order, printAssets[])` → submits with **scoped, audit-logged signed URLs** for the print-ready derivatives only.
- `onWebhook(payload)` → signature-verified status ingest → internal `fulfilment_status`.
- `requestAssetDeletion(providerOrderId)` → instruct provider to delete its held image copies after fulfilment+window, **tracked to confirmation with retry**.
Prodigi default because UK-based (print assets stay in-region) with a broad range; the adapter makes a swap one implementation, not a rewrite. *(LG3; spine-1 §8)*

## 4. Payments — Stripe

Stripe **Payment Element** (themed to brand tokens — NN9), **PaymentIntents** (SCA/3DS handled), **guest + member** checkout, **all totals computed server-side** (client never supplies an amount), the **5% join discount applied only via the server-derived join path** (provenance modelled on the order — see schema), **Stripe Tax** for UK VAT, **signature-verified, idempotent webhooks** driving order state (order fulfilled only on a verified `payment_intent.succeeded`, never a client redirect). **Card data never touches our servers — token only.** Article 28 DPA. *(NN3; docs/04 pricing; spine-1 §3/§12)*

## 5. Background jobs

**Postgres-backed durable queue + cron — primary choice `pg-boss`** (BullMQ on in-region Redis if we later need throughput).
- **In-region by construction** (jobs + payloads live in our UK/EU Postgres — no extra processor/region/DPA). *(NN1; LG3)*
- **Transactional reliability** — the legally load-bearing retention purge is enqueued in the same transaction as the state change, so a job can't be lost between commit and queue. *(spine-1 §7 — "the promise is only real if the code deletes")*

Workloads: **(1) scheduled retention/deletion purges** (daily; DB-driven; cascade DB→S3→provider→backups; idempotent; audited); **(2) async AI processing** (keeps the canvas interactive; GPU pool for upscale/bg-removal); **(3) order→fulfilment** (Stripe-success-triggered; retries); **(4) email-verification sends**; **(5) occasion/reminder engine** (consent + frequency cap checked before every send; SMS=consent, email soft-opt-in only where lawful — the cap is unit-tested). *(verifier fixes)*

---

## 6. Supporting stack

| Area | Choice | Reasoning |
|---|---|---|
| **ORM / DB** | **Drizzle + PostgreSQL** (eu-west-2). | Invariants lean on DB-level guarantees (DEFAULT/CHECK/partial-unique/append-only triggers) — Drizzle keeps that SQL explicit and in-repo. Prisma acceptable if you prefer its DX. |
| **Central authz** | A single framework-agnostic module `src/authz` — `can()/assertCan()` resolving family-scope × tier × circle × access × status. Every read/mint/mutation calls it. Exhaustively unit-tested (a launch gate). | The literal docs/04 engineering invariant; the enforcement point for NN1/NN2/NN3. |
| **Auth** | **Parent accounts only** (children never log in). **Auth.js self-hosted**, sessions in our Postgres. Email+password (Argon2id) **and** passwordless magic-link. Invite flow: parent invite → email verify → membership at the **pre-set** circle/access (no self-join). **Admin MFA mandatory (TOTP).** Sessions invalidated on member removal. | In-region identity; the exact docs/04 invite lifecycle; spine-1 §12 controls. |
| **Email / SMS** | UK/EU-region transactional provider + Article 28 DPA (e.g. AWS SES eu-west-1/2 or a UK/EU ESP); SMS provider with UK reach + EU residency. Marketing/reminders gated on consent + caps; transactional on contract basis. | Keeps recipient data + reminder content in-region; PECR. |
| **Icons** | **Tabler Icons v3.31.0** — the exact set the mockups use (110×) — **self-hosted** as an SVG sprite (not the CDN), via an `Icon` primitive; version pinned. Substituting the set is a stop-and-ask. | Design fidelity (NN9, docs/00); same GDPR no-third-party-CDN logic as fonts. *(verifier fix)* |
| **Fonts** | **Fraunces / Mulish / Caveat self-hosted** (matching the exact axes the mockups request: Fraunces 500/600 + italic, Mulish 400–800, Caveat 600). Recorded as an **intentional GDPR deviation** from the mockups' CDN load that preserves identical rendering. | GDPR (no third-party font CDN) + no FOUT; fidelity preserved. *(verifier fix)* |
| **Observability** | In-region structured logging/metrics/tracing (OTel → EU backend or CloudWatch eu-west-2). **Logs hold asset *ids*, never image bytes or unnecessary identifiers**; 30–90-day rolling retention. A **separate append-only audit log** is the compliance evidence. | Logs are personal data too; spine-1 §7/§12; docs/05 audit. |
| **Secrets** | AWS Secrets Manager / SSM (eu-west-2), KMS-encrypted, injected via task role, rotated. Never in source or the client bundle. | spine-1 §12. |
| **Rate-limiting / abuse** | App-level limits on auth, upload, signed-URL mint, gift-link access, and the s.164A/contact forms; upload MIME/size/image validation + per-account quotas; gift-link tokens unguessable + noindex + revocable + expirable. | Protects the sensitive perimeters; DPIA mitigations (spine-1 §6). |

---

## 7. Launch-gate dependencies created by this stack
Article 28 DPAs (storage, AI-generative, POD, payments, email/SMS); confirmed **no-retention/no-training** generative contract + ZDR mode (**LG6**); documented transfer route for any US processor (**LG3**); retention/deletion purge jobs operational + tested; one-tap self-service delete via the authz module; s.164A complaint form live (**LG4**); ICO registration paid (**LG5**); DPIA + Children's Code assessment signed off (**LG1/LG2**).
