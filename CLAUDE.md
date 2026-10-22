# CLAUDE.md — Snickerdoodle build agent constitution

> Maintain this file as the project evolves. It is the contract you build against.
> When a task fights it, STOP AND ASK (last section).
>
> The full pre-build proposal lives in `proposal/` (stack, schema, folder structure, phased plan).
> Binding requirements: `START-HERE.md`, `docs/00`–`docs/05`, `companion-specs/`, and the mockups in `mockups/`.

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
9. DESIGN FIDELITY. The SCRAPBOOK visual direction (D12) is binding for look & feel; /mockups stay
   binding for layout, flow and copy (docs/00).

## Operating constraints (founder, confirmed)
- Solo operator on a TIGHT BUDGET who needs the build EASY and LOW-OPS — while UX still feels
  QUICK AND GRATIFYING (esp. the Studio's upscale-to-print).
- Favour the simplest managed primitives, scale-to-zero, NO standing GPU until volume justifies
  it (tiered upscale: instant classical resample for the common case; CPU ML super-resolution
  only for large enlargements at launch). Keep the monthly bill small and visible.

## Design fidelity (D12, 2026-10-12: the SCRAPBOOK direction)
- LOOK & FEEL = the Scrapbook direction (design canvas "Snickerdoodle design directions", row B):
  kraft paper, washi tape, taped polaroids, chunky ink-outlined stickers, bold crayon colour.
  LAYOUT, FLOW and COPY = the /mockups + docs/03 (unchanged). The inventory is still "Keepsakes" /
  the "Keepsake Home" — "scrapbook" is the look, never the name. Keep "they're only little once"
  and "Keep the magic" (founder).
- MOBILE = an APP: compact sticky header (logo · basket · account), floating pill tab bar in the
  thumb zone, bottom-sheet modals, safe-area insets, installable PWA (manifest.ts).
- BUILD THE BRAND COMPONENT SET in src/ui — never a library's default look, a generic admin
  template, or a redesign. Reuse the set everywhere.
- Before marking a screen done, DIFF it against the corresponding /mockups HTML at a mobile
  width (~390px) AND a desktop width. Add a visual check to tests/visual.
- Precedence: visuals → mockups; behaviour → docs/03 + Studio spec; data/permission/trust →
  docs/04 + docs/05. Not in a mockup (account/auth/trust/admin) → extend in the SAME visual
  language and CONFIRM; never invent a new style.

### Tokens — ONE source of truth: src/app/globals.css @theme (never raw hex in components)
oat (the page — light cream, 2026-10-21) #F8F5E9 · paper #FFFBF2 · paper-2 #F6EEDF · line #D9C7A9 · cocoa (ink) #2B2118 ·
ink-soft #5A4A3A · ink-faint #6E5D4B · cta (tomato) #C8402A + cta-deep #8E2A1A, white text ·
cinnamon (tomato for text) #A8331F · honey/sunshine #F6C445 (fills only) · honey-band #FBE9B7 ·
cobalt #2F5DA8 · sky #8FB5D6 · berry #E8786E · leaf #7FA65E · green-save #3F6E29.

### Type, icons & motion
- Bricolage Grotesque (display + UI, 800 for headings) · Gaegu 700 (handwriting — ONE moment
  per view, max). Caveat & co. remain ONLY as greetings-card message fonts.
- Self-host fonts via @fontsource (no third-party CDN — GDPR + no FOUT).
- Icons: Tabler Icons v3.31.0 — the EXACT set the mockups use — self-hosted as an SVG sprite via
  the Icon primitive. Version pinned; substituting the set is a stop-and-ask.
- Motion is PLAYFUL but CHEAP (globals.css motion system): pop-in stagger, press-squash,
  polaroid lift, sticker wiggle, tab hop, scribble draw-in, sheet-up, page fade, plus the
  "start creating" CTA wobble (keep it) and the product-morph. Transform/opacity only, CSS only
  (no animation library, no JS timers), all off under prefers-reduced-motion. Never animate a
  transform on an ancestor of position:fixed UI (tab bar, sheets).

## Authorization (the most important engineering rule) — see src/authz
- ONE central, unit-tested module owns "who can see / do what": src/authz. Every asset read,
  every signed-URL mint, every mutation passes through canViewAsset()/assertCanViewAsset()/
  canAct helpers. Nothing bypasses it. The test matrix in src/authz/__tests__ is a launch gate.
- NEVER TRUST THE CLIENT FOR VISIBILITY, PRICE, OR OWNERSHIP — resolve all three server-side.
- Authz step 1 is the FAMILY-SCOPE check: deny unless the actor holds an ACTIVE membership in
  the resource's family (or is its uploader/controller). Only then evaluate tier × circle.
- Tiers nest: ONLY_ME (controller) < FAMILY < EXTENDED; default FAMILY. A FAMILY-circle member
  sees FAMILY and EXTENDED; an EXTENDED-circle member sees ONLY EXTENDED. Nothing public.
- For a child's asset the CONTROLLING PARENT is the controller; "Only me" = that parent. Resolve
  controllerAccountId on the asset; never key ONLY_ME on the uploader for a child's asset.
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
- Generative is deferred to Phase 3; Phase 1 launch has ZERO third-party image exposure.
- In the UI these are warm one-tap "magic edits" — never raw AI controls or the word "AI".

## Content safety (decision D8 — see docs/05 + project-office/briefs/CONTENT-SAFETY-options.md)
- AUTOMATED-FIRST, human only on flagged exceptions. A human viewing a child's image is itself a
  privacy event — any human review is rare, minimal, ACCESS-CONTROLLED, LOGGED, and disclosed.
- EVERY upload is HASH-CHECKED for known CSAM (IWF Image Intercept) AND passed through the
  moderation classifier (AWS Rekognition Content Moderation, in-region eu-west-2) BEFORE it can
  reach a print order. CSAM match → preserve, DO NOT view/redistribute, report per the runbook.
- The classifier FLAGS into a review queue — it NEVER auto-rejects a child's drawing. No silent bin.
- A one-tap REPORT/TAKEDOWN path exists wherever a creation/gift link is viewed, wired to the real
  cascading-deletion job.
- Copyright posture S3-b: rights-warranty + brand framing toward the child's OWN original art +
  disclaimer of others' characters/logos + fast takedown. (Automated character-detection is P2+,
  not launch.) The IP posture itself is a stop-and-ask if a task would weaken it.
- User text (Studio text, gift message, member name) screened for abuse; child FIRST NAME ONLY.
- Generative (P3): PRESET magic edits only — NO free-text prompt box — and the output is
  re-screened through the upload classifier before it is ever shown or printed.

## Testing expectations
- Authz module EXHAUSTIVELY unit-tested: full matrix tier × circle × access × actor
  (member/guest/anon/admin/controller-vs-other-parent) AND the family-scope/cross-family deny.
  This suite is a launch gate.
- Server-side PRICING unit-tested: totals; 5% join-saving present ONLY with a valid server-side
  join context, absent for guest/member/forged-flag; add-ons; gift price-hiding.
- Also tested: single-image generative request-builder; EXIF strip; gift-link snapshot immutability
  + "deleted source → 410"; retention purge (kept survives; unkept past window is gone DB+storage+
  provider+backup); removed member denied with no session grace.
- Content safety: an upload cannot reach a print order without passing the CSAM hash-check + the
  moderation classifier; a flagged item routes to review (never auto-rejected, never silently
  binned); generative output is re-screened before display/print; child-surname rejected in name fields.
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

## How to run
- dev: (added with the Next.js app shell) · test: `npm test` (watch: `npm run test:watch`)
- typecheck: `npm run typecheck` · e2e: `npm run test:e2e` (added later) ·
  visual diff: `npm run test:visual` (added later) · db: `npm run db:*` (added later) ·
  jobs: `npm run jobs` (added later) · lint: `npm run lint` (ESLint, Next rules; also runs inside `next build`)

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
