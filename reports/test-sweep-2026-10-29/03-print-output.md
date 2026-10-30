# Test sweep 03 — print output accuracy against Prodigi's templates

Tester 03 · 29 Oct 2026 · branch `claude/sweep-3-print-output-d11375` (cut from `feat/christmas-season` @ d6f890b)

## TL;DR

- **The print files themselves are right.** I rendered every distinct print geometry through the real order-time render (`renderPrintFile`): 129 variants (incl. all 47 phone-case sizes) × up to 4 placements. Every file is **exactly** Prodigi's px, PNG, sRGB, opaque (garments see-through by design). The calibration markers land where the on-screen positioner draws them, within 0.07% of the long side. That holds for rotation 90/270, fit and fill, zoom and pan, and the turned files (landscape frames, portrait jigsaws and blankets, the tea towel).
- **Templates = Prodigi.** A fresh read-only sandbox fetch today (216 SKUs) has the same px as the committed fixture for every SKU. Every print area we fill matches, apart from the jigsaw tin lid's documented 3% trim. `BUNDLE_PIECE_GEOM` = the seeded templates = Prodigi.
- **Prodigi accepts the order shape.** A read-only sandbox **quote** with the exact item shape `submit.ts` builds validated **434 of 436** distinct (SKU, attributes, print areas) items. The 2 failures are the hidden storybook (03-B5).
- **But three P1s stop a correct file reaching Prodigi:**
  - **03-B1:** print files are stored by drawing + variant only, so a second placement, card message, cushion back, Studio design or even a *preview* overwrites the file of an order already placed.
  - **03-B3:** big prints zoomed in, and panoramic drawings on a 24×32″ frame at the default, fail to render after payment (sharp's 268 MP limit).
  - **03-B4:** the 3 m and 5 m kraft wrapping-paper rolls (on show) can never render at all.

Counts (checklist below): **PASS 35 · FAIL 6 · BLOCKED 1 · NOT TESTABLE LOCALLY 4** (46 items). Bugs: **P0 0 · P1 3 · P2 1 · P3 1**.

## Set-up and safety (evidence)

- Own DB `snickerdoodle_t3` (created, migrated with drizzle-kit). The shared `snickerdoodle` DB was never touched. MinIO: only objects my tests created, deleted in `afterAll`.
- `STRIPE_SECRET_KEY` starts `sk_test_` (checked; no payment was made anyway). `PRODIGI_BASE_URL=https://api.sandbox.prodigi.com/v4.0`, and my scripts refuse to run otherwise. No mail sent.
- Prodigi calls were **read-only**: `GET /v4.0/products/{sku}` ×216 + 12, and `POST /v4.0/quotes` ×436 (a quote creates nothing). **No order was created at Prodigi**, not even in the sandbox.
- Test art: a synthetic calibration grid generated in the test (honey ground, grey 150 px grid, 5 coloured 200 px markers: TL red, TR green, BR blue, BL magenta, centre black), plus flat-colour squares. No real drawing or photo.
- No dev or e2e server was started (ports 3203 and 3303 unused). This area is the server render and fulfilment path, tested directly against DB + MinIO.

## What I added (tests)

| file | what it pins |
|---|---|
| `src/server/print/__tests__/print-output-sweep.int.test.ts` | One variant of EVERY print geometry rendered for real. It checks: exact Prodigi px, PNG/sRGB, no transparent pixel (non-garments), no white edge on a zoomed fill, markers where the positioner's CSS puts them (fit / zoom+pan / rot90 / rot270-fill), Studio design derivative is what prints, and every wrapping-paper roll renders. `it.fails` repros: **03-B1** (preview overwrites an order's file), **03-B3**, **03-B4**. Optional env: `SWEEP03_OUT` (results JSON), `SWEEP03_SHOTS` (JPEG evidence). |
| `src/fulfillment/__tests__/order-payload-sweep.int.test.ts` | placeOrder → render worker → submitReadyOrders into a **fake transport**. It checks: every item's sku, copies, `fillPrintArea`, attributes, one asset per print area; the bundle for 4 and for 2 expanding into the right packs with lines summing to £145 / £78 to the penny; calendar = 1 item × 13 areas; jigsaw = same file on `jigsaw` + `lid`; card pack = one card line per design with copies, blank inside, summing to £12; Express when a phone case is in the order. `it.fails` repros: **03-B1** (two placements → one file; two card messages → one file). |
| `src/server/__tests__/print-sweep-03.test.ts` | It checks: every area in `printTo` (not just the first) = Prodigi's size (jigsaw lid = the only, documented, exception); the multi-area products fill the right areas; `BUNDLE_PIECE_GEOM` = seeded template = Prodigi; `expandBundle` sums exactly over 3 sizes × 4 drawing mixes × 5 prices with N/N/N pieces; and it pins the card's preview/print shape gap (03-B2). |

Run (all pass, with the `it.fails` counted as expected fails):
`node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/print/__tests__/print-output-sweep.int.test.ts src/fulfillment/__tests__/order-payload-sweep.int.test.ts src/server/__tests__/print-sweep-03.test.ts`
→ **Test Files 3 passed · Tests 139 passed | 6 expected fail (145)** (29 Oct; the 6 = the `it.fails` bug repros: 03-B1 ×3, 03-B3, 03-B4 ×2).

Existing suites re-run green alongside: print-spec, geometry, compositor-parity, cardPrint, gallery, catalogue-prices, phone-cases (8 files, **133 passed**); christmas-bundle, calendar, card-packs, card-pack-line, gate (5 files, **67 passed**).

## Bugs

### 03-B1 — P1 (wrong print): a print file is keyed by drawing + variant only, so a later render overwrites an earlier order's file

- **Where:** `src/server/print/render.ts:287` (`derivativeKey(assetId, \`printfile-${variantId}${tag}\`)`; `tag` is only the base colour). The key leaves out the placement (transform), the Studio design or cutout (`sourceObjectId`), the DUAL cushion back, the card message and the card span. `persistPrintFile` then updates the existing row, so both artwork rows point at one storage object, which holds the **last** render.
- **Repro 1 (tested):** one order with two `framedPrint` lines of the same drawing, one fit and one zoomed 2× and turned 90°. Run `processFulfilment` and `submitReadyOrders`. **Both Prodigi items get the same URL:** `assets/<id>/derivatives/printfile-<variantId>` twice (observed). Expected: two files.
- **Repro 2 (tested):** two greetings cards of one drawing, inside messages "dear gran" and "dear grandad". **Both items get the same file**, so one card prints with the other's message.
- **Repro 3 (tested):** render a mug's order file, then render the same drawing + variant at another placement. That is exactly what the positioner's "preview the exact print file" does (`src/app/actions/render.ts:37`). **The order file's bytes change** (sha256 before ≠ after). The same happens across orders: a grandparent's gift-link order and the parent's own order of one drawing on one product share one file. Prodigi downloads the asset after the order is created (URL valid 24 h), so whatever was rendered last is what prints.
- **Expected:** one immutable file per (drawing source object, variant, placement, back, message, span, ground). For example, add a hash of those to the key, as the mockup cache key already does (`compositor.ts:496`).
- The calendar's `renderedTwin` (worker.ts:142) relies on today's key. A fix must keep "one drawing on 13 pages renders once".

### 03-B3 — P1 (paid order can't be made): big prints zoomed in, or a panoramic drawing on a 24×32″ frame, fail to render after payment

- **Where:** `src/server/print/render.ts:217`. The layer is resized to the full drawn rect (cover × zoom, up to `MAX_ZOOM` 4), then re-decoded with `sharp(layer)` under sharp's default `limitInputPixels` (268,402,689 px), which throws "Input image exceeds pixel limit".
- **Repro (tested, `it.fails`):** `framedPrint-2432-gold` (7200×9600), a 3000×2250 drawing, zoom 1.5 gives `Error: Input image exceeds pixel limit`. The sweep hit it on `framedPrint-2432-gold` and `apron-adult` at zoom 1.5. The DPI gate passes these placements (UPSCALE, not BLOCK), the positioner allows them, and `placeOrder` only checks DPI. So the order is paid, then the line goes RENDER_FAILED and the order parks with "artwork render failed". (The positioner's "preview print file" fails too, but quietly: `ok:false` with no `blocked` flag.)
- **The 24×32″ portrait frame fails at its DEFAULT fill for a drawing about 3:1 or wider** (computed: a 3:1 panorama exceeds the limit above zoom 0.99×).
- Where it bites (zoom above which the render fails, by drawing shape; computed with `computeLayerRect` against 0x3FFF², scratch script):

| variant | file px | 4:3 drawing | 1:1 | 3:4 | 3:1 panorama |
|---|---|---|---|---|---|
| framedPrint | 3307×4192 | > 3.38× | > 3.91× | ok to 4× | > 2.26× |
| framedPrint-1114-gold-landscape | 4192×3307 | ok to 4× | > 3.91× | > 3.38× | > 2.86× |
| framedPrint-1216-gold | 3600×4800 | > 2.96× | > 3.41× | > 3.94× | > 1.97× |
| framedPrint-1216-black | 3614×4795 | > 2.96× | > 3.42× | > 3.93× | > 1.97× |
| framedPrint-1216-gold-landscape | 4800×3600 | > 3.94× | > 3.41× | > 2.96× | > 2.63× |
| framedPrint-1216-black-landscape | 4795×3614 | > 3.93× | > 3.42× | > 2.96× | > 2.62× |
| framedPrint-1824-gold | 5400×7200 | > 1.97× | > 2.28× | > 2.63× | > 1.31× |
| framedPrint-1824-gold-landscape | 7200×5400 | > 2.63× | > 2.28× | > 1.97× | > 1.75× |
| framedPrint-2432-gold | 7200×9600 | > 1.48× | > 1.71× | > 1.97× | > 0.99× — FAILS AT DEFAULT |
| framedPrint-2432-gold-landscape | 9600×7200 | > 1.97× | > 1.71× | > 1.48× | > 1.31× |
| cushion-18round | 2775×2775 | ok to 4× | ok to 4× | ok to 4× | > 3.41× |
| cushion-22square | 3375×3375 | ok to 4× | ok to 4× | ok to 4× | > 2.80× |
| storybook | 1748×2480 | ok to 4× | ok to 4× | ok to 4× | > 3.81× |
| storybook-a4 | 2480×3507 | ok to 4× | ok to 4× | ok to 4× | > 2.70× |
| kidsTee | 3070×3070 | ok to 4× | ok to 4× | ok to 4× | > 3.08× |
| jigsaw-30pieces | 2362×2952 | ok to 4× | ok to 4× | ok to 4× | > 3.20× |
| jigsaw-252pieces-landscape | 4429×3366 | ok to 4× | > 3.70× | > 3.20× | > 2.81× |
| jigsaw-252pieces | 3366×4429 | > 3.20× | > 3.70× | ok to 4× | > 2.14× |
| blanket | 3838×5905 | > 2.40× | > 2.77× | > 3.20× | > 1.60× |
| blanket-medium-landscape | 5905×3838 | > 3.20× | > 2.77× | > 2.40× | > 2.46× |
| blanket-large | 5787×8740 | > 1.62× | > 1.87× | > 2.16× | > 1.08× |
| blanket-large-landscape | 8740×5787 | > 2.16× | > 1.87× | > 1.62× | > 1.63× |
| adultTee-xs-white | 4677×5881 | > 2.41× | > 2.79× | > 3.03× | > 1.61× |
| apron | 5850×7500 | > 1.89× | > 2.18× | > 2.43× | > 1.26× |
| apron-adult | 7500×10500 | > 1.35× | > 1.56× | > 1.80× | > 0.90× |
| sack | 3779×5905 | > 2.40× | > 2.77× | > 3.20× | > 1.60× |
| placemat | 3425×2421 | ok to 4× | ok to 4× | ok to 4× | > 3.91× |
| kidsHoodie | 3070×3070 | ok to 4× | ok to 4× | ok to 4× | > 3.08× |
| adultHoodie-xs-white | 3070×3070 | ok to 4× | ok to 4× | ok to 4× | > 3.08× |
| kidsJumper-34years-varsitygreen | 3070×3070 | ok to 4× | ok to 4× | ok to 4× | > 3.08× |
| christmasJumper-s-firered | 4606×5787 | > 2.45× | > 2.83× | > 3.08× | > 1.63× |
| petBandana | 7500×2244 | > 2.52× | > 2.18× | > 1.89× | > 3.78× |
| petBandana-medium | 9447×2952 | > 2.00× | > 1.73× | > 1.50× | > 3.00× |
| petBandana-large | 10158×3306 | > 1.86× | > 1.61× | > 1.40× | > 2.79× |

- **Expected:** every placement the positioner and gate allow renders. For example, extract the visible window from the source **before** resizing, or pass `limitInputPixels` explicitly on the intermediate decode, and/or cap the zoom per product.

### 03-B4 — P1 (paid order can't be made): the 3 m and 5 m kraft wrapping-paper rolls can never render

- **Where:** `src/server/print/pattern.ts:112`. The repeat is laid on a `sharp({ create })` canvas of the full roll. Kraft 3 m is 8280×35430 (293 MP) and 5 m is 8280×59070 (489 MP), both over sharp's 268 MP default, so it throws "Input image exceeds pixel limit" in 0 s, for **any** drawing and placement.
- **Repro (tested, `it.fails`):** render `wrappingPaper-3mroll-kraft` / `-5mroll-kraft`. The 2 m kraft (195 MP, 3 s) and every white roll (122 MP max, ≤2 s) render at Prodigi's exact px.
- Wrapping paper is `visibleInShop: true`, so every 3 m / 5 m kraft order fails after payment. Even once it renders, a 489 MP PNG is very large: check Prodigi's asset size limit before relying on it (not testable locally).

### 03-B5 — P2 (latent; hidden product): Prodigi rejects every storybook order — no `pageCount`

- **Where:** `src/server/catalogue.ts:367` (storybook: one `default` file, `printTo` default) and `src/fulfillment/submit.ts:446` (no `pageCount` on assets).
- **Evidence:** a sandbox quote for `BOOK-FE-A5-P-HARD-G` and `-A4-` with our item shape returns `400 ValidationFailed — items[0].assets.pageCount: InvalidPageCount`. One file can't make a 24-page book anyway.
- The storybook is hidden (the customize page only lists hidden products with `?all=1` outside production). But it is **active and priced**, so `placeOrder` accepts it from a hand-made request, and that order would park at submission. Fix before it is ever shown: page files + `pageCount`, or pause it (`paused: true`) until then.

### 03-B2 — P3 (cosmetic): the card's positioner frames a slightly different shape from the panel that prints

- The positioner and the card mockup place the design on the card **template** canvas, 127×178 mm @300 + 3 mm bleed = **1570×2172** (aspect 0.7228). The print places it on the spread's outer-front **panel**, **1530×2160** (0.7083), `cardPrint.ts` `placeDesign`. That is a 2.0% shape difference.
- **Measured:** markers in the real card file sit **≤19 px (0.31% of the 6120 px spread, about 1.2% of the card's width)** from where the positioner shows them, across fit, zoom+pan, rot90 and rot270-fill. The trim guide shown is 35 px of bleed each side, against about 15 px horizontally on the real panel.
- Pinned in `print-sweep-03.test.ts` (it changes when the two frames are unified). Same for the card pack.

## Results table — the real print file per print geometry

"preview = print": every calibration marker that is wholly on the print sits where the positioner's CSS (`Positioner.tsx` `imgStyle`) draws it. The figure is the worst offset found, as % of the file's long side. Tolerance 0.6%; most were ≤0.07%. Placements: fit (scale 0), zoom+pan (1.5×, offset 0.4/−0.3), rot90 (1.2×, −0.5/0.2), rot270-fill (scale 1). Patterns and the calendar only fit, since their placement isn't the shopper's. Prodigi px = sandbox `printAreaSizes` for the variant's attributes (fixture, confirmed by the 29 Oct fetch). Every file is PNG, sRGB, density = template dpi, and opaque. Garments are RGBA, see-through by design. The height chart is RGBA but every pixel is opaque.

| product | variant (our sku) | Prodigi SKU · area | Prodigi px | our template px | rendered file | preview = print? | verdict |
|---|---|---|---|---|---|---|---|
| framedPrint | framedPrint | GLOBAL-CFP-11X14 · default | 3307×4192 | 3307×4192 | 3307×4192 RGB @300 | yes (≤0.05%) | PASS |
| framedPrint | framedPrint-1114-gold-landscape | GLOBAL-CFP-11X14 · default | 3307×4192 | 4192×3307 | 3307×4192 RGB @300 | yes (≤0.05%) | PASS |
| framedPrint | framedPrint-1216-gold | GLOBAL-CFP-12X16 · default | 3600×4800 | 3600×4800 | 3600×4800 RGB @300 | yes (≤0.05%) | PASS |
| framedPrint | framedPrint-1216-black | GLOBAL-CFP-12X16 · default | 3614×4795 | 3614×4795 | 3614×4795 RGB @300 | yes (≤0.04%) | PASS |
| framedPrint | framedPrint-1216-gold-landscape | GLOBAL-CFP-12X16 · default | 3600×4800 | 4800×3600 | 3600×4800 RGB @300 | yes (≤0.05%) | PASS |
| framedPrint | framedPrint-1216-black-landscape | GLOBAL-CFP-12X16 · default | 3614×4795 | 4795×3614 | 3614×4795 RGB @300 | yes (≤0.04%) | PASS |
| framedPrint | framedPrint-1824-gold | GLOBAL-CFP-18X24 · default | 5400×7200 | 5400×7200 | 5400×7200 RGB @300 | yes (≤0.05%) | PASS |
| framedPrint | framedPrint-1824-gold-landscape | GLOBAL-CFP-18X24 · default | 5400×7200 | 7200×5400 | 5400×7200 RGB @300 | yes (≤0.04%) | PASS |
| framedPrint | framedPrint-2432-gold | GLOBAL-CFP-24X32 · default | 7200×9600 | 7200×9600 | 7200×9600 RGB @300 | yes (3 placements); zoom+pan: no file | FAIL 03-B3 |
| framedPrint | framedPrint-2432-gold-landscape | GLOBAL-CFP-24X32 · default | 7200×9600 | 9600×7200 | 7200×9600 RGB @300 | yes (≤0.05%) | PASS |
| mug | mug | H-MUG-11OZ-WBL · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-black | H-MUG-11OZ-WB · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-green | H-MUG-11OZ-WG · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-orange | H-MUG-11OZ-WO · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-pink | H-MUG-11OZ-WP · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-red | H-MUG-11OZ-WR · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| mug | mug-11oz-yellow | H-MUG-11OZ-WY · default | 2480×1122 | 2480×1122 | 2480×1122 RGB @300 | yes (≤0.04%) | PASS |
| cushion | cushion | GLOBAL-CUSH-SH-SCSSS · default | 2008×1725 | 2008×1725 | 2008×1725 RGB @150 | yes (≤0.03%) | PASS |
| cushion | cushion-18round | GLOBAL-CUSH-18R-SCSSS · default | 2775×2775 | 2775×2775 | 2775×2775 RGB @150 | yes (≤0.04%) | PASS |
| cushion | cushion-12square | GLOBAL-CUSH-12X12-LIN · default | 1875×1875 | 1875×1875 | 1875×1875 RGB @150 | yes (≤0.05%) | PASS |
| cushion | cushion-12square-double | GLOBAL-CUSH-12X12-LIN-DUAL · default | 3750×1875 | 1875×1875 | 3750×1875 RGBA @150 | yes (≤0.02%) | PASS |
| cushion | cushion-22square | GLOBAL-CUSH-22X22-LIN · default | 3375×3375 | 3375×3375 | 3375×3375 RGB @150 | yes (≤0.05%) | PASS |
| cushion | cushion-22square-double | GLOBAL-CUSH-22X22-LIN-DUAL · default | 6750×3375 | 3375×3375 | 6750×3375 RGBA @150 | yes (≤0.05%) | PASS |
| storybook | storybook | BOOK-FE-A5-P-HARD-G · default | 1748×2480 | 1748×2480 | 1748×2480 RGB @300 | yes (≤0.02%) | PASS |
| storybook | storybook-a4 | BOOK-FE-A4-P-HARD-G · default | 2480×3507 | 2480×3507 | 2480×3507 RGB @300 | yes (≤0.05%) | PASS |
| kidsTee | kidsTee | TEE-SS-STTK909 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| kidsTee | kidsTee-34years-heathergrey | TEE-SS-STTK909 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| jigsaw | jigsaw | JIGSAW-PUZZLE-30 · jigsaw+lid | 2952×2362 | 2952×2362 | 2952×2362 RGB @300 | yes (≤0.06%) | PASS |
| jigsaw | jigsaw-30pieces | JIGSAW-PUZZLE-30 · jigsaw+lid | 2952×2362 | 2362×2952 | 2952×2362 RGB @300 | yes (≤0.04%) | PASS |
| jigsaw | jigsaw-110pieces-landscape | JIGSAW-PUZZLE-110 · jigsaw+lid | 2952×2362 | 2952×2362 | 2952×2362 RGB @300 | yes (≤0.06%) | PASS |
| jigsaw | jigsaw-110pieces | JIGSAW-PUZZLE-110 · jigsaw+lid | 2952×2362 | 2362×2952 | 2952×2362 RGB @300 | yes (≤0.04%) | PASS |
| jigsaw | jigsaw-252pieces-landscape | JIGSAW-PUZZLE-252 · jigsaw+lid | 4429×3366 | 4429×3366 | 4429×3366 RGB @300 | yes (≤0.05%) | PASS |
| jigsaw | jigsaw-252pieces | JIGSAW-PUZZLE-252 · jigsaw+lid | 4429×3366 | 3366×4429 | 4429×3366 RGB @300 | yes (≤0.05%) | PASS |
| blanket | blanket | H-BLA-PBMWHITE · default | 5905×3838 | 3838×5905 | 5905×3838 RGB @150 | yes (≤0.04%) | PASS |
| blanket | blanket-medium-landscape | H-BLA-PBMWHITE · default | 5905×3838 | 5905×3838 | 5905×3838 RGB @150 | yes (≤0.05%) | PASS |
| blanket | blanket-large | H-BLA-PBLWHITE · default | 8740×5787 | 5787×8740 | 8740×5787 RGB @150 | yes (≤0.04%) | PASS |
| blanket | blanket-large-landscape | H-BLA-PBLWHITE · default | 8740×5787 | 8740×5787 | 8740×5787 RGB @150 | yes (≤0.05%) | PASS |
| babyBodysuit | babyBodysuit | GLOBAL-BB-RS-4411 · front | 2130×2130 | 2130×2130 | 2130×2130 RGBA @300 | yes (≤0.03%) | PASS |
| babyBodysuit | babyBodysuit-1824months-white | GLOBAL-BB-RS-4411 · front | differs by route | 1500×2010 | 1500×2010 RGBA @300 | yes (≤0.05%) | KNOWN (hidden — print-spec.test KNOWN) |
| card | card | CLASSIC-GRE-FEDR-7X5-BLA · default | 6120×2160 | 1500×2102 +3mm bleed | 6120×2160 RGBA @300 | yes (≤0.31% of spread — 03-B2) | PASS |
| cardPack | cardPack | CLASSIC-GRE-FEDR-7X5-BLA · default | 6120×2160 | 1500×2102 +3mm bleed | 6120×2160 RGBA @300 | yes (≤0.31% of spread — 03-B2) | PASS |
| calendar | calendar | CALENDAR-A5-L-DATED · cover+january+february+march+april+may+june+july+august+september+october+november+december | 2480×1748 | 2480×1748 | 2480×1748 RGBA @300 | yes (≤0.03%) | PASS |
| calendar | calendar-a4 | CALENDAR-A4-L-DATED · cover+january+february+march+april+may+june+july+august+september+october+november+december | 3507×2480 | 3507×2480 | 3507×2480 RGBA @300 | yes (≤0.03%) | PASS |
| adultTee | adultTee-xs-white | TEE-SS-STTM559 · front | 4677×5881 | 4677×5881 | 4677×5881 RGBA @300 | yes (≤0.05%) | PASS |
| adultTee | adultTee-xs-heathergrey | TEE-SS-STTM559 · front | 4677×5881 | 4677×5881 | 4677×5881 RGBA @300 | yes (≤0.05%) | PASS |
| apron | apron | H-APR-CA-BTIE · default | 5850×7500 | 5850×7500 | 5850×7500 RGB @300 | yes (≤0.05%) | PASS |
| apron | apron-adult | H-APR-AA-BTIE · default | 7500×10500 | 7500×10500 | 7500×10500 RGB @300 | yes (3 placements); zoom+pan: no file | FAIL 03-B3 |
| ceramicOrnament | ceramicOrnament | XMAS-PORC-BAUB · default | 885×885 | 885×885 | 885×885 RGB @300 | yes (≤0.04%) | PASS |
| christmasBauble | christmasBauble | XMAS-PLAS-BAUB · default | 1003×1062 | 1003×1062 | 1003×1062 RGB @300 | yes (≤0.04%) | PASS |
| sack | sack | XMAS-SACK · default | 3779×5905 | 3779×5905 | 3779×5905 RGB @300 | yes (≤0.05%) | PASS |
| placemat | placemat | H-PLACE-4PK · default | 3425×2421 | 3425×2421 | 3425×2421 RGB @300 | yes (≤0.07%) | PASS |
| placemat | placemat-packof1 | H-PLACE-1PK · default | 3425×2421 | 3425×2421 | 3425×2421 RGB @300 | yes (≤0.07%) | PASS |
| placemat | placemat-packof2 | H-PLACE-2PK · default | 3425×2421 | 3425×2421 | 3425×2421 RGB @300 | yes (≤0.07%) | PASS |
| placemat | placemat-packof6 | H-PLACE-6PK · default | 3425×2421 | 3425×2421 | 3425×2421 RGB @300 | yes (≤0.07%) | PASS |
| coaster | coaster-packof2 | H-COAST-2PK · default | 1251×1251 | 1251×1251 | 1251×1251 RGB @300 | yes (≤0.03%) | PASS |
| coaster | coaster-packof4 | H-COAST-4PK · default | 1251×1251 | 1251×1251 | 1251×1251 RGB @300 | yes (≤0.03%) | PASS |
| coaster | coaster | H-COAST-6PK · default | 1251×1251 | 1251×1251 | 1251×1251 RGB @300 | yes (≤0.03%) | PASS |
| coaster | coaster-packof1 | H-COAST-1PK · default | 1251×1251 | 1251×1251 | 1251×1251 RGB @300 | yes (≤0.03%) | PASS |
| socks | socks | GLOBAL-ANKLE-SOCKS · front | 3543×3543 | 3543×3543 | 3543×3543 RGB @300 | n/a (repeat pattern) | PASS |
| socks | socks-tube | GLOBAL-TUBE-SOCKS · default | 6141×5433 | 6141×5433 | 6141×5433 RGB @300 | n/a (repeat pattern) | PASS |
| heightChart | heightChart | POSTER-HANGER-20-CAN-ROL-SC-8X48 · default | 1200×7200 | 1200×7200 | 1200×7200 RGBA @150 | yes (≤0.04%) | PASS |
| heightChart | heightChart-30120cm-natural | POSTER-HANGER-30-CAN-ROL-SC-12X48 · default | 1800×7200 | 1800×7200 | 1800×7200 RGBA @150 | yes (≤0.04%) | PASS |
| heightChart | heightChart-20150cm-natural | POSTER-HANGER-20-CAN-ROL-SC-8X60 · default | 1200×9000 | 1200×9000 | 1200×9000 RGBA @150 | yes (≤0.07%) | PASS |
| heightChart | heightChart-30150cm-natural | POSTER-HANGER-30-CAN-ROL-SC-12X60 · default | 1800×9000 | 1800×9000 | 1800×9000 RGBA @150 | yes (≤0.04%) | PASS |
| kidsHoodie | kidsHoodie | HOOD-SS-STSK911 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| kidsHoodie | kidsHoodie-34years-cottonpink | HOOD-SS-STSK911 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| adultHoodie | adultHoodie-xs-white | HOOD-SS-STSU812 · front | differs by route | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | KNOWN (hidden — print-spec.test KNOWN) |
| adultHoodie | adultHoodie-xs-heathergrey | HOOD-SS-STSU812 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| teaTowel | teaTowel | H-TEATOWEL-SUB · default | 5492×8208 | 8208×5492 | 5492×8208 RGB @300 | n/a (repeat pattern) | PASS |
| kidsJumper | kidsJumper-34years-varsitygreen | SWEAT-SS-STSK913 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| kidsJumper | kidsJumper-34years-white | SWEAT-SS-STSK913 · front | 3070×3070 | 3070×3070 | 3070×3070 RGBA @300 | yes (≤0.05%) | PASS |
| christmasJumper | christmasJumper-s-firered | GLOBAL-SWEAT-AWD-JH030 · front | 4606×5787 | 4606×5787 | 4606×5787 RGBA @300 | yes (≤0.05%) | PASS |
| petBandana | petBandana | PET-BANDANA-SML · default | 7500×2244 | 7500×2244 | 7500×2244 RGB @300 | yes (≤0.04%) | PASS |
| petBandana | petBandana-medium | PET-BANDANA-MED · default | 9447×2952 | 9447×2952 | 9447×2952 RGB @300 | yes (≤0.04%) | PASS |
| petBandana | petBandana-large | PET-BANDANA-LRG · default | 10158×3306 | 10158×3306 | 10158×3306 RGB @300 | yes (≤0.05%) | PASS |
| playingCards | playingCards | PLAY-CARD · default | 820×1122 | 820×1122 | 820×1122 RGB @300 | yes (≤0.04%) | PASS |
| wrappingPaper | wrappingPaper | WRAP-ROL-70X200 · default | 4133×11811 | 4133×11811 | 4133×11811 | n/a (repeat pattern) | PASS |
| wrappingPaper | wrappingPaper-2mroll-kraft | WRAP-KFT-ROL-70X200 · default | 8280×23610 | 8280×23610 | 8280×23610 | n/a (repeat pattern) | PASS |
| wrappingPaper | wrappingPaper-3mroll-white | WRAP-ROL-70X300 · default | 4133×17716 | 4133×17716 | 4133×17716 | n/a (repeat pattern) | PASS |
| wrappingPaper | wrappingPaper-3mroll-kraft | WRAP-KFT-ROL-70X300 · default | 8280×35430 | 8280×35430 | **no file** (pixel limit) | n/a (repeat pattern) | FAIL 03-B4 |
| wrappingPaper | wrappingPaper-5mroll-white | WRAP-ROL-70X500 · default | 4133×29527 | 4133×29527 | 4133×29527 | n/a (repeat pattern) | PASS |
| wrappingPaper | wrappingPaper-5mroll-kraft | WRAP-KFT-ROL-70X500 · default | 8280×59070 | 8280×59070 | **no file** (pixel limit) | n/a (repeat pattern) | FAIL 03-B4 |
| phoneCase | 47 distinct print sizes (all 152 SKUs) | GLOBAL-TECH-* · default | = file, each | = Prodigi, each | = Prodigi, each, RGB @300 | yes (≤0.06%) | PASS (47/47) |

Bundle component packs are in the table above: `placemat` (4-pack) and `placemat-packof1/2/6`, `coaster` (6-pack) and `coaster-packof1/2/4`, `ceramicOrnament`, all 3425×2421 / 1251×1251 / 885×885 = Prodigi. The bundle line split is in the payload section.

Evidence images (560 px JPEGs of the actual print files, 4 placements each): `shots/03/` for the landscape frame (turned into Prodigi's portrait file), card spread, calendar page, DUAL cushion [front|back], height chart (ruler band + art), jigsaw portrait (turned), mug wrap, phone case, portrait blanket (turned), coaster, ornament, tea towel.

## Order payload (fulfilment path)

| check | result | evidence |
|---|---|---|
| sku = frozen spec's Prodigi SKU, per line | PASS | order-payload-sweep: mixed order (bundle for 4, calendar, jigsaw portrait, kids tee ×2, DUAL cushion) |
| copies = line qty | PASS | tee copies 2; bundle ornament lines grouped by drawing (copies 2 + 2) |
| `sizing: 'fillPrintArea'` on every item | PASS | same |
| attributes = catalogue `prodigiAttrs` (garment size + colour; none elsewhere) | PASS | same + quotes: 434/436 accepted by Prodigi (the 2 = 03-B5) |
| one asset per print area: `default` / `front` / `jigsaw`+`lid` (same file) / calendar cover + 12 months | PASS | same |
| Christmas bundle for 4 → 1× H-PLACE-4PK, 1× H-COAST-4PK, 4× XMAS-PORC-BAUB; lines sum to £145.00 exactly; coaster drawing ≠ placemat drawing honoured | PASS | same |
| Christmas bundle for 2 → H-PLACE-2PK, H-COAST-2PK, 2× ornament; £78.00 exactly | PASS | order-payload-sweep: "phone case … bundle alone" |
| expandBundle sums exactly for every size × drawing mix × odd prices; N placemats + N coasters + N ornaments | PASS | print-sweep-03 |
| card pack of 5 (2+3 designs) → two CLASSIC-GRE-FEDR-7X5-BLA items, copies 2 and 3, blank inside, £12.00 | PASS | order-payload-sweep |
| shipping method: Standard; Express when a phone case is in the order (one method per order) | PASS | order-payload-sweep + `resolveShippingMethod` |
| labs per product (sandbox quote, GB) | PASS (as designed) | see "labs" below |
| distinct print file per line | **FAIL 03-B1** | two placements / two messages → one URL |
| real sandbox **order** submission + Prodigi downloading the asset | **BLOCKED** | asset URLs are local MinIO presigned URLs Prodigi can't reach; no sandbox order was created. Shape validated by quotes + fake transport instead. |

**Labs and services (sandbox quotes, GB, the method we send):** frames and height charts prodigi_gb3 (Evri Next Day / DPD); jigsaw gb3 (Evri Standard 48); mug, tees, hoodies, kids jumper, sack, ornament, placemats, coasters, socks, tea towel, bandana uk9 (Royal Mail Tracked 48); cushions, blanket, apron uk3 (FedEx Tracked & Signed); baby bodysuit uk2 (RM First Class); christmas jumper uk2 or uk9; calendar uk15 ("Mixed"); phone cases uk6 (RM Tracked, Express); card uk7 (Guernsey Post, untracked); bauble and playing cards uk5 (RM24, untracked); wrapping paper prodigi_gb2 (RM24, untracked). All GB. The untracked ones match decisions already in `catalogue.ts` comments, so nothing new.

## Coverage checklist

| # | item | verdict | evidence |
|---|---|---|---|
| 1 | Fresh Prodigi sandbox spec vs committed fixture (216 SKUs) | PASS | px identical for all; only attribute listings changed (blankets now list `color: white`; baby 18–24 m gained black/red GB routes). Quotes without the blanket colour still succeed. |
| 2 | Every variant's first print area = Prodigi (existing print-spec guard) | PASS | print-spec.test.ts green |
| 3 | Every area in `printTo` = Prodigi | PASS (1 documented exception) | print-sweep-03: only the jigsaw lid (869×674 vs 2952×2362, Prodigi trims ~3% of the lid height; noted in catalogue.ts) |
| 4 | Required Prodigi areas all filled (jigsaw+lid, calendar 13; back cover, garment back and book cover/spine optional) | PASS | sandbox `printAreas.required` read 29 Oct; print-sweep-03 |
| 5 | `BUNDLE_PIECE_GEOM` = seeded templates = Prodigi | PASS | print-sweep-03 |
| 6 | gateDpi: garments, big frames and sack made at 300 dpi but judged at 150 | PASS | print-spec.test.ts (gate never stricter than before) |
| 7 | Frames 11×14 / 12×16 (+ black/white 3614×4795) / 18×24 / 24×32, portrait and landscape: file px | PASS | results table |
| 8 | Frames: render at any allowed placement | **FAIL 03-B3** | 24×32 at 1.5× zoom |
| 9 | Landscape frame / portrait jigsaw / portrait blanket / tea towel turned 90° back to Prodigi's orientation, markers correct | PASS | results table + shots |
| 10 | Mug (7 colour SKUs, 2480×1122 wrap) | PASS | results table |
| 11 | Cushions: heart, round, 12″/22″ single, DUAL [front\|back] double-wide | PASS | results table + shots |
| 12 | Kids/adult tee, kids/adult hoodie, kids/christmas jumper, baby bodysuit: full-size see-through file, light and dark colours | PASS (adult hoodie and baby 18–24 m = KNOWN, hidden) | results table |
| 13 | Jigsaw 30/110/252 × both orientations | PASS | results table |
| 14 | Blanket medium/large × both orientations | PASS | results table |
| 15 | Greetings card spread 6120×2160 (design on outer front, logo on rear) | PASS | results table + shots |
| 16 | Card: preview = print | FAIL (minor) 03-B2 | ≤19 px |
| 17 | Card pack 5/10 (same spread, blank inside) | PASS | results table + payload |
| 18 | Calendar A5/A4: 13 pages, gallery 1 cm margin, page px | PASS | results table + payload (13 areas) |
| 19 | Apron child/adult | **FAIL 03-B3** (child PASS; adult fails at 1.5×) | results table |
| 20 | Ceramic ornament 885², bauble 1003×1062, sack 3779×5905 | PASS | results table |
| 21 | Placemat packs 1/2/4/6 (3425×2421), coaster packs 1/2/4/6 (1251²) | PASS | results table |
| 22 | Phone cases: all 152 SKUs = 47 distinct sizes | PASS | results table (47/47) |
| 23 | Socks ankle (`front`) / tube (`default`): repeat pattern, px | PASS | results table |
| 24 | Height charts ×4 sizes: ruler band + art area, markers in art area | PASS | results table + shots |
| 25 | Wrapping paper white 2/3/5 m and kraft 2 m | PASS | results table |
| 26 | Wrapping paper kraft 3 m / 5 m | **FAIL 03-B4** | no file |
| 27 | Tea towel (designed landscape, turned) | PASS | results table |
| 28 | Pet bandana ×3, playing cards | PASS | results table |
| 29 | Storybook A5/A4 file px | PASS | results table |
| 30 | Storybook orderable at Prodigi | **FAIL 03-B5** (hidden) | quote 400 InvalidPageCount |
| 31 | No transparent / blank margin on a covered fill | PASS | zoom+pan edge check on every non-garment, non-gallery file |
| 32 | Format / colour space Prodigi accepts (PNG, sRGB) | PASS | every file |
| 33 | Studio edits present in the print (design derivative via `sourceObjectId`) | PASS | sweep: cobalt-centred design prints, black original does not |
| 34 | Rotation 90/270 + fit vs fill + zoom/pan: marker positions = positioner CSS | PASS | ≤0.07% everywhere (card 0.31% → 03-B2) |
| 35 | Preview geometry code (Positioner `imgStyle` / `bdImgStyle`, CalendarFlipPreview `galleryRect`, bundle builder `placeOf`) = print geometry | PASS (code read) | all go through `computeLayerRect` / `galleryRect`. The bundle builder and the order both use `defaultTransformFor(piece)`. |
| 36 | Order payload: sku, copies, fillPrintArea, attributes, assets per area | PASS | order-payload-sweep |
| 37 | Christmas bundle expands to the right lines; shares sum exactly | PASS | order-payload-sweep + print-sweep-03 |
| 38 | Card pack split into lines | PASS | order-payload-sweep |
| 39 | Shipping method per order (Express with a phone case) | PASS | order-payload-sweep |
| 40 | Every orderable SKU + attributes accepted by Prodigi (quote) | PASS 434/436 | the 2 = 03-B5 |
| 41 | One distinct print file per line / order | **FAIL 03-B1** | — |
| 42 | Sandbox order submission + asset download | BLOCKED | local MinIO URL not reachable by Prodigi |
| 43 | Physical colour / print quality | NOT TESTABLE LOCALLY | needs real prints |
| 44 | Which way Prodigi hangs a landscape frame (we turn the file 90° clockwise) | NOT TESTABLE LOCALLY | needs a sample; symmetrical frame, so low risk |
| 45 | Prodigi's max asset file size vs the 2 m kraft roll (195 MP PNG) | NOT TESTABLE LOCALLY | needs a reachable URL |
| 46 | Positioner pixels in a real browser at 390 / 1280 px | NOT TESTABLE LOCALLY (here) | maths verified against the print; on-device UI is the Studio / customise testers' area |

## What I couldn't test, and why

- **A real sandbox order and Prodigi downloading the file:** BLOCKED. The ingest URL is a presigned URL on `localhost:9000`, which Prodigi can't reach, so the order shape was validated without creating anything. I used read-only quotes for every SKU + attributes + print areas, and the fake transport for the full payload. The existing `sandbox-live.int.test.ts` (env-gated) can submit one if the founder wants it.
- **Printed output** (colour, sharpness, the gold frame etc.): needs physical samples.
- **Landscape-frame hanging direction, and the jigsaw lid crop on a real tin:** needs samples. Both are documented choices in the code.
- **Browser rendering of the positioner:** I compared the positioner's CSS maths (the `<img>` box from `computeLayerRect`, CSS `rotate()` clockwise) with the real file, not screenshots of the page. CSS `rotate(+90deg)` and sharp `.rotate(90)` are both clockwise; the markers confirm it.

## Notes for whoever fixes these

- 03-B1: the fix touches `render.ts` (key), `worker.ts` `renderedTwin`, and `keepsakeCopy.ts` / retention if they enumerate `printfile-` keys. Keep the deterministic key idea, but include a placement/source/message hash.
- 03-B3 / 03-B4: one helper that never decodes more than the canvas would fix both. Crop the source window first, then resize; for patterns, write the tiled roll in strips, or set `limitInputPixels` and accept the memory. Add a server-side guard in `placeOrder` too, so an un-renderable placement is refused before payment, as the DPI gate is.
- The `it.fails` tests flip to plain `it` once each bug is fixed. They fail today for exactly the stated reason: I probed each with a plain `it` and saw identical keys, a changed sha256 and "Input image exceeds pixel limit".
