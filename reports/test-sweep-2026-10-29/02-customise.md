# Test sweep 29 Oct 2026 — 02 · customising and placement editing, every product

Tester 02 · branch `claude/sweep-2-customise-29ec70` (cut from `feat/christmas-season` @ d6f890b)

## How this was tested

- **My own setup**: database `snickerdoodle_t2`, a production build (`.next-e2e`) on port 3202 with the console mailer and the local MinIO key. Catalogue and mockups seeded: 32 products, 480 variants, 365 mockup templates.
- **Multi-buy prices**: the "buy more & save" tiers need each variant's costs, so I wrote them into my database only. I used a copy of `scripts/discount-headroom.mjs --write-costs` that saves its output to my scratchpad, so nothing was written into `.prodigi-assets`.
- **Safety**: Stripe is `sk_test_`, Prodigi is the sandbox, mail goes to the console. No payments were made.
- **Test pictures**: only the drawn shapes the e2e helpers make. No real child art.
- **Evidence**: every PASS below comes from a Playwright test I ran and watched pass. The tests check prices against the seeded database, not against numbers typed into the test.
  - JSON logs and screenshots are in `reports/test-sweep-2026-10-29/shots/02/`.
- **Rate limit**: my test volume hit the server's limit on picture requests (`/api/mockup`, 1,500 per address per 10 minutes). Any run that hit it was re-run alone after clearing the limiter rows in my own database. That limit isn't a bug, but see the note at the end.

### New tests (committed)

| file | what it pins |
|---|---|
| `e2e/shop-db.ts` | helper: reads the shop from the e2e server's own database, plus the basket and upload readers |
| `e2e/customise-every-product.spec.ts` | every product at 390×844 and 1280×800: page, preview, no sideways scroll, button in thumb reach, every option chip → the database's variant and price, plus a preview of that variant. All 42 phone models. A desktop pass that picks **every single variant** (202 of them) |
| `e2e/placement-roundtrip.spec.ts` | the placement editor for all 19 products, and the placement surviving editor → save & return → preview → basket → reopen → editor. Pinch, drag, undo, F reset, double-tap |
| `e2e/customise-views-extras.spec.ts` | every preview view (front and back, the mug's three sides, card views, jigsaw tin, cushion shapes and backs) and the extras that reach the basket (cushion back, base colour, card span and message) |
| `e2e/customise-basket-edit.spec.ts` | pack labels, the buy-more dropdown, the basket sidebar's edit |
| `e2e/print-quality-warning.spec.ts` | the low-resolution warning at 2000 px (none) and 500 px, the "make it <size>" fix, the editor's block and "zoom out to fix", and the gently-enhanced print preview |
| `e2e/bundle-builder.spec.ts` | the family bundle builder at phone and desktop |
| `e2e/customise-nudges.spec.ts` | lift-off-the-paper nudges, "+ keepsake" as a guest, and the add button with quantity 3 |

Confirmed bugs are pinned as `test.fixme('02-Bn: …')`. They show as skipped, so nothing committed fails.

---

## (a) Coverage checklist

**Products on show.** There are 22. 19 use `/customize/[key]`. The other 3 have their own builders: card pack, calendar and family bundle.

**Variants offered.** 202 across the 19 products that aren't phone cases or builders, plus 152 phone-case variants (42 phones). Builders: card pack 2, calendar 2, bundle 3. Bundle-only placemat and coaster packs are rightly hidden.

### A1. Page, preview and options (phone 390×844 and desktop 1280×800)

Each product below passed the same five checks:

- the page loads at its label;
- it opens on its default variant;
- a picture of the drawing on that variant came back from the server and was painted on the page;
- nothing scrolls sideways;
- on a phone, "add to basket" is at least 44 px tall and inside the thumb zone.

Then every chip in Size / Orientation / Colour / Case / Finish was tapped. Each tap landed on the database's variant at its price, with a new preview of that variant. Evidence: `every-product-phone.json` and `every-product-desktop.json`, plus screenshots `phone-<key>.jpg` and `desktop-<key>.jpg`.

| product | variants | chips swept | every-variant pass (desktop) | phone | desktop |
|---|---|---|---|---|---|
| framed print | 64 | 4 sizes · 2 orientations · 8 colours | 64/64 | PASS | PASS |
| mug | 7 | sizes + colours | 7/7 | PASS | PASS |
| cushion | 6 | 4 sizes (+ backs, see A3) | 6/6 | PASS | PASS |
| kids tee | 55 | 5 sizes · 11 colours | 55/55 | PASS | PASS |
| jigsaw | 6 | 3 sizes · 2 orientations | 6/6 | PASS | PASS |
| fleece blanket | 4 | sizes · orientation | 4/4 | PASS | PASS |
| greetings card | 1 | — | 1/1 | PASS | PASS |
| adult tee | 30 | sizes · colours | 30/30 | PASS | PASS |
| ceramic ornament | 1 | — | 1/1 | PASS | PASS |
| christmas bauble | 1 | — | 1/1 | PASS | PASS |
| christmas sack | 1 | — | 1/1 | PASS | PASS |
| placemats | 1 shown (4-pack) | — | 1/1 | PASS | PASS |
| coasters | 3 shown (2/4/6) | 3 packs | 3/3 | PASS | PASS |
| phone case | 152 | **all 42 phones** typed and picked, then each Case and Finish chip | (model loop) | PASS | PASS |
| socks | 2 | ankle / tube | 2/2 | PASS | PASS |
| height chart | 12 | 2 sizes · 3 hanger colours (+ orientation chips) | 12/12 | PASS | PASS |
| wrapping paper | 6 | 3 lengths · white / kraft | 6/6 | PASS | PASS |
| tea towel | 1 | — | 1/1 | PASS | PASS |
| playing cards | 1 | — | 1/1 | PASS | PASS |

One limit on the phone-case row: each phone's Case chips were tapped, then its Finish chips. That covers 3 of the 4 grade × finish pairings per phone, not every pairing.

### A2. Option extras

| item | result | evidence |
|---|---|---|
| Pack labels: placemats "a set of 4 placemats, one drawing on all 4"; coasters 2/4/6 "…on both" / "…on all 4" / "…on all 6" at £18/£26/£34; no single coaster; no placemat size chips | PASS | `pack labels say how many…` |
| "buy more & save": 10 options, "1" has no note, some say "N% off"; picking 3 adds 3 to the basket | PASS | `buy more & save…` |
| Phone case: typing to find a phone, 42 models, Case + Finish, tough-only phones | PASS | sweep + existing `phone-case.spec.ts` |
| Garment sizes and colours (kids / adult tee) | PASS | every-variant pass |
| Height chart sizes × hanger colours | PASS | every-variant pass |
| Wrapping paper lengths × white / kraft | PASS | every-variant pass |
| Base colour ("ground"), typed as a colour code on socks: the preview asks for that colour, the line carries it, and reopening brings it back | PASS | `extras reach the basket…` |
| Ground strips (every thumbnail repainted on the chosen base colour) | PASS with a note | Final state is right. The existing `customize-ground-strips.spec.ts` fails because it also sees 4 white-background requests fire at the click (see N2) |
| Lift-off-the-paper nudge (socks on green): the nudge shows, one tap → "lifted off the paper ✨", and the line carries the cutout | PASS | `customise-nudges` |
| Dark tee nudge → "lift it off the paper in the studio" (none on white) | PASS | `customise-nudges` |
| "+ keepsake" as a guest → `/login?next=/customize/mug` | PASS | `customise-nudges` |
| Card: "front only" / "full width" and "add a message" (greeting + signature) reach the basket line | PASS | `extras reach the basket…` |
| Card: reopening a card with a message from the basket | **FAIL** | **02-B3** |
| Card packs (pack of 5 / 10, one drawing on all, base colour) | PASS on behaviour | The existing `card-pack.spec.ts` is out of date (S1) |
| Calendar (13 pages, flip-through, March's own pick, A4 £24) | PASS | existing `calendar.spec.ts` |

### A3. Preview views (front / back and the rest), phone and desktop

| item | result |
|---|---|
| Ornament, bauble, sack: "show the back" draws the back (`view=back`) | PASS ×2 viewports (`view-*-back.jpg`) |
| Placemat: the back is the cork photo (`/api/mockup/still?view=back` → 200, shown) | PASS ×2 |
| Mug: centre / front / back | PASS ×2 |
| Jigsaw: the puzzle / the tin | PASS ×2 |
| Card: single / outside front-only / outside full-width / closed full-width front half | PASS ×2 |
| Cushion: heart / round / square backs; 12″ square: every back swatch (white = single-sided price, a colour = double-sided price) + "image both sides" | PASS ×2 |

### A4. Placement editor (`/studio/position`)

| item | result | evidence |
|---|---|---|
| All 19 products, non-default variant: `+` ×4 zooms, arrow keys nudge, `R` rotates 90°, and the dpi badge shows | PASS | `placement-roundtrip.json`, `placement-<key>.jpg` |
| Save & return → the customize preview recomposes with that exact placement | PASS ×19 | |
| Add to basket → the line has the exact drawing (asset id), the previewed variant, and exactly the previewed placement; offsets match the sliders | PASS ×19 | |
| Reopen from the basket (`?edit=`) → "update basket", same variant, same placement; the editor reopens on the same zoom, offsets and rotation | PASS ×19 | |
| Pinch out (two touch pointers) zooms in; one-finger drag moves; undo restores; F resets | PASS | `editor gestures…` (phone) |
| Double-tap: fit ↔ fill on the sack; the frame snaps back to filled | PASS | `double-tap…` |
| Laptop: a plain wheel scrolls the page; ctrl + wheel zooms | PASS | existing `placement-phone.spec.ts` |
| Phone layout (no sideways scroll, ≥44 px sliders, save in the thumb zone, live preview by the layout) | PASS | existing `placement-phone.spec.ts` |
| Repeat-pattern pinch redraws the repeat as you go (socks) | PASS | existing `pattern-pinch.spec.ts` |
| Basket sidebar's edit opens that line in update mode, keeping its colour | PASS | `the basket sidebar's edit…` |
| Checkout's "customize your …" opens that line | **FAIL** | **02-B4** |
| Editing a line into another line's variant keeps both quantities | **FAIL** | **02-B1** |

### A5. Print quality (low-resolution) warning and upscale

| item | result | evidence |
|---|---|---|
| 2000 px drawing: no product says "too small" at its default size | PASS | `quality-2000px.json` |
| 500 px drawing: a "too small" block on frame, mug, jigsaw, blanket, card, adult tee, placemat, cushion heart and phone case; the others say soft / gently sharpened; "add to basket" is greyed when blocked | PASS | `quality-500px.json`, `quality-block-framedPrint-phone.jpg` |
| "make it <size> — prints beautifully" picks the biggest size that prints (cushion heart → 12″ square) and unblocks | PASS | `a small drawing…` |
| …the same button on a phone case offers a different PHONE | **FAIL** | **02-B2** |
| Framed print "soft up close" advice | **FAIL (logic and copy)** | **02-B8** |
| Editor: zooming in until it blocks → "image quality too low at this size", save greyed with the reason, "zoom out to fix" → save enabled | PASS | `quality-editor-block-phone.jpg` |
| Upscale path: "preview the exact print file" on an enhanced placement → `1875×1875px · 150 dpi · gently enhanced` | PASS | `quality-enhanced-render.json` |

### A6. Christmas family bundle builder (phone and desktop)

| item | result |
|---|---|
| Step 1: sets for 2 / 4 / 8 at £78 / £145 / £279 (database prices); the price sticker, the step notes and the number of ornaments follow the size | PASS ×2 |
| Steps 2–4: the drawing in progress is on the placemats; the coasters and every ornament wear it ("same as the placemats", "the placemats' for now") | PASS ×2 |
| The picture of the set is drawn (`your set for 2: …`); print-quality line shown | PASS ×2 |
| Ornament 2 gets its own drawing uploaded into the keepsake box (signed-in test account on my local database) → "its own design" + "undo"; undo puts the placemats' drawing back | PASS ×2 |
| Slot thumbnails stay put: all four thumbnails stay loaded and unchanged 4 s later; ornament 2 shows a different picture | PASS ×2 (`bundle-*-own-ornament.jpg`) |
| Basket: one line, qty 1, £78, placemat = the drawing, coaster null (= the placemats'), ornaments `[placemats', own]` | PASS ×2 |
| Reopen from the basket → "update basket", same set; change it to a set for 4 → the same line, £145, ornaments `[p, own, p, p]` | PASS ×2 |
| Step copy for a set of 2 | FAIL P3 (**02-B7**) |

### A7. Existing specs I was asked to build on (run alone, after clearing the limiter)

| spec | result |
|---|---|
| basket-per-drawing, calendar, pattern-pinch, phone-case, placement-phone ×2, customize-loader ×2, family-set-whole ×2 | PASS |
| direct-upload | skipped (needs `S3_DIRECT_UPLOADS=true`) — NOT TESTABLE as configured |
| card-pack | FAIL — out-of-date spec (S1) |
| family-set | FAIL — out-of-date spec once multi-buy costs exist (S2) |
| customize-ground-strips ×4 | FAIL — see N2 |
| customize-instant | FAIL — real regression, **02-B5** |

(customize-loader and family-set-whole also failed once while another heavy run was going. Both passed alone.)

**Totals (rows above): 73 — 62 PASS · 10 FAIL · 1 NOT TESTABLE.**

The 10 FAILs are 7 product bugs (02-B1, B2, B3, B4, B5, B7, B8) plus 3 existing specs that fail without a product bug behind them: two are out of date (S1, S2) and one catches the stale-request race in N2. Behind the PASS rows: 202/202 variants checked one by one, 42/42 phone models, 19/19 placement round-trips, and 3 bundle sizes at 2 viewports.

---

## (b) Bugs

### 02-B3 · P1 — reopening a card from the basket loses its message and outside span; "update basket" then prints it blank (and can drop a card)

1. Make a greetings card: "full width", "add a message", greeting "for Gran". Add to basket.
2. Make another card with the same drawing: "front only", "leave it blank". Add to basket.
3. Open the first card from the basket (`/customize/card?edit=<id>`).

- **Expected:** the page shows that card — "add a message" with "for Gran", "full width".
- **Actual:** it shows "leave it blank" and "front only" (whatever card was customised last in the tab). Pressing "update basket" turns the "for Gran" card into a blank, front-only one. Because that now matches the second card, the two lines fold into one with qty 1: the basket went from 2 cards to 1 and the message was gone. Evidence: `shots/02/B3-card-reopen.json`.
- **Suspected cause:** the `?edit` seed in `src/app/customize/[productKey]/page.tsx:178-186` copies size / colour / orientation / grade / finish / back / ground into the selection, but not `message` or `cardImageSpan`. The hydration effect (`:197-206`) then reads the stale ones. The qty drop is 02-B1's mechanism.
- **Test:** `test.fixme('02-B3: …')` in `customise-views-extras.spec.ts`.

### 02-B2 · P2 (close to P1) — on a phone case, "make it <size>" offers a different phone

1. Upload a 500 px drawing.
2. Open the phone case (default iPhone 17).

- **Expected:** "too small… try a smaller product, or a bigger photo". A phone model should never be offered as a "size".
- **Actual:** the page says *"this drawing is too small to print well at iPhone 17 — make it iPhone 13 mini — prints beautifully"* (`quality-500px.json`). One tap would make a case for a phone the parent may not own: a wrong product.
- **Suspected cause:** `src/app/customize/[productKey]/page.tsx:411-424`. `largestSize` / `fitSize` walk `product.sizes`, which for a phone case are phone models.
- **Test:** `test.fixme('02-B2: …')` in `print-quality-warning.spec.ts`.

### 02-B8 · P2 — framed print: the "soft up close" tip steers to a dearer, physically softer frame

1. Upload a 2000 px square drawing.
2. Open the framed print (11×14″, £65).

- **Actual:** *"it'll print — lovely from a step back, a little soft up close · crisp right up close at 18×24″"* (`quality-2000px.json`). 18×24″ is £90.
  - It counts as "crisp" only because frames from 18×24″ up are judged at 150 dpi, not 300 (`gateDpi: 150`, `src/server/catalogue.ts:85`).
  - Real detail at 18×24″ is about 83 dpi, against about 143 dpi at 11×14″.
  - So the tip is a false quality claim that also pushes an upsell (CLAUDE.md: no pushy upsell).
- **Expected:** only suggest a size that really is sharper, so in practice a smaller one. Or drop the size link when the suggestion is bigger than the current size.
- **Suspected cause:** `sharpSize` in `src/app/customize/[productKey]/page.tsx:425` compares `softUpClose` across sizes with different gate dpi.

### 02-B1 · P2 — editing a basket line into another line's variant loses quantity

1. Add mug colour A with quantity 2.
2. Add mug colour B (same drawing) with quantity 1.
3. Open line B from the basket, change it to colour A, and press "update basket".

- **Expected:** one line, qty 3.
- **Actual:** one line, qty **1**. Two mugs vanish silently.
- **Suspected cause:** `src/app/customize/[productKey]/page.tsx:556-557`. `update(edit.id, fields, id)` folds the two lines and sums their quantities (`store.ts` update). Then `setLineQty(id, qty)` overwrites the sum with the edited line's own quantity. The same thing happens on every product (it's part of 02-B3).
- **Test:** `test.fixme` in `customise-basket-edit.spec.ts`.

### 02-B4 · P2 — at checkout, "customize your …" doesn't edit that line

1. Add a mug in a non-default colour.
2. Go to `/checkout` and tap the pencil "customize your mug".

- **Expected:** `/customize/mug?edit=<line>`, showing that line's drawing, colour and placement, with "update basket".
- **Actual:** `/customize/mug`, a fresh page on the drawing in progress at default settings, with "add to basket · £18". Pressing it adds a **second** line instead of changing the first. If the drawing in progress has changed since, it's even a different drawing.
- **Suspected cause:** `src/app/checkout/page.tsx:355` adds `?edit=` only for packs, the bundle and calendars. The line dates from June, before edit mode existed. The basket sidebar (`src/ui/components/Basket.tsx:36`) does it right.
- **Test:** `test.fixme('02-B4: …')`.

### 02-B5 · P3 — customize no longer opens on the range tile while the close-up is drawn

1. Open the range.
2. Slow the close-up (the existing `customize-instant.spec.ts` delays `/api/mockup` by 6 s, like the deployed site).
3. Tap "customize mug". (The framed print does the same.)

- **Expected:** the tile's picture straight away, then the sharp close-up (founder, 23 Oct).
- **Actual:** "updating your preview…" and no picture until the close-up lands.
- **Suspected cause:** cache-key mismatch.
  - Range tiles never send a `ground` (`src/ui/components/ProductGrid.tsx:20-34`).
  - The customize page sends `ground: '#ffffff'` for every base-colour product (`groundFor` in `page.tsx`).
  - `mockupKey` includes ground (`src/lib/mockupPrefetch.ts:32-33`), so the stand-in lookup misses.
  - I confirmed the customize request carries `ground=#ffffff` and the batch tiles have none.

### 02-B6 · P3 — with quantity 3 chosen, the button still shows the one-item price

On `/customize/mug`, pick 3 in "buy more & save". The button still reads "add to basket · £18", the same text as for 1 (recorded by `customise-nudges › the add button with 3 chosen`). That isn't wrong, but it can read as the total. Consider "add 3 to basket" or the line total. `page.tsx:1186`.

### 02-B7 · P3 copy — bundle set for 2 says "one design on all 2 placemats / coasters"

`src/ui/components/ChristmasBundleBuilder.tsx:346,353`. The pack labels say "both" for two (`src/lib/pack-labels.ts`). Expected "one design on both placemats".

### Notes (not bugs, or for the founder to decide)

- **N1.** For a too-small heart cushion, "make it 12″ square" switches the **shape** as well as the size. It's consistent with the code's size order, but the founder may want a shape kept.
- **N2.** When a new base colour is confirmed, the page fires one extra compose of every preview on the **old** colour (4 requests) just before the new-colour ones. The newest wins, so what's on screen ends up right, but it's wasted server work. It's also why the existing `customize-ground-strips.spec.ts` fails. I could not reproduce it with a 3 s pause before opening the colour sheet.
- **N3.** The picture limit is 1,500 per IP per 10 minutes (`src/server/rateLimit.ts:123`). A real shopper won't reach it, but many households behind one mobile-network IP (carrier NAT) share it. When it trips, previews fall back to the plain block.
- **N4.** Family set: the modal promises "5% comes off", but with multi-buy costs loaded, checkout shows "buy more & save −£7.50" and no family-set line. The engine gives the single best saving (`src/pricing/engine.ts:179`), so the customer gets more — but the wording differs.

### Out-of-date existing specs (the product behaviour is intended)

- **S1.** `e2e/card-pack.spec.ts` expects 5 empty cards. Since the founder's 26 Oct change, card 1 starts with the drawing in progress (`CardPackBuilder.tsx:131-134`).
- **S2.** `e2e/family-set.spec.ts` expects "Family set saving (5%)" at checkout. Once multi-buy costs exist, multi-buy wins (N4).

---

## (c) What I couldn't test, and why

- **Print-file pixels** against Prodigi's templates are tester 03's job; the Studio itself is tester 01's. I only checked one rendered print preview (the upscale path).
- **Hover-only effects** were checked with mouse hover in desktop Chromium only. No real touch device: touch was simulated with touch-type pointer events.
- **Direct uploads** (`S3_DIRECT_UPLOADS`) are off on this server.
- **Every grade × finish pair for every phone**: 3 of 4 per phone, as noted under A1.
- **A guest's own drawings per bundle piece**: a guest can only use the drawing in progress, so the per-piece drawing test used a signed-in test account (`example.test`, my local database only).
- **Checkout totals and the multi-buy saving** at checkout belong to the checkout tester. I only checked that quantity 3 reaches the basket line.
- **Live and AWS were not touched**, and no payment was made.
