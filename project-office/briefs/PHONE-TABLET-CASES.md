# Phone + tablet cases — how to add them (explored 2026-10-21)

> Founder asked: add printed phone and tablet cases. Checked against Prodigi's product pages AND
> our sandbox API (real SKUs, print sizes, quotes to a GB address). Short version: **phone cases
> yes, through Prodigi, made in the UK; tablet cases not yet** — nobody we're contracted with makes
> a case that fits a current iPad.

## 1. What Prodigi offers (verified)

| Product | Fits | Made for UK orders | Cost (ex-VAT) | Verdict |
|---|---|---|---|---|
| **Snap case** — slim one-piece polycarbonate shell, printed all the way round the edges (dye-sub), gloss or matte | iPhone 8 → iPhone 18 Pro Max (incl. 16e, 17 Air); Samsung Galaxy Note 10 → S26 Ultra | **UK lab (uk8)** | **£9.50** | ✅ launch |
| **Tough case** — the same printed shell + a black shock-absorbing inner liner; MagSafe versions for iPhone 16/17/18 Pro | iPhone 8 → 18 Pro Max; Galaxy S9 → S26 Ultra; **Pixel 6 → 9 Pro XL** | **UK lab (uk8)** | **£11.50** | ✅ launch |
| Folio wallet case — faux-leather, UV printed front | iPhone 8 → 16 Pro Max (+18 Pro), Galaxy S9–S25 | UK | £14.50 | later, maybe (busier product, fewer models) |
| iPad case — hard shell | **iPad 2/3/4 and iPad mini 1 only** (no current iPad in the API) | — | — | ❌ fits nothing a family owns today |
| Laptop / tablet sleeve — padded, front printed | 12″ / 13″ / 15″ | **US only** (lab us15) | £15.68 + **£16.09 postage**, no tracked option | ❌ the picture would leave the UK, slow, costly |

Real SKUs look like `GLOBAL-TECH-IP16-CS-G` (iPhone 16 snap, gloss), `GLOBAL-TECH-IP16-TCB-CS-G`
(tough), `GLOBAL-TECH-SGS25-CS-G` (Galaxy S25). One SKU per **model × style × finish**.

**Print file per model** comes from the API: e.g. iPhone 16 snap 1209 × 2049 px, iPhone 17 tough
1266 × 2121 px (≈300 dpi on a ~4 × 7″ wrap). Small — almost every upload clears our print-quality
rule, so the "too small to print well" message will rarely appear.

## 2. Delivery — a decision for Simon

Our checkout sends everything **tracked** (`resolveShippingMethod`). For cases Prodigi's options
to a GB address are:

| Method | Carrier | Postage | Tracked |
|---|---|--:|---|
| Budget | Royal Mail 48 | £1.75 | no |
| Standard | Royal Mail 24 | £2.30 | no |
| Express | Royal Mail Tracked | £5.95 | **yes** |

Either keep the "always tracked" rule (Express, +£3.65 a case) or treat cases like greetings
cards (small, flat, untracked Royal Mail 24). Recommendation: **tracked** — a case is a £25+
gift and "where's my parcel?" is costlier than £3.65; it also keeps one rule for the whole shop.

## 3. Price (our usual formula, then rounded to the shop's style)

Formula used for the price list (free delivery baked in · 25 % margin ex-VAT · + VAT):

| | Untracked | Tracked |
|---|--:|--:|
| Snap | ≈ £18.89 | ≈ £24.79 |
| Tough | ≈ £22.19 | ≈ £27.99 |

Suggested shop prices: **snap £24.99, tough £29.99** (tracked). UK personalised cases sell at
roughly £20–£30, so this sits mid-market with free tracked delivery. Values are Simon's call.

## 4. The hard part is the phone picker, not the printing

- **Wrong model = a ruined, personalised, non-returnable case.** This is the #1 problem for case
  sellers. Design: a simple "which phone?" picker (brand → model, newest first, with a search),
  a clear "check: Settings → General → About → Model Name" hint, and the model repeated on the
  add-to-basket button and in the basket ("for iPhone 16"). We can *suggest* iPhone vs Samsung
  from the browser, never the exact model — the parent always picks.
- **Keep the list short at launch:** the last ~3 years of iPhone (13 → 17 + 16e) and Galaxy
  (S23 → S26), plus Pixel 8/9 in tough only. ~20 models × 2 styles × 1 finish ≈ 40 SKUs; more later
  is just seed rows.
- **One finish at launch** (gloss makes crayon colours pop; matte hides fingerprints) — halves
  the SKUs and the choices. Simon's call.
- **The camera hole.** Each model has a cut-out where nothing prints; a child's face shouldn't land
  in it. Prodigi publishes a free print template per model — I'd trace each cut-out once and show
  it on the preview (and nudge the placement), the same way the jigsaw lid and tee areas work now.
- **Drawings are wide, phones are tall.** Default to "the whole drawing on a background colour"
  (the Studio's background tool) rather than cropping half the picture away; the parent can zoom
  to fill. Edges wrap round the sides, so the safe area sits a few mm in from the edge.

## 5. Preview photos

We have no case blanks downloaded yet (`.prodigi-assets/blanks` has none). Prodigi's free
downloads include case product shots; the cases differ mostly by camera layout, so ~4 shapes
(iPhone single-row camera, iPhone Pro triple, Galaxy S vertical row, Pixel bar) cover the range,
each registered to its real print area per the onboarding brief (`MOCKUP-PRODUCT-ONBOARDING.md`).

## 6. Children's-data check

No new company sees anything: Prodigi is already our printer (same DPA work in Stage 2), the
cases are made in the **UK**, and the existing egress gate applies unchanged. (The US-made sleeve
would have been the problem — another reason to skip it.)

## 7. Tablets — what would it take

- Ask Prodigi whether a **current iPad case** (iPad 10/11, Air M2/M3, mini 6/7) is coming —
  their range pages hint at "iPad Air / mini" templates but the API has only old models.
- Otherwise a second UK maker (e.g. Contrado, who make tablet cases and sleeves) — but that's a
  whole new supplier: API, Article 28 DPA, no-retention/residency checks (see
  `CONTRADO-keepsake-box.md` §5). Not worth it for one product at launch.

## 8. If Simon says go — the build

1. Seed the case products + launch SKUs, each validated against the sandbox (as for every product).
2. Model picker on the customize page; model shown on button, basket, order and email.
3. Camera cut-out + wrap safe-area overlay per model; "whole drawing on a colour" default.
4. Preview blanks (4 shapes) registered to the print areas.
5. Delivery rule per the decision above (`resolveShippingMethod` + its test).
6. Tests: server pricing, SKU per model/style resolves server-side (never trust the client's
   model), print file at the API's exact pixel size, shipping rule; e2e: pick a phone → basket.
7. Order one sample of each style (Stage 5) before it goes on show (`visibleInShop`, D11).
