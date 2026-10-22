# Test site: new range + card packs + gift-link fix — plan of action (2026-10-21)

Pulls together today's Snickerdoodle sessions: *overview and gaps* (phone cases, test-site deploy
scripts), *product expansion research* (brief + prices), *range expansion* (D21/D22 build),
*card-pack builder* (UI branch), *flaky gift-link test* (diagnosis, uncommitted).

## Where things stand (end of 21 Oct)
| Piece | State | Where |
|---|---|---|
| Whole-pound prices (D21) incl. phone cases £25/£30 | **Live** on the test site (deployed + re-seeded) | `build/phase-0-trust-spine` |
| 9 new products + card packs (D21/D22) | Built, **hidden**; seeded into the test DB | same |
| Repeat-pattern edit (socks / wrap / tea towel) | Built (print file only) | same |
| Card-pack builder UI | **Merged** (5c7ff39) | `build/phase-0-trust-spine` |
| Flaky gift-link test | **Fixed** (e5f6740) — worker ticks scoped to their own order | same |
| Storefront e2e price expectations | Fixed today | 22a251b |
| Test-site DB | 40/40 migrations, catalogue re-seeded 21 Oct (26 products, 435 variants) | Supabase |

## Bugs / gaps found today
1. **Stale worktrees re-seed the shared dev DB backwards.** Any integration run calls `seedCatalogue`
   with *its own* DEFS — the gift-link worktree (on aadda11) puts the dev DB back to old prices and
   switches the card-pack variants off. (This is what the builder session saw.) → retire or rebase
   stale worktrees before running integration tests; re-seed dev after.
2. **Flaky gift-link guest test** = `worker.int.test.ts` runs the worker over EVERY paid order in the
   shared DB, so it can claim another suite's artwork. Fix (scope every worker call to its own
   order) is written but uncommitted; the session couldn't align its worktree to the branch.
3. **`deploy.ps1` is fragile:** (a) it dies on npm's first warning when output is redirected
   (PowerShell 5.1 + `$ErrorActionPreference='Stop'`); (b) it tars `.claude/worktrees/*` into the
   build — full extra copies of the source. → exclude worktrees; check `$LASTEXITCODE` instead.
4. **`/api/jobs/seed-catalogue` times out on Netlify** (504 after ~30 s for 435 variants, one row at a
   time). It was seeded from a laptop instead. → a `scripts/test-site/seed.ps1` (local run against
   `.env.test-site`) and/or batch the upserts. Same risk for `seed-mockups`.
5. **New products have no shop art:** `ProductArt` only knows the old keys, and there are no mockup
   blanks for socks, height chart, hoodies, acrylic block, wrapping paper, tea towel, bandana,
   playing cards (card packs can reuse the card's). Showing them now = blank/broken tiles.
6. **Pattern products preview a single drawing** (positioner + mockups) while the print file is a
   repeat — the preview must show the pattern before these go on show.
7. **Height chart prints no ruler** — must be drawn into the file + a scale test (proposed session).
8. **Gift links (Children's Code):** already 720px previews + revoke (13 Oct). Still open: 30-day
   expiry with forwardable bearer links (shorter default?), just-in-time wording on the create
   modal, OQ-17 (named recipients for sensitive items). The "weak gift link" fix mentioned this
   afternoon never landed as a commit — nothing in the tree.
9. Hoodies have no garment photos/chest tables yet (tees do); hoodies aren't in the family-set saving.

## Plan (order matters; ✦ = can run in parallel)
**A. Land and align the code — ✅ DONE 21 Oct evening** (builder merged, gift-link + studio-scope flakes fixed,
full suite with the dev DB 761 passed ×2, lint ignores `.claude/**`, pushed, test site redeployed)
- A1. Merge the card-pack builder (`claude/stoic-bohr-a585fb`) into `build/phase-0-trust-spine`.
- A2. Bring the gift-link fix onto the current branch (re-apply the `worker.int.test.ts` scoping),
  run the full suite 3–5× against the dev DB, commit. Retire the stale worktree.
- A3. Re-seed the dev DB; full suite + lint + typecheck green; push.

**B. Make the new range presentable — ✅ DONE 21 Oct night** (branch `claude/brave-bohr-dv13jo`, PR into `build/phase-0-trust-spine`)
- ✅ B1. Shop art: a `ProductArt` motif per new key + a plain-sheet fallback for any unknown key. Mockups: card packs
  reuse the card's; socks / height chart / acrylic / wrap / bandana / playing cards get a DRAWN mockup (print area at the
  print file's exact aspect, drift 0); the tea towel uses Prodigi's blank if staged (else drawn). **Founder: confirm
  Prodigi's photo licence** (downloads library = for integrators; product-page photos = one-line check in the support thread).
- ✅ B2. Pattern preview: the positioner draws the repeat (drag = shift, resize = motif size); the compositor lays the
  printed face (same code as the print file) on the product, so customize previews show it. Height chart: its ruler too.
- ✅ B3. Height-chart ruler: cm (1/5/10) + ft/in (1/6/12) drawn into the print file at true scale, the drawing beside it;
  every tick within ±1 px for all four sizes. **Founder: where the scale starts** (`HEIGHT_CHART_FLOOR_CM`, default 30 cm).
- ✅ B4. Hoodie photo blanks: `derive-garment-photo-blanks.mjs` derives them from a staged `*hoodie*` packshot (per
  colour) + chest tables (approximate — confirm with Prodigi). Until a packshot is staged, hoodies keep the plain tile.
- ➕ Copy fix: cards, card packs, wrapping paper and playing cards say "free delivery", not "free tracked delivery".

**C. Fix the deploy pipeline — ✅ DONE 21 Oct night**
- ✅ C1. `deploy.ps1`: excludes `.claude/worktrees`, judges native tools by `$LASTEXITCODE` (no more dying on npm
  warnings), prints the live URL.
- ✅ C2. `scripts/test-site/seed.ps1` (+ `seed.ts`): catalogue then mockups, locally, against `.env.test-site`; refuses
  unless `SITE_MODE=test`; never prints a setting. `seedCatalogue` batched (~1,800 → ~180 queries — the Netlify 504).

**D. Go live on the test site (last)**
- ✅ D1. Founder (21 Oct): no switch, no hidden lines — one collection. LIVE in the range: card pack, socks, height chart,
  acrylic block, wrapping paper, tea towel, playing cards. HELD: hoodies (need a hoodie packshot + confirmed chest sizes),
  pet bandana (drawn shape is a guess until Prodigi's template is traced).
- ✅ Catalogue reveal: instant in-browser previews + batched, prefetched photos (range shows in ~1.3 s locally).
  Bigger win still available: set Netlify Functions region to London (Site configuration → Functions, paid plans).
- D2. On the founder's computer (see the PR's "run locally"): integration tests → `deploy.ps1` → `seed.ps1` →
  `e2e/storefront-smoke` + card-pack e2e against the test site → click through card pack, socks pattern, gift link
  (create, open as guest, revoke).

## Founder decisions (21 Oct)
- ✅ New range: live as one collection (above). ✅ Height chart: hang 40 cm up, reads 50–150 cm (market standard).
- ✅ Gift links: 14 days. ✅ Untracked post for wrap + playing cards: accepted ("free delivery" copy).
- ✅ Card-pack builder: as built. ✅ Prodigi photo licence: fine.
- Still open with Prodigi: are envelopes included with cards? does LIVE keep the flat £0.95 for 10+ cards? Are jigsaw
  and baby bodysuit standard post tracked now (PRICING.md, July, said untracked; the jigsaw page says tracked)?

## Founder decisions + changes (22 Oct)
- ✅ **Real product photos** for socks (ankle + tube), tea towel, wrapping paper and playing cards, from the
  founder's cut-outs: `scripts/compose-founder-layers.mjs` composes them (cream backdrop, soft shadow, ~80% fill,
  the heel / folded corner / paper curl laid OVER the print) into `.prodigi-assets/blanks/layered/` (gitignored,
  raw cut-outs in `blanks/founder-raw/`). The seeder prefers these over the drawn stand-ins (`layered-flat`).
  Socks + tea towel multiply the art over the photo, so the knit / cotton texture shows through. The tea towel is
  turned portrait (its print file is portrait). The leaning playing card warps onto its true corners and clips to
  its rounded corners (the perspective path now honours mask + overlay — the greetings card benefits too).
  Check locally before seeding: `npx tsx --conditions=react-server scripts/preview-mockups.ts <test-drawing.png>`.
- ✅ **Acrylic block removed** (no honest preview of a clear block). Re-seeding retires it.
- ✅ **Flat products never sit together** in the grids (`spaceOutFlat`, src/lib/catalogue-view.ts): jigsaw, blanket,
  wrapping paper, tea towel, height chart, calendar are held ≥3 places apart — never side by side, never stacked on
  the 2-column phone grid. The popularity order is otherwise kept.
- **To go live:** `powershell -ExecutionPolicy Bypass -File .\scripts\test-site\seed.ps1 -Only mockups` (from this
  computer — the photo sets are local) then `...\deploy.ps1`; re-seed the catalogue too (`-Only catalogue`) to
  retire the acrylic block. Still drawn: height chart, pet bandana.
