# Savings summary (public-safe — worked out by the coordinator from the private costs)

Exact per-item figures are in the founder's private file `.prodigi-assets/SOURCING-SAVINGS-2026-11-26.md`.
This note gives ONLY verdicts and rounded bands. Do not reverse-engineer or print Snickerdoodle's own costs.
"Saving per item" bands: small = under £2 · medium = £2–£5 · large = £5–£10 · very large = over £10.
Volume assumption: 200 orders a month (~227 items, mix assumed: frames lead, then mugs, tees, cushions, cards,
ornaments, calendars; it is an assumption, there is no sales data in the repo). Bands scale roughly with volume:
divide by 4 for 50 orders a month, multiply by 2.5 for 500.

## Ranked savings (£ a month at 200 orders; after any plan fee)

| # | Saving | £/month at 50 · 200 · 500 orders | Effort | Risk | When |
|---|---|---|---|---|---|
| 1 | **Prodigi Pro**, if the live account is not on it already (15% off products, 10% clothing; post full price; £35/month annual, £40 monthly) | ~£100 · ~£500 · ~£1,300 | 10 minutes, no code | none (cancel any time) | **now, before Christmas** (or the monthly plan for December only) |
| 2 | **Framed prints and multi frames to Gelato** (UK-made; per item: very large saving on 11×14″, 12×16″, 18×24″ and the 12×12″ multi; large on the 24×36″ multi and on 24×32″ with Gelato+ (24×32″ is dearer on the free plan); no 16×24″ size) | ~£75–£125 · ~£300–£500 · ~£750–£1,250 | high: new processor (stop-and-ask), DPA + UK-only routing in writing, samples, new fulfilment integration (webhooks have no signature check documented) | **no gold frame** (only white, wood, dark wood, black); 170gsm paper vs Prodigi's fine-art stock; Gelato can route abroad; frames are the flagship | **after Christmas** (Jan: samples + DPA questions; build Feb) |
| 3 | **Ask Prodigi for a bespoke frame price**, using Gelato's public prices as the benchmark (Pro can't stack with a bespoke deal, so only take it if it beats Pro on the whole basket) | ~£40–£60 · ~£150–£250 · ~£400–£600 (if Prodigi closes half the gap) | one email | none | **email now**, decide in January |
| 4 | **One Prodigi order per lab, each on its best shipping method**: phone case alone on Express, the rest Standard; playing cards and wrapping paper on Budget (wrapping paper's Budget is Evri 48, tracked, and cheaper than today's untracked Standard); ask whether socks can join the homeware parcel | ~£10 · ~£35–£40 · ~£90–£100 | medium code change in `submit.ts` (split + per-part method), check with Prodigi's quote API first; tests needed | low; more Prodigi orders per basket (more webhooks) | **after Christmas** (no fulfilment code changes in peak) |
| 5 | **Phone cases to Gelato or Podbase (Lithuania)** — medium saving per case; Gelato is dropping Samsung; Podbase EU→UK import VAT unclear | ~£10 · ~£40 · ~£100 | high (new processor, model list, print files per model) | Samsung range; data protection unknown for Podbase | later in 2027, only alongside #2 |
| 6 | **Calendars to Gelato** (A4 only, no A5; price unconfirmed) — medium per calendar, seasonal | ~£10 · ~£35 · ~£90 (Oct–Jan only) | high for a seasonal product | A5 gone | autumn 2027, only if Gelato is already set up for frames |
| 7 | **Ornaments, coasters, tea towels, socks to Inkthreadable** — medium saving on ornaments, coasters and tea towels, small on socks | ~£20 · ~£90 · ~£220 | high; Inkthreadable has no DPA (calls itself controller), no webhooks | breaks the one-parcel Christmas bundle (the bundle would cost more) | not recommended now |

## No saving found (Prodigi Pro is already as cheap or cheaper)

Mugs (Gelato, Inkthreadable, Tradeprint all land at about the same or more), kids tees (about the same), adult tees
(Prodigi cheaper), placemats (Prodigi cheaper), cushions (Contrado dearer; no UK API maker has the heart or 18″ round),
blankets, jigsaws (no 252-piece UK API maker; All Jigsaw Puzzles trade needs an account), playing cards (UK makers are
batch-only or dearer; MakePlayingCards/PrinterStudio are China), height charts (no dropship maker), wrapping paper
(Vistaprint has the roll but no API), the plastic bauble and the watch strap (no UK/EU dropship maker at all), greetings
cards (no 7×5″ printed-inside card by API; Gelato cards are A6/A5 packs of 10 of one design).

## Related, from the margins report (PR #97) — not a cost cut but money kept

- Fix the cost loader so the adult tee in navy/grey/khaki carries its real (higher) cost; today its buy-more-&-save is
  too generous. Small code change.
- Consider dropping the plastic bauble: high post share, untracked, dearest against the market.

## Data-protection fit (one line each, from data_protection.md)

- Prodigi: best fit — DPA (May 2026), no-AI-training clause, 45-day file deletion, but partners unnamed and multi-country.
- Gelato: Data Processing Terms, ISO 27001, AWS Ireland, printers delete within 14 days; routes to nearest printer, may be
  outside UK/EU; need written UK-only routing.
- Printful / Printify: US parents, licence to use uploads for promotion/improvement, Printify storage looks US → rule out.
- Inkthreadable, Contrado, theprintspace, CloudPrinter: no DPA found (they call themselves controllers) → not usable for
  children's images until they sign an Article 28 DPA.
- Peecho: part of the Prodigi group; unclear whether Prodigi's DPA covers it.
