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
