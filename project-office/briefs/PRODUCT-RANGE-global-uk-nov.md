# New products made in the UK after Prodigi's "global" change (checked 5 Nov 2026)

Source: prodigi.com/products/global (Prodigi announced that more ranges now ship from the lab nearest the
customer). Every figure below is from Prodigi's **sandbox** API on 5 Nov 2026: GET /products (exact print
sizes) and POST /quotes (UK address, Standard post). Costs are ex-VAT, before our card fee etc.
Price guide: P ≈ (1.03 × landed cost + £0.75) / 0.61, which gives roughly 20% net after every cost.

| Candidate | Prodigi SKU(s) | UK lab | Print file(s), px | Cost + post | Price for ~20% net | Notes |
|---|---|---|---|---|---|---|
| Multi photo frame 12×12″, no mount — 9 photos (3×3) | GLOBAL-MPF-12X12 | prodigi_gb3 | default 3543×3543 | £28.00 + £7.85 | ~£62 | One print file; we compose the grid: 60×60 mm photos, 20 mm gaps (Prodigi spec). 8 frame colours. |
| Multi photo frame 16×16″, mounted — 16 photos (4×4) | GLOBAL-MPFM-16X16 | prodigi_gb3 | default 4724×4724 | £39.00 + £7.85 | ~£80 | Mount windows must line up: needs Prodigi's template. |
| Multi photo frame 12×18″, mounted | GLOBAL-MPFM-12X18 | prodigi_gb3 | default 3543×5314 | £35.00 + £10.75 | ~£79 | As above. |
| Multi photo frame 20×30″, no mount | GLOBAL-MPF-20X30 | prodigi_gb3 | default 5905×8858 | £47.00 + £12.45 | ~£100 | Large; up to ~54–60 photos. |
| Softcover photo book A5 / square / A4, 24 pp | BOOK-FE-A5-P-SOFT-G, BOOK-FE-8_3-SQ-SOFT-G, BOOK-FE-A4-P-SOFT-G | uk15 | pages 1748×2480 / 2480×2480 / 2480×3507; cover + spine areas | £7.02–£7.56 + £6.50 (40 pp: £9.10–£9.80) | ~£24 | Prodigi needs pageCount and **PDF** files (we have no PDF library yet). |
| Hardcover photo book A5 / square / A4, 24 pp | BOOK-FE-A5-P-HARD-G, BOOK-FE-8_3-SQ-HARD-G, BOOK-FE-A4-P-HARD-G | uk15 | as above | £8.00–£10.00 + £6.50 (40 pp: £10.24–£13.04) | ~£26–£29 | Same build as softcover; un-pauses the storybook (sweep 03-B5). |
| Spiral notebook A4 (custom cover) | NB-LINED-A4, NB-GRAPH-A4 | prodigi_gb2 | default 2503×3531 | £9.00 + £5.35 | ~£25 | **A5 is not available** (NB-*-A5 → 404). One cover image. |
| Apple Watch strap 38 mm / 42 mm | GLOBAL-TECH-AP-WS-FL-38MM / -42MM | uk6 | default 305×2738 | £22.00 + £4.00 | ~£45 | Faux leather. 38 mm fits 38/40/41 mm watches; 42 mm fits 42/44/45/49 mm. |
| iPad case | GLOBAL-TECH-IPAD-… | — | — | — | — | **Only iPad 2/3/4 and iPad mini 1 (2011–13).** Not worth adding. |
| Baby tee 3–24 months (LAT 3322) | GLOBAL-TEE-RS-3322 | uk2 | front/back 1770×1770 | £9.00 + £2.35 | ~£20 | 12 colours, 4 sizes. |
| Toddler tee 2Y, 4Y (LAT 3321) | GLOBAL-TEE-RS-3321 | uk2 | front/back 3060×3780 | £9.00 + £2.35 | ~£20 | 19 colours. Fills the gap below our kids tee. |
| Baby bodysuit, long sleeve (LAT 4411) | GLOBAL-BB-RS-4411 | uk2 | front/back 2130×2130 | £10.00 + £2.35 | ~£22 | **Already built** (babyBodysuit, £22) but hidden: waiting for a packshot. |
| Baby bodysuit, short sleeve (LAT 4424) | GLOBAL-BB-RS-4424 | — | — | quote: NotAvailable (first colour) | — | Re-check other colours before relying on it. |
| Kids tee 6–10Y (LAT 6101) | GLOBAL-TEE-LAT-6101 | uk2 | 3060×3780 | £9.00 + £2.35 | — | Overlaps our kids tee (Stanley/Stella, £18). Skip. |

Christmas: uk2 (garments) and uk9 close 12 Dec on Standard (src/lib/season.ts); uk15 (books) 11 Dec in our
table; gb3 (frames) 14 Dec in our table (Prodigi: framed prints 17 Dec). Books take 96–120 h to make.

Every new product also needs the founder's layered product photos (packshots) before it goes on show —
the same reason the baby bodysuit and hoodies are hidden today.

## Built (5 Nov 2026): baby tee, toddler tee, both bodysuits, the watch strap — hidden until the photos are in

Re-checked in the sandbox the same day, every size × colour (POST /quotes to GB, Standard). What changed from the table above:
- **Watch strap 42 mm** is 363×2932 px (only the 38 mm is 305×2738). Both go Royal Mail **Standard Tracked** from uk6
  (£4.00; a second strap +£0.50) — tracked, so no Express. Shown as **small** (38, 40, 41 mm and the 42 mm Series 10+)
  and **large** (44, 45, 46, 49 mm and the 42 mm Series 1–3). One print file covers both halves; the middle fifth sits
  behind the watch and doesn't print — the placement screen shades it, and the drawing starts just below the watch.
- **Toddler tee**: Prodigi's UK lab makes only 1–2 and 3–4 years. Pink, light blue (Canada) and yellow, grass, slate
  (Australia) are left out. It's its own product, not extra sizes on the kids tee (different tee, print shape, colours,
  price, lab and post).
- **Baby tee**: navy left out (two sizes list a different print area). 8 colours, newborn to 18–24 months.
- **Long-sleeve bodysuit**: now 6 colours (£9 white / £10 colours). No heather in newborn; 18–24 months only in light
  pink and navy until Prodigi says which print file its UK lab uses for the others (two are listed).
- **Short-sleeve bodysuit**: added — made in the UK in 8 colours, but **not white** (Prodigi makes white in Canada).
- All the baby/toddler clothes go Royal Mail 1st Class (untracked) from uk2: the shop says "free delivery", not "tracked".
  Last order for Christmas: 12 Dec (strap too).

Prices: baby tee, toddler tee, short-sleeve bodysuit £20; long-sleeve bodysuit £22; strap £45 (each ~19–20% net; the
multi-buy tiers they get are 10% for two, 15% for three or more, all ≥15% net).

### What the founder sends, to switch each one on
Drop these into `.prodigi-assets/blanks/founder-raw/`, run `node scripts/compose-founder-layers.mjs`, then seed the
mockups. Cut-outs on a transparent background, straight-on, the print-area file on the SAME canvas as its photo.
- `baby-tee.png` + `baby-tee-print.png` (a white rectangle where the 15 × 15 cm print sits)
- `toddler-tee.png` + `toddler-tee-print.png` (26 × 32 cm print)
- `baby-bodysuit.png` + `baby-bodysuit-print.png` (long sleeves; 18 × 18 cm print)
- `baby-bodysuit-short.png` + `baby-bodysuit-short-print.png` (short sleeves; 21 × 30 cm print)
- One WHITE garment each is enough — every colour is made from it. A real photo of a colour, named like
  `baby-tee-light-blue.png`, is used instead whenever it's there.
- Strap, per size (`small`, `large`): `watch-strap-small.png` (strap laid straight, buckle half on top, the watch
  face-up in the middle), `watch-strap-small-print.png` (just the two leather halves), `watch-strap-small-watch.png`
  (the watch + buckle, laid over the drawing). Until then the strap shows a drawn strap that's true to Prodigi's template.
Then flip `visibleInShop` in src/server/catalogue.ts, move its page copy from `WAITING_FOR_PHOTOS` into
`SHOP_PRODUCTS` (src/lib/shop-products.ts), add it to the /christmas/delivery-dates list, and reseed.
