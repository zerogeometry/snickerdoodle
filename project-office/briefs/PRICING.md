# Pricing — formula, data, and build spec

> Founder-approved (2026-06-30). Turns Prodigi's costs into retail prices server-side.

## The formula (per SKU variant)
Inputs: Prodigi **product cost** `C` (ex-VAT, GBP — convert EUR-sourced items), Prodigi **Standard
tracked first-item shipping** `S` (ex-VAT, GBP), Stripe fee (1.5% + £0.20, charged on the
VAT-inclusive total), VAT 20%, target **25% margin on ex-VAT revenue**.

```
exVAT_retail = (C + S + 0.20) / (1 − 0.25 − 0.018)      # 0.018 = 1.5% Stripe × 1.20 (gross)
shown_price  = roundUpToX9( exVAT_retail × 1.20 )        # VAT-inclusive, ends in .x9
```
`roundUpToX9(p)` = ceil((p+0.01)/0.10)·0.10 − 0.01  (e.g. £12.43 → £12.49, £12.50 → £12.59).

**Worked example — men's tee STTM559, white/M:** C £12.00 + S £4.30 + £0.20 → ÷0.732 = £22.54 ex-VAT
→ ×1.20 = £27.05 → **£27.09**. Check: ex-VAT take £22.58 − £12 − £4.30 − Stripe £0.61 = £5.67 = **25.1%**. ✓

## Shipping model (founder-confirmed)
- **Free Standard tracked delivery**, baked into each product price (the `S` above). No shipping line.
- Prodigi discounts multi-item orders ("Plus one shipping price" ≈ £1/extra item), so multi-item
  baskets cost us less than we baked in → **bonus margin, never a loss.**
- **Premium postage = paid upgrade** (Express/Overnight) at checkout, priced as the *extra* over
  Standard, marked up to carry margin. Captured from the sheets; checkout selector is a later piece.
- **Parked:** "free shipping over £X" threshold analysis — only relevant if we switch to charge-and-waive
  instead of bake-in. Model break-even + AOV uplift when the founder's ready.

## Cost data
- **Source:** Prodigi public price sheets, `https://prodigipricingpublic.blob.core.windows.net/public/live/prodigi-{category}-{subcategory}-gb.csv`
  (no auth). Category/subcategory slugs = the dashboard Pricing dropdowns, lowercased, spaces→hyphens,
  **`&` kept literally** (e.g. `home-&-living`, URL-encode as `%26`). Re-pull to refresh costs.
- **Captured:** `.prodigi-assets/pricing/` (gitignored) — 36 sheets, ~104k rows, all categories incl.
  apparel. Columns vary by category (apparel adds Color/Size/Edge/Gender/Style/Brand), so **parse by
  header, not column index**; filter to destination GB + the chosen shipping method. (`(1)` dupes +
  `acrylic-prism` placeholder can be ignored.)
- **Slug discovery = the dashboard `Download price sheet` link's `href`.** On dashboard.prodigi.com/pricing
  the download link's href IS the exact blob URL and updates live as the Category/Subcategory/Shipping
  selects change — set the selects (via `form_input` on the native `<select>`s), read the href, done. No
  more guessing. The blob is public (no auth); navigating a browser tab to the href downloads the CSV.
- **Pulled 2026-07-01 (the founder's 15):** storybook → `books-%26-magazines-hardcover-books`
  (SKU `BOOK-FE-A4-P-HARD-G`, +A5); jigsaw → `sports-%26-games-jigsaws` (`JIGSAW-PUZZLE-30/110/252`,
  each *in a metal tin*); keepsake box → `home-%26-living-metal-tin` (`MET-TIN-REC` + `MET-TIN-ROU`,
  NOT `PERSONALISED-TIN`).
- **Baby bibs are Prodigi US-ONLY** — `apparel/Baby Bibs` offers no GB (or any non-US) shipping
  destination, so there is NO `-gb` sheet. Baby *bodysuits* ship GB fine. For a UK bib we'd need a
  second POD supplier (Gelato/Printful) or drop it. Dropped from the 15's pricing; bodysuit kept.
- **Note:** for jigsaw + metal tin the *Standard* shipping tier is "Not Tracked" (Express/Overnight are
  tracked). The generator bakes in Standard for consistency; founder may prefer baking in a tracked tier
  for these two.
- **Still un-pulled (not in the 15):** Pets→dog bandana, Stickers→wall stickers (kiss-cut is in
  `stickers-stickers`), Stationery→invitations. Glow poster likely inside `wall-art-framed-prints`.

## VAT
Snickerdoodle is **VAT-registered**: Prodigi's input VAT is reclaimable (costs are ex-VAT), output VAT
is charged on retail (not revenue → margin is on ex-VAT), shown prices are VAT-inclusive.

## Build plan
1. Parser (header-driven) → for each user SKU, pull GB Standard cost + first/plus-one shipping per tier.
2. `computeRetail(costPence, shipPence)` in `src/pricing` implementing the formula above (+ EUR→GBP).
3. Compute retail for every variant; load the 40 products **inactive** for founder approval before live.
4. Premium-tier upgrade prices computed + stored for the checkout selector (later).
