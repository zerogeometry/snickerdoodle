# Printful and Printify as cheaper print-on-demand makers for a UK children's-drawing gift shop (researched 26 Nov 2026)

Conventions: all retrieval dates are 26 Nov 2026 unless stated. USD figures are converted at $1 = £0.79 and marked "(conv.)". Printful product prices below come from Printful's public, no-login catalogue API (`https://api.printful.com/products/{id}`), which returns USD base prices plus a per-variant `availability_status` list of regions (US, EU, EU_LV, EU_ES, UK, ...). Reading "UK" / "EU_LV" / "EU_ES" in that list as "this variant can be fulfilled from Printful's UK / Latvia / Spain facility" is my interpretation of the field. Printify per-provider product prices sit behind a login ("needs account"). Printify's per-provider UK shipping tables are public; they were parsed from the rendered HTML of each provider's printify.com/shipping-rates page.

## Q1. Printful: which products ship from UK/EU facilities to a UK customer; GBP prices; UK shipping; plans; branding costs

### Takeaway
About half the list is made in Printful's UK or EU sites:
- Framed posters (11×14, 12×16, 18×24 and 24×36, but no 24×32) and the colour-inside mug.
- Stanley/Stella kids Mini Creator 2.0 and adult Creator 2.0 tees.
- Snap and Tough phone cases.
- From Latvia only: 5×7 greeting cards, square cushions (14–22″), 30×40 and 50×60 blankets, and cork coasters.

These are made in the US only, which rules them out for children's images: jigsaws, 2027 wall calendars, ceramic ornaments, sublimated socks, tea towels, playing cards, wrapping paper and placemat sets. Printful has no collage frame, heart or round cushion, height chart, bauble or Apple Watch strap.

### Cited Findings
**Facilities**
- Printful runs in-house European production in Spain, Latvia and the UK — [Printful Europe fulfilment page](https://www.printful.com/europe-fulfillment-products).
- Printful's help centre puts the UK facility in Wolverhampton and says it fulfils only orders with UK delivery addresses. Riga (Latvia) handles apparel and warehousing, and Barcelona mainly serves Western Europe — [Printful help: European fulfilment centres](https://help.printful.com/hc/en-us/articles/360014067239-Where-are-the-European-fulfillment-centers-located) (via search snippet). Printify's listing of Printful's centres names the UK site "Birmingham" — [Printify: Printful shipping rates](https://printify.com/shipping-rates/printful).
- A Printful help article says warehousing (stored stock, pack-ins) will be discontinued at the Latvia, Spain, UK and Canada sites. It points sellers to partner Fulfillment-Box. No effective date was visible — [Printful help 21048694941340](https://help.printful.com/hc/en-us/articles/21048694941340) (via search snippet; not opened).
- Printful UK shipping page delivery times: "Standard DDP (3–7 business days after fulfillment)" for the UK; fulfilment takes 2–5 business days. Products fulfilled in different locations ship separately, and orders shipped from another region may incur customs or handling fees — [printful.com/uk/shipping](https://www.printful.com/uk/shipping).

**Prices and UK availability by product.** Catalogue fetched 26 Nov 2026 from [api.printful.com/products](https://api.printful.com/products); each product's detail is at `https://api.printful.com/products/{id}`.

*Framed prints* — Enhanced Matte Paper Framed Poster (in), id 2 ([api](https://api.printful.com/products/2)):
- 0.75″ Ayous wood frame, 189 gsm matte paper, "Acrylite front protector" (acrylic, so shatter-resistant glazing).
- EU blank components are sourced from Japan and Latvia.
- Black/White, available for UK, EU and EU_LV:

| Size | USD | GBP (conv.) |
|---|---|---|
| 11×14″ | $30.69 | £24.25 |
| 12×16″ | $32.20 | £25.44 |
| 18×24″ | $46.30 | £36.58 |
| 24×36″ | $75.90 | £59.96 |
| 24×32″ | not offered | — |

- The UK storefront shows "from £15.76" (smallest size) — [printful.com/uk/custom/product/2](https://www.printful.com/uk/custom/product/2).
- Premium Luster framed poster (id 172), UK-available: 11×14 $34.95, 12×16 $42.50, 18×24 $67.75, 24×36 $113.25 — [api](https://api.printful.com/products/172).
- Framed Canvas (id 614) does have 24×32″ at $100.75 (£79.59 conv.), available for UK and EU_ES — [api](https://api.printful.com/products/614).

*Multi-photo / collage frames* — no equivalent in Printful's catalogue. A keyword scan of the 588 products found none — [api.printful.com/products](https://api.printful.com/products).

*Two-tone mug* — "White Ceramic Mug with Color Inside", id 403 ([api](https://api.printful.com/products/403)):
- Coloured rim, inside and handle.
- 11oz $9.75 (£7.70 conv.), available for UK, EU, LV and ES.
- UK storefront price £7.13 — [printful.com/uk/custom/product/403](https://www.printful.com/uk/custom/product/403).
- A UK reviewer on that page says not all colours are available in the UK and some arrive from the USA.
- Plain white 11oz (id 19) is $6.50, UK-available — [api](https://api.printful.com/products/19).

*Cushions* — All-Over Print Basic Pillow, id 83 ([api](https://api.printful.com/products/83)):
- Sizes: 14″ $13.50, 16″ $14.50, 18″ $17.50 (£13.83 conv.), 22″ $19.95 (£15.76 conv.).
- Fulfilled in EU/EU_LV (and US), not the UK facility. EU components are sourced from China and Poland.
- Premium Pillow (id 214): 18″ $19.95, 22″ $22.25, EU_LV — [api](https://api.printful.com/products/214).
- No 12″ square, no heart and no round. The Custom Shaped Pillow (id 743) is US-only — [api](https://api.printful.com/products/743).

*Kids organic tee* — Stanley/Stella STTK184 Mini Creator 2.0, id 476 ([api](https://api.printful.com/products/476)):
- $14.95 (£11.81 conv.), ages 3-4 to 12-13. Available for EU, EU_LV, EU_ES and UK.
- DTG and embroidery; 155 gsm organic cotton; blank made in Bangladesh.
- UK storefront £12.19 — [printful.com/uk/custom/product/476](https://www.printful.com/uk/custom/product/476).

*Adult organic tee*:
- Stanley/Stella STTU169 Creator 2.0 (180 gsm, GOTS/OEKO-TEX), id 456: $13.95–$19.75 (£11.02 conv. for S–XL), available for EU, LV, ES and UK — [api](https://api.printful.com/products/456).
- The heavyweight Stanley/Stella Freestyler SATU018 (id 1657, $20.05) and Creator 2.0 ribbed-neck SATU001 (id 818) are US-only — [api](https://api.printful.com/products/1657), [api](https://api.printful.com/products/818).
- No Sparker was found in the catalogue.

*Jigsaws* — Jigsaw Puzzle with Tin, id 906: 30 or 110 pcs $18.00, 252 pcs $20.94. US-only; origin China — [api](https://api.printful.com/products/906). The boxless Jigsaw Puzzle (id 534) is also US-only — [api](https://api.printful.com/products/534). **Ruled out (US).**

*Blankets*:
- Throw Blanket (silk-touch polyester, one-sided print), id 395: 30×40″ $24.75 (£19.55 conv.), 50×60″ $25.50 (£20.15 conv.), EU/EU_LV; 60×80″ US-only — [api](https://api.printful.com/products/395).
- Sublimated Sherpa, id 711: 37×57″ $30.75, 50×60″ $36.25, EU/EU_LV — [api](https://api.printful.com/products/711).
- Note: neither is a true fleece.

*Greeting card* — id 568 ([api](https://api.printful.com/products/568)):
- 5×7″ $2.95 (£2.33 conv.); 350 gsm paperboard, toner print, free envelope.
- EU/EU_LV only, so it ships to the UK from Latvia.
- Printful does not offer packs of 5 or 10.

*2027 wall calendar* — id 1643: A4 (8.26×11.69″) $12.19, 11×17″ $19.33, US-only — [api](https://api.printful.com/products/1643). The other 2027 calendar (id 1656, $11.67) is also US-only — [api](https://api.printful.com/products/1656). **Ruled out (US).**

*Ornaments*:
- Ceramic Ornament (id 881) $6.15–6.34 and 2-side ceramic (id 900) $7.73: US-only, origin China — [api](https://api.printful.com/products/881), [api](https://api.printful.com/products/900). **Ruled out.**
- No plastic bauble.

*Phone cases*:
- Snap Case for iPhone (id 683) $16.75 (£13.23 conv.); Snap for Samsung (id 684) $16.75.
- Tough iPhone (id 601) and Tough Samsung (id 686) $18.25 (£14.42 conv.).
- All available for UK and EU; blank cases sourced from Korea — [api 683](https://api.printful.com/products/683), [api 601](https://api.printful.com/products/601).

*Sublimated socks* — id 882, $7.14, US-only — [api](https://api.printful.com/products/882). **Ruled out.**

*Tea towel* — Microfiber Tea Towel, id 1743, $10.10, US-only — [api](https://api.printful.com/products/1743). **Ruled out.**

*Playing cards* — Poker Playing Cards, id 1425, $13.96, US-only, origin USA — [api](https://api.printful.com/products/1425). **Ruled out.**

*Canvas height chart* — no equivalent.

*Wrapping paper*:
- Wrapping Papers (id 911): 30×180″ (~76 cm × 4.6 m) $20.53, US-only — [api](https://api.printful.com/products/911).
- Gift Wrap Papers (id 873) and Wrapping Paper Sheets (id 706) are also US-only.
- **Ruled out.**

*Placemats and coasters*:
- Placemat Set (4), id 709: $33.86, US-only, origin China — [api](https://api.printful.com/products/709).
- Cork-Back Coaster, id 611: $5.25 (£4.15 conv.), 95 mm MDF with cork back, EU/EU_LV — [api](https://api.printful.com/products/611).

*Apple Watch strap* — no equivalent in Printful's catalogue — [api.printful.com/products](https://api.printful.com/products).

**UK shipping (GBP, first item / each additional)** — [printful.com/uk/shipping](https://www.printful.com/uk/shipping):

| Category | First item | Each additional |
|---|---|---|
| T-shirts | £3.69 | +£1.20 |
| Kids/youth tees | £3.39 | +£1.20 |
| 11oz mugs | £4.09 | +£1.00 |
| Phone cases | £2.19 | +£0.80 |
| Coasters | £3.09 | +£0.70 |
| Framed posters, small | £5.19 | +£3.70 |
| Framed posters, medium | £15.59 | +£7.35 |
| Framed posters, large | £18.69 | +£9.75 |
| Throw pillows | £9.29 | +£4.00 |
| Blankets 30×40 / 50×60 | £5.19 | +£1.85 |
| Wall calendar | £17.69 | +£10.60 |
| Gift wrap | £13.59 | +£5.30 |
| Poker cards | £11.39 | +£4.10 |
| Ceramic ornaments | £7.49 | +£1.50 |
| Placemats | £8.39 | +£5.10 |

- The high calendar, wrap and cards rates fit US-origin shipping.
- The page does not say which framed-poster sizes fall in "small", "medium" and "large".
- A US-only holiday surcharge (15 Oct 2026 – 17 Jan 2027) does not apply to UK addresses.

**Plans and discounts**
- **Printful Growth** is £19.99/month with a 14-day free trial. It gives "up to 33% off custom premium products" (varies by product), 9% off product branding and 25% off sample orders. It becomes free for a year once yearly sales reach $12K — [printful.com/uk/plans](https://www.printful.com/uk/plans). The US price is $24.99/month — [search summary of printful.com/plans](https://www.printful.com/plans).
- "As of January 15" Growth replaced all previous paid memberships (Plus/Business) — [printful.com/uk/plans](https://www.printful.com/uk/plans). A third-party guide dates this to January 2026 — [podvector.ai](https://podvector.ai/articles/printful/costs-and-charges/printful-membership-cost-full-breakdown-for-pod-sellers).
- The volume-discounts page lists no thresholds or percentages; it only repeats the Growth perks — [printful.com/uk/volume-discounts](https://www.printful.com/uk/volume-discounts).

**Branding costs**
- Pack-ins: $0.50 / €0.45 picking fee per pack-in, plus a monthly storage minimum of USD 25 / EUR 22 / GBP 20 (US storage $0.70 per cu ft). Maximum pack-in size is 6×8×1″ and 2 oz — [Printful branded pack-ins (UK)](https://www.printful.com/uk/branded-packaging-inserts); [Printful help 360014007840](https://help.printful.com/hc/en-us/articles/360014007840) (both via search snippets; sources disagree on the per-item vs volume basis).
- Inside apparel label $0.99; outside label $2.49 — [printful.com/pricing](https://printful.com/pricing) (via search snippet).

**VAT**
- Printful is VAT-registered in the UK. UK orders fulfilled inside the UK carry 20% VAT on the order total; orders fulfilled outside the UK and shipped to the UK carry no VAT. A UK VAT ID can be added under Billing → Tax information — [Printful help: VAT on UK orders](https://help.printful.com/hc/en-us/articles/4408221934738-How-is-VAT-charged-on-my-UK-orders) (via search snippet).
- A UK Trustpilot reviewer (21 Nov 2026) complained about VAT charged per tee on top of postage — [uk.trustpilot.com/review/printful.com](https://uk.trustpilot.com/review/printful.com).

### Inferences
- Printful's UK-made set covers framed posters, colour-inside mug, Stanley/Stella tees and phone cases. Every UK-made item is in a category priced at or below a typical UK maker's trade price.
- 24×32″ framed paper is missing (24×36″ is offered instead), and there is no 24×32″ framed print. Only canvas comes in 24×32″.
- The Latvia-only items are greeting cards, cushions, blankets and coasters. They would ship to the UK as a separate parcel from UK-made items, so the shop would pay two "first item" rates.
- Printful's USD API prices and its GBP storefront prices differ: kids tee $14.95 → £11.81 by conversion vs £12.19 on the storefront; mug $9.75 → £7.70 vs £7.13. The real GBP billing price needs an account (v2 catalogue with `selling_region_name=uk`).
- Most Printful prices shown are ex-VAT. UK-fulfilled orders add 20% VAT unless the shop holds an approved VAT ID.

### Gaps
- GBP prices per size (the storefront only shows "from"), and whether Growth's "up to 33%" applies to any of these items: **needs account**.
- Whether the greeting card can be printed inside, and its shipping category: not stated in the API description.
- Whether the AOP pillows are printed on both sides: "all-over print cut-sew" suggests both sides, but this is not confirmed.
- How framed-poster sizes map to the small/medium/large shipping bands: not stated.
- The effective date of the end of warehousing (pack-ins) in the UK, Latvia and Spain: not found.

## Q2. Printify: UK-based print providers, products, Free vs Premium prices, UK shipping; EU second choice

### Takeaway
Printify's current UK-located providers are:
- Harrier (Devon; also Czech Republic)
- Print Clever (UK; also US)
- Shirt Monkey (UK)
- T shirt and Sons (Westbury, UK; also NL/Poland)
- Personalized Luggage (Leeds; luggage only)
- Multi-region providers with a UK site: Colorway, Jondo, Prodigi and Printful.

Three names in the brief are not UK providers: "Prima Printing" is Australian, "Duplium" is Canadian, and "OPT OnDemand" is Czech. Between them, UK providers cover most of the list. The UK gaps are the jigsaw, 12″/heart/round cushions, dated A4/A5 wall calendar, placemats, height chart, collage frame and Apple Watch strap.

Premium costs $39/month, or $299/year (≈$24.99/month), for "up to 20% off". Per-provider product prices need an account.

### Cited Findings
**Which providers are in the UK and EU.** Source: the provider list embedded in [printify.com/shipping-rates](https://printify.com/shipping-rates/), with per-provider pages linked below.

UK-located providers:
- **Harrier** — "United Kingdom, Devon" and Czech Republic. 17 products; ships with Whistl, Royal Mail and Deutsche Post — [printify.com/shipping-rates/harrier](https://printify.com/shipping-rates/harrier/).
- **Print Clever** — UK and US. 54 products; ships with Royal Mail, Amazon Shipping and Asendia — [printify.com/shipping-rates/print-clever](https://printify.com/shipping-rates/print-clever/).
  - Its UK centre carries the alt-label "eco-print-partner".
  - A separate "Eco Print Partner" page (Lancashire, UK; shirts $4.49 / +$1.09 to the UK) appeared in search — [printify.com/shipping-rates/eco-print-partner](https://printify.com/shipping-rates/eco-print-partner/) — but returned an empty page when fetched on 26 Nov 2026.
- **Shirt Monkey** — UK, 1 centre, 11 apparel products — [printify.com/shipping-rates/shirt-monkey](https://printify.com/shipping-rates/shirt-monkey/).
- **T shirt and Sons** — 50 products. Its location is given inconsistently:
  - the index says "United Kingdom, Westbury and Netherlands, Venlo";
  - its own page says "2 fulfillment centers in the United Kingdom and Poland" — [printify.com/shipping-rates/t-shirt-and-sons](https://printify.com/shipping-rates/t-shirt-and-sons/).
- **Personalized Luggage** — US (Massachusetts) and UK (Leeds); 2 products (suitcases and passport covers) — [printify.com/shipping-rates/personalized-luggage](https://printify.com/shipping-rates/personalized-luggage/).

Multi-region providers with a UK site:
- **Colorway** — US, UK and Australia; 34 products — [printify.com/shipping-rates/colorway](https://printify.com/shipping-rates/colorway/).
- **Jondo** — US, Canada, Australia, UK and Spain — [printify.com/shipping-rates/jondo](https://printify.com/shipping-rates/jondo/).
- **Prodigi** — US (North Carolina), UK (Hampshire), UK (Surrey) and Netherlands (Venlo) — [printify.com/shipping-rates/prodigi](https://printify.com/shipping-rates/prodigi/).

Printify's UK landing page names T shirt and Sons, Print Clever, Harrier, Expert Workwear, JONDO and Colorway (page modified 2026-10-29) — [printify.com/print-on-demand/uk](https://printify.com/print-on-demand/uk). "Expert Workwear" does not appear in the shipping-rates index.

Not UK providers: Prima Printing (Australia), Duplium (Canada) and OPT OnDemand (Czech Republic) — [printify.com/shipping-rates](https://printify.com/shipping-rates/).

EU-located providers (second choice):
- Textildruck Europa (Halle, DE)
- OPT OnDemand (CZ)
- Print Pigeons (Riga, LV)
- PH Print Norden (Riga, LV)
- Posterflow (Mannheim, DE)
- Atelier Katanga (Cornebarrieu, FR)
- MWW On Demand (Germany plus US/MX)

Source: [printify.com/shipping-rates](https://printify.com/shipping-rates/).

Outside the UK/EU, ruled out for children's images: ArtsAdd, Custom Luxe, PrintDoors, Smart Printee, Subliminator and SunFly are China-based; most other providers are US-based — [printify.com/shipping-rates](https://printify.com/shipping-rates/).

**Matching UK providers to the product list.** UK shipping is shown as USD first item / each additional item, with the provider's quoted delivery window. Each provider's figures come from its rate page linked above.

*Framed prints*:
- Print Clever "Framed Posters": UK $13.29–16.49 / +$1.00–1.99, 2–3 days.
- Jondo "Framed Paper Posters": UK $10.09–41.99 / +$4.59–19.29, 2–3 days.
- Prodigi "Fine Art Prints (Passepartout Paper Frame)": $9.79–10.49 / +$2.89–3.19.
- Price signal: Printify's "Framed Posters" listing printed by Print Clever shows "From USD 28.57, or USD 20.71 with Printify Premium" (33 sizes; ≈£22.57 / £16.36 conv.) — [printify.com/app/products/764/generic-brand/framed-posters](https://printify.com/app/products/764/generic-brand/framed-posters) (via search snippet; the page needs JavaScript or a login).
- A "Framed Posters, Matte" listing describes a "black Perspex picture frame" — [printify.com/app/products/1130](https://printify.com/app/products/1130/generic-brand/framed-posters-matte) (via search snippet).
- Wood frame and glazing specs per UK provider: **needs account**.

*Collage frame* — no UK/EU equivalent found.

*Two-tone mug*:
- Print Clever "Two-Tone Coffee Mugs, 11oz": UK $3.89 / +$2.99 (≈£3.07 / £2.36 conv.).
- Harrier "Accent Coffee Mug (11, 15oz)": UK $3.89 / +$1.29.
- Textildruck Europa (DE) "Two-Tone Coffee Mug, 11oz": UK $8.09 / +$1.69, 5–15 days.
- Product price: the Generic "Two-Tone Coffee Mug, 11oz" listing shows "from EUR 5.88" — [printify.com/app/products/1018](https://printify.com/app/products/1018/generic-brand/two-tone-coffee-mug-11oz) (via search snippet). The Print Clever price is unconfirmed.

*Cushions*:
- Print Clever "Square Pillow" and "Square Pillow – Pink Back": UK $7.89 / +$3.59.
- Colorway "Square Poly Canvas Pillow": $9.79 / +$9.39.
- No UK heart or round cushion was found. Sizes (12″/22″) and single/double-sided options: **needs account**.

*Kids organic tee*:
- T shirt and Sons "Kids' Creator T-Shirt" (a Stanley/Stella-style name): UK $3.59 / +$1.99.
- Shirt Monkey and Print Clever offer only Gildan kids tees ("Kids Heavy Cotton™ Tee", $3.59 / +$1.99).
- Price signal: the Gildan Kids Heavy Cotton Tee shows "From USD 6.97 / USD 6.61 with Premium" across 13 providers — [printify.com/app/products/kids-clothing/t-shirts](https://printify.com/app/products/kids-clothing/t-shirts) (via search snippet).

*Adult organic tee*:
- "Organic Creator T-shirt – Unisex" at T shirt and Sons and Print Clever: UK $3.59 / +$1.99.
- Shirt Monkey "Unisex Creator 2.0 T-shirt": $3.59 / +$1.99.
- T shirt and Sons "Men's Organic Tee".
- No Sparker-class heavyweight was confirmed.

*Jigsaws*:
- No UK provider offers jigsaws: Harrier's "Games, Puzzles" category holds only Poker Cards.
- Printify's "Jigsaw Puzzle with Tin" (30 to 2,000 pcs) is "From USD 18.00", provider not stated — [printify.com/app/products/532](https://printify.com/app/products/532/generic-brand/jigsaw-puzzle-with-tin) (via search snippet).
- **Treat as no UK/EU source until the provider is confirmed.**

*Fleece blanket*:
- Harrier "Arctic Fleece Blanket": 30×40″ (≈76×102 cm) UK $4.69 / +$1.29; 50×60″ $5.19 / +$1.29; 60×80″ $5.79 / +$1.99.
- Harrier Sherpa Blankets: 50×60″ $5.19.
- Colorway "Soft Polyester Blanket" and "Deluxe Sherpa Fleece": $8.29 / +$4.99.

*Greeting cards*:
- Print Clever "Greeting Cards (5 Pack)": UK $3.39 / +$1.09.
- EU alternatives: Print Pigeons (LV) "Greeting Cards (7 pcs)" $11.79 / +$2.49, 5–15 days; OPT (CZ) "Greeting Cards (8 pcs)" $6.59 / +$1.39.
- Card weight and inside printing: **needs account**.

*Calendars*:
- Harrier "Wall Calendars (Blank)": UK $3.89 / +$1.29.
- Harrier "Simplex Desk Calendar (2027 grid)": $4.59 / +$1.29.
- Print Pigeons (LV) "Photo Wall Calendar (Blank)": $34.99 / +$7.99.
- No dated 2027 A4/A5 wall calendar was confirmed from a UK provider.

*Ornaments*:
- Harrier "Ceramic Ornament, 2-Side Print": UK $3.59 / +$0.99.
- Colorway "Ceramic Ornaments, 1-Side / 2-Side Print": $3.99 / +$0.99.
- Prodigi "Christmas Baubles": $6.49 / +$2.19 (material not shown).

*Phone cases*:
- Prodigi "Slim Snap Case": UK $4.09 / +$0.89.
- No UK Tough case was found.

*Socks*:
- Colorway "Mid-length Socks": $5.99 / +$2.99.
- Textildruck Europa (DE) "Sublimation Crew Socks (EU)": $6.39 / +$1.19.

*Tea towel*:
- Colorway "Waffle Double-Sided Tea Towel": $5.69 / +$2.99.
- Textildruck Europa (DE) "Cotton Tea Towel": $7.29 / +$1.19.

*Playing cards* — Harrier "Poker Cards": UK $4.59 / +$1.29.

*Height chart* — no equivalent.

*Wrapping paper*:
- Print Clever "Wrapping Papers": $5.99 / +$1.99.
- Prodigi "Gift Wrapping Paper Rolls, 1pc": $11.39 / +$1.89.
- Roll lengths (2/3/5 m): **needs account**.

*Placemats and coasters*:
- Print Clever "Coaster": $3.39 / +$1.09.
- Colorway "Corkwood Coaster Set": $6.19 / +$2.99.
- No UK placemat was found (Colorway has napkins and tablecloths only).

*Apple Watch strap* — no UK/EU provider found.

**Premium plan**
- Free plan: $0. Premium: $39/month billed monthly, or $24.99/month billed as $299/year (the page says yearly saves 36%). Premium gives "up to 20% off most Catalog products" and up to 33% off newly launched products and neck labels, with a 10-store limit. Enterprise: custom pricing and API, plus bulk discounts on 100+ eligible products. Page modified 2026-11-25 — [printify.com/pricing](https://printify.com/pricing/).
- Observed Premium savings in snippets:
  - Print Clever framed posters: $28.57 → $20.71 (−27.5%), above the headline "up to 20%".
  - Gildan kids tee: $6.97 → $6.61 (−5%).
  - Source: [Printify posters category](https://printify.com/app/products/home-and-living/posters), [kids tees](https://printify.com/app/products/kids-clothing/t-shirts) (via search snippets).

### Inferences
- The UK shipping rates that Printify UK providers quote to the shop (≈$3.39–4.69 first item for most small goods, ≈£2.70–3.70 conv.) are similar to Printful's UK rates. They are much lower than the rate Printful charges for its US-made paper goods.
- Print Clever alone covers framed posters, two-tone mug, square cushion, greeting card 5-pack, coasters, wrapping paper, and kids and adult tees. That makes it the best single UK provider for a combined parcel on Printify.
- Harrier is the best UK fit for blankets, ornaments, playing cards and calendars.
- Several "UK" providers also run US or Czech/NL/Polish sites: Print Clever (US), Harrier (CZ), T shirt and Sons (NL or PL), Colorway (US/AU), Jondo and Prodigi. The shop would need written confirmation that UK orders, and the image files, are only routed to the UK site.

### Gaps
- Per-provider base prices on the Free and Premium plans for every item: **needs account**. The public catalogue pages render client-side.
- PH Print Norden's rate page did not load, and Eco Print Partner's page was empty.
- No UK source was confirmed for: jigsaw, heart/round cushion, 12″ cushion, dated A4/A5 wall calendar, placemats, height chart, collage frame and Apple Watch strap.

## Q3. Can either combine different products into one UK parcel?

### Takeaway
Only partly. Printful combines items made at the same facility: the UK site in one parcel, Latvia in another. Printify combines only items from the same provider (and in practice the same site), so a mixed basket across Print Clever, Harrier and Colorway arrives as three parcels with three first-item charges.

### Cited Findings
- Printful: "products fulfilled in different locations ship separately" — [printful.com/uk/shipping](https://www.printful.com/uk/shipping).
- Printful's rule for mixed categories: use the highest single-product rate as the base, then add each further item's additional-item rate — [Printful help 20583931065372](https://help.printful.com/hc/en-us/articles/20583931065372-How-do-I-calculate-shipping-costs-for-different-types-of-orders) (via search snippet).
- Printify items from different providers "can ship separately", and each provider has its own shipping prices and times — [Big Cartel help: Printify shipping](https://www.bigcartel.com/resources/help/article/setting-up-shipping-for-printify) (via search snippet).
- Printify shipping profiles are set per blueprint and per provider (first item / additional item by country) — [developers.printify.com](https://developers.printify.com/).
- Printify Choice automatically fulfils from the centre closest to the customer when a provider has several, which limits control — [Printify help 4483623864593](https://help.printify.com/hc/en-us/articles/4483623864593) (via search snippet).

### Inferences
- With Printful, a "framed print + mug + tee" basket ships as one UK parcel. Adding a greeting card or cushion (Latvia) adds a second parcel and possibly customs exposure (the API has a `customs_fees_possible` flag).
- Printify Choice should be avoided for children's images, because it hides which provider or country makes the item.

### Gaps
- Printify's own help-centre wording on splitting orders across providers was not retrieved.

## Q4. API fit for a custom Next.js shop

### Takeaway
Both have workable REST APIs with orders, design files by URL, shipping quotes and webhooks.

Printful v2 (open beta, production-usable):
- Can restrict to `selling_region_name=uk`.
- Orders move from draft to confirm.
- Handles multi-placement items, which suits calendars.
- Has an asynchronous cost-estimate task.

Printify:
- Orders can be created "on the fly" with blueprint, provider, variant and per-area image URLs, but Printify says this will be deprecated.
- Orders can be held for manual send-to-production.

### Cited Findings
**Printful v2**
- Open beta, but "all listed endpoints can be used in production".
- Private-token or OAuth auth.
- Order items carry a catalogue variant ID and placements whose layers point to file URLs. Orders start as drafts and need confirmation.
- Asynchronous order-estimation tasks.
- Shipping-rates endpoint returns methods, costs and a `customs_fees_possible` flag.
- Webhooks: shipment sent/delivered, order created/updated/failed/cancelled, catalogue stock or price changes.
- Selling-region filters (`uk`, `europe`).
- Rate limit 120 req/min (leaky bucket).
- Mockup tasks with a `mockup_task_finished` webhook.
- Source: [developers.printful.com/docs/v2-beta](https://developers.printful.com/docs/v2-beta/).
- Printful's v1 catalogue is readable without auth (used for this research): [api.printful.com/products](https://api.printful.com/products). The v2 catalogue returned "requires Oauth authentication" for the same query on 26 Nov 2026.

**Printify**
- Personal access token (lasts 1 year) or OAuth 2.0 (6-hour tokens with refresh).
- Rate limits: 600 req/min globally; catalogue 100 req/min; publishing 200 per 30 min.
- On-the-fly order line items: `blueprint_id`, `print_provider_id`, `variant_id`, `print_areas` with image URLs, plus optional scale/x/y/angle. Printify says this is slow, can time out, and will be deprecated in favour of creating products first.
- `send_to_production` endpoint; manual approval possible (new stores auto-approve after 24h).
- `POST /orders/shipping.json` for shipping cost.
- Shipping methods: 1 standard, 2 priority, 3 Printify Express, 4 economy (US only).
- Source: [developers.printify.com](https://developers.printify.com/).

### Inferences
- Printful v2's draft → confirm flow fits a "pay first, then release" checkout well. The selling-region filter can help keep products UK-only.
- Both APIs fetch design files from URLs the shop provides. Short-lived signed URLs from a private UK bucket should work, if they stay valid long enough for the maker to download the file.

### Gaps
- Printify's full webhook event list and image-upload-by-URL details sit beyond the parts of the docs that were read.
- Multi-page calendar file specs on both platforms were not confirmed.

## Q5. Quality evidence and reprint policy

### Takeaway
Both have broadly positive but polarised reviews. On UK Trustpilot (26 Nov 2026), Printful scores 4.1 from 8,024 reviews with 11% one-star; Printify scores 4.4 from 7,753 with 5% one-star. Both offer a free reprint or refund for misprints and transit damage reported within 30 days with photos.

### Cited Findings
**Printful**
- TrustScore 4.1, 8,024 reviews (954 in the last 12 months). Stars: 5★ 79%, 4★ 6%, 3★ 2%, 2★ 2%, 1★ 11%.
- Recent complaints:
  - a reprint refused for loose embroidery threads (23 Nov 2026);
  - a UK Royal Mail misdelivery that Printful would not own (23 Nov 2026);
  - UK VAT per tee (21 Nov 2026);
  - an order rerouted to a DPD locker in Latvia (16 Nov 2026).
- Recent praise covers integrations and print quality.
- Source: [uk.trustpilot.com/review/printful.com](https://uk.trustpilot.com/review/printful.com).

**Printify**
- TrustScore 4.4, 7,753 reviews (1,178 in the last 12 months). Stars: 5★ 81%, 4★ 11%, 3★ 2%, 2★ <1%, 1★ 5%.
- Complaints centre on slow, canned support and a lost sample. Sample print quality is praised. UK providers are not mentioned.
- Source: [uk.trustpilot.com/review/printify.com](https://uk.trustpilot.com/review/printify.com).
- An aggregator puts Printify at 4.6 from 7,640 ratings (Sep 2026) — [toolradar.com](https://toolradar.com/tools/printify/reviews).

**Product-level evidence**
- Printful framed-poster reviewers mention acrylic/"plexiglass" glazing, and one says the moulding is narrow at 24×36 — [printful.com/uk/custom/product/2](https://www.printful.com/uk/custom/product/2).
- A kids-tee reviewer waited "nearly two weeks" — [printful.com/uk/custom/product/476](https://www.printful.com/uk/custom/product/476).

**Reprint policies**
- Printful: free reprint or refund if contacted within 30 days of delivery; a full photo is required; no returns for buyer's remorse — [Printful help 360014006840](https://help.printful.com/hc/en-us/articles/360014006840-What-is-Printful-s-return-and-refund-policy) (via search snippet).
- Printify: 30 calendar days from delivery with a photo.
  - Covers print defects, placement more than 0.5″ off, wrong product or size, and transit damage.
  - Does not cover address errors or change of mind.
  - A reprint gets a new order ID.
  - Sources: [Printify help 4483625769105](https://help.printify.com/hc/en-us/articles/4483625769105); [Printify Merchant Protection](https://printify.com/merchant-protection/) (via search snippets).

### Inferences
- Printify's quality depends on the provider, so the Trustpilot score says little about Print Clever, Harrier or Colorway specifically. Samples from each are the real test.

### Gaps
- Reddit (r/printful, r/printify, r/printondemand) threads on UK providers were not searched within the tool budget.
- No provider-level quality data was found for Harrier, Print Clever, Colorway or T shirt and Sons.

## Q6. Headline data protection (where production and data happen; DPA)

### Takeaway
Both publish merchant DPAs dated March 2026. However, both are US-headquartered platforms. Even when the printing happens in the UK, the uploaded image passes through the platform, and Printify's web app references US-East (AWS us-east-2) image storage. This needs the data-protection researcher's check before any child image is sent.

### Cited Findings
- Printful's Data Processing Terms (v1.1, updated 12 Mar 2026) form part of its Terms of Service and reference UK GDPR standard contractual clauses for transfers — [printful.com/policies/download/data-processing-terms](https://www.printful.com/policies/download/data-processing-terms) (via search snippet).
- Printify's Data Processing Terms (v1.1, 11.03.2026) are a DPA binding Printify and merchants — [printify.com/data-processing-terms](https://printify.com/data-processing-terms/). Printify also has a separate supplier DPA (v1.00, 19.09.2025) with its print providers — [printify.com/supplier-data-protection-addendum](https://printify.com/supplier-data-protection-addendum/) (via search snippets).
- Printify lists offices in Wilmington (US), Riga (LV) and Tallinn (EE) — [printify.com/print-on-demand/uk](https://printify.com/print-on-demand/uk).
- The source of Printify's catalogue web page references `pfy-prod-image-storage.s3.us-east-2.amazonaws.com` and `images.printify.com` — observed in the page source of [printify.com/app/products/1302](https://printify.com/app/products/1302/generic-brand/two-tone-coffee-mugs-11oz), fetched 26 Nov 2026.

### Inferences
- Printify's image storage appears to sit at least partly in AWS US-East (the bucket path seen is "/ai/"). This is not proof that merchant print files are stored there, but it is a strong red flag for children's images.
- For both platforms, "UK-made" does not mean "UK-only data". The platform, as processor, sees and stores every image.

### Gaps
- Where each platform actually stores print files, and their sub-processor lists, were not read (another researcher covers this).

## Product summary grid (UK/EU match; US/China = ruled out)

| Product | Printful UK/EU | Printify UK provider (EU fallback) |
|---|---|---|
| Framed 11×14 / 12×16 / 18×24 | Yes, UK: $30.69 / $32.20 / $46.30 | Print Clever, Jondo (price needs account) |
| Framed 24×32 | No (24×36 at $75.90; canvas 24×32) | Size list needs account |
| Collage frame | No equivalent | No equivalent |
| Two-tone mug 11oz | Colour inside, rim and handle, UK, $9.75 / £7.13 storefront | Print Clever two-tone; Harrier accent (DE: Textildruck) |
| Cushions | 14–22″ square, Latvia only; no 12″, heart or round | Print Clever / Colorway square; no heart or round |
| Kids organic tee | Mini Creator 2.0, UK, $14.95 | T shirt and Sons Kids' Creator (DE/CZ fallback) |
| Adult heavy organic tee | Creator 2.0 only (UK); heavyweight US-only | Creator-class only; Sparker unconfirmed |
| Jigsaw 30/110/252 | US-only (ruled out) | None found in UK/EU |
| Fleece blanket M/L | Throw 30×40 / 50×60, Latvia | Harrier Arctic Fleece (UK) |
| Greeting card 5×7 | Latvia, 350 gsm, envelope, $2.95; no packs | Print Clever 5-pack (UK); Print Pigeons (LV), OPT (CZ) |
| 2027 wall calendar A4/A5 | US-only (ruled out) | Harrier blank wall calendar; dated A4 unconfirmed |
| Ceramic ornament / bauble | US/China (ruled out) | Harrier, Colorway ceramic; Prodigi baubles |
| Phone case snap / tough | Both, UK | Prodigi slim snap only |
| Sublimated socks | US-only | Colorway (UK); Textildruck (DE) |
| Tea towel | US-only | Colorway (UK); Textildruck (DE) |
| Playing cards | US-only | Harrier poker cards (UK) |
| Height chart | No | No |
| Wrapping paper rolls | US-only | Print Clever; Prodigi rolls |
| Placemats / coasters | Placemats US-only; coaster Latvia $5.25 | Coasters: Print Clever, Colorway; no placemats |
| Apple Watch strap | No | None in UK/EU |

Sources for the grid are those cited in Q1 and Q2.
