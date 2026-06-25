# 02 — Folder Structure & CLAUDE.md

> **Status: PROPOSED — pending founder sign-off.** On sign-off, the CLAUDE.md below is promoted to the repo root. Nothing here is built yet.

## (a) Folder structure — Next.js (App Router, TS) responsive web + PWA

The four user-facing **surfaces** (marketing / app / gift-link / studio) split at the routing layer; all trust-critical logic — authorization, pricing, children's-image handling, signed-URL minting — lives behind a server-only domain/services boundary that routes are thin wrappers around. *"The client never owns visibility, price, or ownership"* is encoded structurally.

```
snickerdoodle/
├─ CLAUDE.md                          # build-agent constitution (part b) — promoted to root on sign-off
├─ next.config.ts                     # CSP, noindex defaults, image domains (UK/EU only)
├─ middleware.ts                      # session, surface routing, noindex on app/gift/checkout
├─ public/
│  ├─ manifest.webmanifest            # PWA: installable, brand icons, theme #FBF5E9
│  ├─ fonts/                          # self-hosted Fraunces / Mulish / Caveat (exact axes)
│  ├─ icons/tabler-sprite.svg         # self-hosted Tabler Icons v3.31.0 (the set the mockups use)
│  └─ brand/                          # placeholder doodles (swapped for real artwork later)
├─ src/
│  ├─ app/                            # ── ROUTING ONLY (thin; delegates to /domain & /server) ──
│  │  ├─ layout.tsx  globals.css      # brand tokens as CSS vars; prefers-reduced-motion base
│  │  ├─ manifest.ts robots.ts sitemap.ts   # marketing indexable; app/gift/checkout noindex
│  │  ├─ (marketing)/                 # logged-out: landing, how-it-works, gifts, our-story
│  │  │  └─ trust/                    #   privacy · family-promise · cookies · data-complaint (s.164A)
│  │  ├─ start-creating/              # the "wow" — upload → range, NO account wall (anon session)
│  │  ├─ (app)/                       # logged-in hub; mobile bottom tab bar Home·Create·Family·Orders
│  │  │  ├─ home/ create/ catalogue/ family/ orders/
│  │  │  └─ account/                  # data-rights self-service (see/download/delete) + consent prefs
│  │  ├─ studio/[creationId]/         # full-bleed; mounts <StudioShell> client island
│  │  ├─ g/[token]/                   # GIFT-LINK recipient view; minimal chrome; noindex; join-or-guest
│  │  ├─ checkout/                    # shared member + guest checkout
│  │  ├─ api/                         # thin route handlers
│  │  │  ├─ assets/upload-url  assets/[id]/url   # mint signed URLs AFTER authz check
│  │  │  ├─ pricing/quote                        # server-authoritative totals
│  │  │  └─ webhooks/stripe  webhooks/prodigi     # signature-verified, idempotent
│  │  ├─ (auth)/                      # sign-in / verify-email / set-password
│  │  └─ admin/                       # MFA-gated ops: fulfilment, DSAR handling, breach log
│  │
│  ├─ authz/                          # ★ CENTRAL AUTHORIZATION MODULE (its own tested home) ★
│  │  ├─ index.ts (can/assertCan)  policy.ts  visibility.ts  controller.ts  actors.ts
│  │  └─ __tests__/                   # EXHAUSTIVE matrix: tier × circle × access × actor × family-scope
│  ├─ domain/                         # framework-free domain logic
│  │  ├─ family/ assets/ creations/ catalogue/ print/
│  │  ├─ pricing/                     # ★ server totals, join-saving provenance, add-ons (unit-tested) ★
│  │  ├─ gifting/                     # GiftLink frozen snapshot; token rules
│  │  ├─ orders/ occasions/ consent/  # consent model + PECR channel rules
│  ├─ server/                         # server-only orchestration (import 'server-only')
│  │  ├─ services/                    # asset-service (★ children's-image handling) · creation · family ·
│  │  │                               #   invite · membership · gift-link · order · pricing · occasion ·
│  │  │                               #   reminder · rights-service (DSAR export + cascading erasure)
│  │  ├─ images/                      # storage · signed-url (authz-gated) · exif-strip ·
│  │  │  ├─ pipeline/                 #   SELF-HOSTED in-region: bg-removal · upscale-print · brighten-tidy · filters
│  │  │  ├─ generative/style-adapter  #   CONTRACTED no-retention API; single image only; budget cap
│  │  │  └─ derivatives.ts            #   original preserved untouched; derivatives separate
│  │  ├─ fulfilment/adapter.ts + prodigi/    # provider-agnostic; default Prodigi
│  │  ├─ payments/stripe.ts           # PaymentIntents; token only
│  │  ├─ email/  webhooks/  audit/    # transactional+consented mail · sig-verified handlers · append-only audit
│  │  └─ session.ts  auth.ts          # verify ≠ authorisation; session invalidation on removal
│  ├─ db/  schema.ts migrations/ client.ts seed.ts   # Postgres (eu-west-2); brand-safe seed only
│  ├─ jobs/  queue.ts + workers/      # retention-purge ★ · image-magic-edit · upscale · occasion-reminders ·
│  │                                  #   account-deletion (cascade incl. provider + backups) · fulfilment-dispatch
│  ├─ ui/                             # ── BRAND DESIGN SYSTEM (build it; never library defaults) ──
│  │  ├─ tokens.ts                    # exact tokens oat #FBF5E9 … honey-band #FBEEDB
│  │  ├─ primitives/  Button Chip Modal BottomSheet Slider Toggle Skeleton TrustLine CaveatNote Icon
│  │  ├─ components/  ProductCard KeepsakeTile MemberAvatar(tier) MemberCard OccasionRow CartLineItem
│  │  │               AddOnCard GiftLinkBlock VisibilitySelector(3-tier) FamilyCircle MemberSelector
│  │  │               ProductMorph  states/{Empty,Error,Success}
│  │  ├─ modals/  PerAssetVisibilityModal  AddFamilyMemberModal  CreateGiftLinkModal
│  │  └─ studio/  CanvasStage ToolRail ToolBar LayerRow LayerPanel BrushHUD(size+colour)
│  │              ToolOptionSheet(★ incl. smoothness/stabilisation) MagicEditChip DpiBadge
│  │              ColourPicker StickerTray TextTool
│  ├─ studio/                         # heavy CLIENT engine
│  │  ├─ StudioShell.tsx  engine/ (render, layers, history, autosave)
│  │  ├─ input/                       # ★ §19a finger+stylus: pressure→size/opacity, palm rejection,
│  │  │                               #   stylus-only mode, 2/3-finger undo/redo, pinch/rotate ★
│  │  ├─ tools/  magic-edits/  state/ # original kept; edits reversible/non-destructive
│  ├─ lib/  types/
└─ tests/  unit/ (authz matrix, pricing, visibility, DPI, gift-link, single-image, EXIF-strip)
          integration/ (services+db, webhook sig+idempotency, signed-URL authz, retention purge)
          e2e/ (wow flow; gift loop; invite→verify→join; guest checkout; studio finger+stylus;
                low-res→DPI warning→upscale resolves)  +  visual/ (screenshot diff vs /mockups)
```

**Children's-image handling is one server-only path:** uploads PUT to a private UK/EU bucket via a server-minted URL → all reads via `api/assets/[id]/url` which calls `authz/` **before** minting a short-lived GET URL → EXIF stripped on ingest → deterministic edits run self-hosted in `images/pipeline/` (no third party sees the image) → only generative styling routes one image to `images/generative/`. Deletion is real + cascading via `rights-service` + `jobs/workers/{account-deletion,retention-purge}`.

**Screens not in the mockups** (account, auth, trust, admin) are explicitly marked *"extend in the brand visual language and confirm — reuse `src/ui` primitives; no default Auth.js/admin-template look."* *(docs/00; verifier fix)*

---

## (b) Proposed CLAUDE.md

```markdown
# CLAUDE.md — Snickerdoodle build agent constitution

> Maintain this file as the project evolves. It is the contract you build against.
> When a task fights it, STOP AND ASK (last section).

## One-liner
Snickerdoodle (snickerdoodle.co.uk) turns kids' drawings & photos into keepsakes and gifts,
held in a private Family Keepsake Home that grows with the child. We "keep the magic" and
"frame the wonky bits in gold." It handles CHILDREN'S personal data — trust, privacy and
child-safety are load-bearing, not features.

## The 9 non-negotiables (HARD RULES — breaking one is a stop-and-ask)
1. CHILD SAFETY FIRST. Never expose a child's data/art to anyone the parent didn't invite.
   When unsure, choose the MORE PRIVATE option and flag it.
2. PRIVACY BY DEFAULT. New keepsakes default to FAMILY — never Extended, never public.
   Nothing is EVER public.
3. PARENT IS CONTROLLER. Children are subjects, not account holders. Only a parent initiates
   invites and sets access. No self-join.
4. AI INVISIBLE & SAFE. Generative features appear only as warm "magic edits." Processors are
   NO-RETENTION, NO-TRAINING, and receive ONLY the single image needed. Never expose raw "AI".
5. BRAND VOICE IS LOAD-BEARING. Warm, plain, playful-with-a-wink, quietly reassuring. No
   corporate tone, no pushy upsell.
6. MOBILE-FIRST. Primary action in the thumb zone on every action screen.
7. ACCESSIBILITY REQUIRED. Semantic, labelled, sufficient contrast, prefers-reduced-motion.
8. ORIGINALS ARE SACRED. Non-destructive editing; the untouched original is always recoverable
   and deletable on demand.
9. DESIGN FIDELITY. The mockups in /mockups are binding — reproduce exactly (docs/00).

## Design fidelity (visuals: the mockups WIN)
- Reproduce layout, colour, type, spacing, copy, components, and the restrained animations.
  Result must be indistinguishable from the mockup, then made real (real artwork replaces doodles).
- BUILD THE BRAND COMPONENT SET in src/ui — never a library's default look, a generic admin
  template, or a redesign. Reuse the set everywhere.
- Before marking a screen done, DIFF it against the corresponding /mockups HTML at a mobile
  width (~390px) AND a desktop width. Add a visual check to tests/visual.
- Precedence: visuals → mockups; behaviour → docs/03 + Studio spec; data/permission/trust →
  docs/04 + docs/05. Not in a mockup (account/auth/trust/admin) → extend in the SAME visual
  language and CONFIRM; never invent a new style.

### Exact tokens (CTAs are cinnamon #D2691E with cream #FFF6E9 text)
oat #FBF5E9 · cocoa #2E2723 (never pure black) · honey #F2A640 · cinnamon #C8623A ·
cta #D2691E · cta-text #FFF6E9 · sky #84BBD0 · berry #E8786E · meadow #93B97C ·
green-save #5C8A3F · honey-band #FBEEDB

### Type, icons & motion
- Fraunces (display) · Mulish (body/UI) · Caveat (handwriting — ONE moment per view, max).
- Self-host fonts (no third-party CDN — GDPR + no FOUT); match the mockups' exact axes
  (Fraunces 500/600 + italic, Mulish 400–800, Caveat 600). Recorded as an intentional, render-
  identical GDPR deviation from the mockups' CDN load.
- Icons: Tabler Icons v3.31.0 — the EXACT set the mockups use — self-hosted as an SVG sprite via
  the Icon primitive. Version pinned; substituting the set is a stop-and-ask.
- Motion is restrained & meaningful only: hero draw-in, product-morph, gentle CTA wobble — all
  guarded by prefers-reduced-motion. Generous radii (pill buttons/chips, ~12–16px cards).

## Authorization (the most important engineering rule)
- ONE central, unit-tested module owns "who can see / do what": src/authz. Every asset read,
  every signed-URL mint, every mutation passes through can()/assertCan(). Nothing bypasses it.
- NEVER TRUST THE CLIENT FOR VISIBILITY, PRICE, OR OWNERSHIP — resolve all three server-side.
- Authz step 1 is the FAMILY-SCOPE check: deny unless the actor holds an ACTIVE membership in
  the resource's family (or is its uploader/controller). Only then evaluate tier × circle.
- Tiers nest: ONLY_ME (controller) < FAMILY < EXTENDED; default FAMILY. A FAMILY-circle member
  sees FAMILY and EXTENDED; an EXTENDED-circle member sees ONLY EXTENDED. Nothing public.
- For a child's asset the CONTROLLING PARENT is the controller; "Only me" = that parent. Resolve
  controllerId on the asset; never key ONLY_ME on the uploader for a child's asset.
- Circle = what you can see; Access (VIEW|VIEW_BUY|CONTRIBUTE) = what you can do. Orthogonal.
- Invites are parent-initiated ONLY; a membership exists only from a VERIFIED invite. Verification
  confirms IDENTITY, not authorisation. Removal sets status and invalidates sessions immediately.
  Only ACTIVE memberships confer circle/access. Log invites/joins/access-changes/removals/
  visibility-changes/gift-link-create+revoke/deletions/consent-changes.

## Children's-data rules (treat children's images as the most sensitive data)
- Uploads → PRIVATE UK/EU bucket; access only via short-lived signed URLs minted server-side
  AFTER an authz check. No public buckets, ever. Strip EXIF/GPS on ingest.
- Residency UK/EU-FIRST: storage/DB/processing default to UK/EU. A US processor only where clearly
  best, via UK–US Data Bridge or IDTA + a "not materially lower" transfer risk assessment; prefer
  in-region for children's images. No live child image leaves the VPC before LG3+LG6 are green.
- Minimise: only what the product needs; NO child surname; no profiling of children; no behavioural
  ads to/about children.
- Retention enforced IN CODE: delete the source upload after fulfilment + 30d UNLESS kept in the
  Keepsake Home. Postgres is the source of truth for "kept". Deletion is real + cascading: DB +
  storage (versions) + provider (confirmed, with retry) + backups (originals crypto-shredded /
  excluded from long-lived backups). One-tap see/download/delete in the account.

## AI / magic edits (no-retention + single-image)
- HYBRID: SELF-HOST deterministic ops in-region (bg removal, upscale-to-print, brighten/tidy,
  adjustments, filters) so no third party sees the image. Use a CONTRACTED no-retention API ONLY
  for generative styling — ZDR mode + Article 28 DPA + no-training term — sending ONLY the single
  image (a unit-tested invariant). Per-creation/account generation budget cap. Original always kept.
- In the UI these are warm one-tap "magic edits" — never raw AI controls or the word "AI".

## Testing expectations
- Authz module EXHAUSTIVELY unit-tested: full matrix tier × circle × access × actor
  (member/guest/anon/admin/controller-vs-other-parent) AND the family-scope/cross-family deny.
  This suite is a launch gate.
- Server-side PRICING unit-tested: totals; 5% join-saving present ONLY with a valid server-side
  join context, absent for guest/member/forged-flag; add-ons; gift price-hiding.
- Also tested: single-image generative request-builder; EXIF strip; gift-link snapshot immutability
  + "deleted source → 410"; retention purge (kept survives; unkept past window is gone DB+storage+
  provider+backup); removed member denied with no session grace.
- Integration: services+db; webhook signature + idempotency; signed-URL minting gated by authz.
- e2e: wow flow (no account wall); create→studio→visibility→save; gift loop (guest OR invite→verify
  →join at set circle/access with saving); studio by finger AND stylus; low-res→DPI warning→upscale.
- A change touching visibility/pricing/ownership/deletion REQUIRES tests in the same PR.

## Security
- Private buckets only; signed, short-lived, scoped URLs (separate interactive vs provider-ingestion
  policies). TLS + at-rest KMS encryption (separate keys for originals). No secrets in client/bundle;
  secret store only; .env never committed. Hashed passwords; least-privilege DB; ADMIN routes MFA.
  Webhooks verify signatures + are idempotent. Card data never stored (Stripe token only).
- noindex on app/gift/checkout; gift-link tokens unguessable, non-indexed, revocable, expirable.

## Accessibility
- Semantic HTML + landmarks; every control labelled; keyboard operable; visible focus; ≥44px tap
  targets; no hover-only controls (Studio included). Sufficient contrast on oat/cocoa; honour
  prefers-reduced-motion. Alt text on imagery. Design all four states (empty/loading-skeleton/
  error/success) for every list/async surface — never a spinner wall or blank void.

## Brand voice for copy
- Warm, plain, playful-with-a-wink, quietly reassuring. Lowercase, friendly. Non-corporate. Trust
  is SHOWN THROUGH CONTROL, not declared. Lexicon: "start creating", "keep the magic", "they're
  only little once", "made real", "your keepsake box", "share a ready-to-buy link",
  "join family & checkout". Match the mockups' exact wording where shown.
- DON'T: sound corporate/stiff; push upsell (add-ons stay small + tasteful; guest checkout one tap
  away); shout about "AI"; imply a child's data is exposed; read like a social network.

## Commit / PR conventions
- Branch off; never commit to the default branch. Conventional commits (feat/fix/chore/test/docs/
  refactor/perf). Small, deployable increments tied to a docs/03 / Studio-spec acceptance criterion.
  A PR states which screen/flow it implements, which non-negotiables it touches, and includes the
  required tests. Never commit secrets or real customer/child data (seed is brand-safe only).
- End commit messages with: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## How to run (fill exact scripts as they land)
- dev: npm run dev · test: npm run test (watch: test:watch) · e2e: npm run test:e2e
- visual diff: npm run test:visual · db: npm run db:migrate / db:generate / db:seed
- jobs: npm run jobs · lint+types: npm run lint && npm run typecheck

## STOP AND ASK
If a task seems to require breaking ANY non-negotiable — or trusting the client for visibility/
price/ownership, sending more than a single image to a processor, weakening a privacy default,
surfacing raw "AI", making anything public, retaining a child's image beyond the schedule,
deviating from the mockups, sending a live child image to a third party before LG3+LG6 are green,
or shipping without the required tests — STOP and ask the founder. When unsure, choose the more
private option and flag it.
> Compliance launch gates (DPIA, Children's Code assessment, transfers, trust pages live, ICO +
> Article 28 DPAs, AI no-retention/no-training confirmed) are hard blockers per docs/05 — do not
> go live until they are closed.
```
