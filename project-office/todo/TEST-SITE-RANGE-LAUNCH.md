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
| Card-pack builder UI | Built + e2e green, **not merged** | `refs/heads/claude/stoic-bohr-a585fb` @ a14a5f1 |
| Flaky gift-link test | Diagnosed + fixed, **uncommitted**, on a stale base | worktree `practical-agnesi-806ded` (base aadda11) |
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
**A. Land and align the code (first, ~1 h, one session)**
- A1. Merge the card-pack builder (`claude/stoic-bohr-a585fb`) into `build/phase-0-trust-spine`.
- A2. Bring the gift-link fix onto the current branch (re-apply the `worker.int.test.ts` scoping),
  run the full suite 3–5× against the dev DB, commit. Retire the stale worktree.
- A3. Re-seed the dev DB; full suite + lint + typecheck green; push.

**B. Make the new range presentable ✦**
- B1. Shop art + mockups: a fallback `ProductArt` motif per new key (+ cardPack), Prodigi template
  blanks → `seed-mockups` cases (cardPack reuses card). Founder: confirm Prodigi's photo licence.
- B2. Pattern preview: positioner + mockup compositor draw the repeat for pattern products.
- B3. Height-chart ruler + scale test (proposed session already waiting).
- B4. Hoodie photo blanks + chest sizes (`derive-garment-photo-blanks.mjs`).

**C. Fix the deploy pipeline (small, one session)**
- C1. `deploy.ps1`: exclude `.claude/worktrees`, tolerate stderr, fail on `$LASTEXITCODE`.
- C2. `scripts/test-site/seed.ps1`: run `seedCatalogue` (and mockups) locally against
  `.env.test-site` (`NODE_OPTIONS=--conditions=react-server`, tsx). Optionally batch the upserts.

**D. Go live on the test site (last)**
- D1. Decide what shows: per product, flip `visibleInShop` once its art/preview is right — or add a
  test-site-only "preview" visibility so hidden lines show on the password-locked site only.
- D2. Deploy (fixed script) → seed catalogue + mockups → run `e2e/storefront-smoke` + the card-pack
  e2e against the test site → click through: card pack, socks pattern, gift link (create, open as
  guest, revoke).

## Founder decisions needed
- Card-pack builder: layout/copy, auto-fill fronts (no per-card repositioning in v1), guests can
  start a pack, "not quite ready to print" wording.
- Which new products show on the test site first (D1), and whether "show hidden on test site only" is OK.
- Wrapping paper + playing cards ship **untracked** (tracked +£1.05 for wrap; Budget would let cards be £19).
- Height chart: where the scale starts above the floor.
- Gift-link default expiry (30 days today).
- Prodigi: are envelopes included with cards? does LIVE keep the flat £0.95 for 10+ cards?
