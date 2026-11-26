# What Snickerdoodle buys from Prodigi today (from the code, 26 Nov 2026)

Source: branch `feat/christmas-season` at 36cbc32 — `src/server/catalogue.ts` (live = `visibleInShop` and not paused),
`src/lib/season.ts` (product → lab route), `src/lib/delivery.ts` + `src/fulfillment/submit.ts` (shipping method),
`src/pricing/parcels.ts` (same-parcel groups), `project-office/briefs/CHRISTMAS-range-and-postage.md` (sandbox quotes).
**No cost figures here on purpose** — real costs live only in the founder's private folder.

## Live products, SKUs, labs and post (23 products)

| Product | Variants on sale | Prodigi SKU(s) | Lab (all UK) | Standard post carrier | Tracked on Standard? | Same-parcel group |
|---|---|---|---|---|---|---|
| Framed print | 11×14″, 12×16″, 18×24″, 24×32″ × 8 frame colours × portrait/landscape | GLOBAL-CFP-11X14 / -12X16 / -18X24 / -24X32 (colour = attribute) | gb3 | Evri / DPD by size | yes | none (gb3 ships frames on different services) |
| Multi photo frame | 12×12″, 16×24″, 24×36″ × 8 colours | GLOBAL-MPF-12X12 / -16X24 / -24X36 | gb3 | Evri / DPD Local / FedEx by size | yes | none |
| Mug | 11oz two-tone, 7 colours | H-MUG-11OZ-WBL, -WB, -WG, -WO, -WP, -WR, -WY | uk9 | Royal Mail Tracked 48 | yes | uk9 homeware |
| Cushion | 11″ heart, 18″ round (faux suede, one side); 12″ and 22″ square (faux linen) one or both sides | GLOBAL-CUSH-SH-SCSSS, GLOBAL-CUSH-18R-SCSSS, GLOBAL-CUSH-12X12-LIN(-DUAL), GLOBAL-CUSH-22X22-LIN(-DUAL) | uk3 | FedEx | yes | uk3 textiles |
| Kids tee | Stanley/Stella Mini Creator 2.0, sizes 3–14, white + colours | TEE-SS-STTK909 (size, colour = attributes) | uk9 | Royal Mail Tracked 48 | yes | none (garments ship apart from homeware; 5% family-set saving instead) |
| Adult tee | Stanley/Stella Sparker 2.0, XS–2XL, 5 colours | TEE-SS-STTM559 | uk9 | Royal Mail Tracked 48 | yes | none |
| Jigsaw (tin) | 30, 110, 252 pieces | JIGSAW-PUZZLE-30 / -110 / -252 | gb3 | Evri Standard 48 | yes | none |
| Fleece blanket | medium, large (white) | H-BLA-PBMWHITE / H-BLA-PBLWHITE | uk3 | FedEx | yes | uk3 textiles |
| Greetings card | 7×5″ Fedrigoni, printed inside | CLASSIC-GRE-FEDR-7X5-BLA | uk7 | Guernsey Post (flat for 1–15 cards) | **no** | none (already a flat post) |
| Card pack | 5 or 10 cards | CLASSIC-GRE-FEDR-7X5-BLA × N | uk7 | Guernsey Post | **no** | none |
| 2027 calendar | A5, A4 landscape, dated | CALENDAR-A5-L-DATED / CALENDAR-A4-L-DATED | uk15 | "Mixed" | yes (no Express offered) | uk15 calendar |
| Ceramic ornament | 7.5 cm flat disc | XMAS-PORC-BAUB | uk9 | Royal Mail Tracked 48 | yes | uk9 homeware |
| Christmas bauble | 8 cm plastic ball | XMAS-PLAS-BAUB | uk5 | Royal Mail 24 | **no** | uk5 ornament |
| Placemats | pack of 4 (cork) | H-PLACE-4PK (bundle also uses -2PK) | uk9 | Royal Mail Tracked 48 | yes | uk9 homeware |
| Coasters | packs of 2, 4, 6 (cork) | H-COAST-2PK / -4PK / -6PK | uk9 | Royal Mail Tracked 48 | yes | uk9 homeware |
| Christmas family bundle | for 2 / 4 / 8 (placemats + coasters + ceramic ornaments) | H-PLACE-2PK/4PK, H-COAST-2PK/4PK, XMAS-PORC-BAUB | uk9 | one Tracked 48 parcel | yes | uk9 homeware |
| Phone case | snap, tough; 42 phone models; gloss/matte | GLOBAL-TECH-{model}-CS/TS-{G/M} pattern (src/lib/phone-cases.ts) | uk6 (Express) / uk8 (Standard) | Express = Royal Mail Tracked; Standard is often untracked RM24 | only on Express | none |
| Apple Watch strap | small, large | GLOBAL-TECH-AP-WS-FL-38MM / -42MM | uk6 | Royal Mail Standard Tracked | yes | none |
| Socks | ankle, tube | GLOBAL-ANKLE-SOCKS / GLOBAL-TUBE-SOCKS | uk9 | Royal Mail Tracked 48 | yes | uk9 socks (separate from homeware: socks ship as their own shipment) |
| Height chart | 20×120, 30×120, 20×150, 30×150 cm × 3 hanger colours | POSTER-HANGER-{20/30}-CAN-ROL-SC-{8X48/12X48/8X60/12X60} | gb3 | Evri Next Day | yes | none (each chart is its own parcel: a 2nd costs a full 2nd post) |
| Wrapping paper | 2, 3, 5 m rolls, white or kraft | WRAP-ROL-70X200/300/500, WRAP-KFT-ROL-70X200/300/500 | gb2 | Royal Mail 24 | **no** (Express = RM Tracked 24 for a little more; Budget = Evri 48 for less, per the Oct brief) | gb2 wrap |
| Tea towel | one size | H-TEATOWEL-SUB | uk9 | Royal Mail Tracked 48 | yes | uk9 homeware |
| Playing cards | 54 cards | PLAY-CARD | uk5 | Royal Mail 24 | **no** (code note: Budget = RM48, roughly half the Standard post) | none |

Not live (hidden or paused): storybook, baby bodysuit, apron, Christmas sack, kids + adult hoodies, kids + Christmas
jumpers, pet bandana, gift wrap, the old Christmas Eve bundle.

## How orders reach Prodigi today (rules in the code)

- **One Prodigi order per basket, one shipping method for the whole order** (`submit.ts`). Prodigi then splits it into
  shipments, one per lab and parcel class.
- **Standard for everything, except:** any order containing a **phone case goes Express as a whole** (so the case is
  tracked: its Standard route is often untracked Royal Mail 24 from uk8). This raises the *other* items' post too —
  sandbox, 5 Nov: mug, ornament, jigsaw, wrapping paper about +£1; watch strap about +£2; cushion about +£2;
  framed print about +£3; tee about +£6.50; greetings card about +£7.65; socks about +£8.
- An order with a **calendar can never go Express** (Prodigi offers none for it), so a case + calendar order goes
  Standard and the case travels untracked.
- **Same lab, same parcel class = one shipment for about £1 more per extra item** (cards: flat). Different labs never
  share a parcel. Socks ship separately even though they come from uk9.
- Prices include free delivery, so every item carries its own single-item post. Shoppers get £3 off each extra item in
  the same parcel group, "buy more & save" (0–15% from the second of the same product), and a 5% family-set saving on
  3+ garments.
- Prodigi packs and posts; there is no packaging cost of our own.
- The private margins sheet (26 Nov) models **Prodigi Pro**: 15% off products, 10% off clothing, post at full price,
  £35 a month on annual billing. Whether the live account is on Pro today is for the founder to confirm.

## Which products earn least (no figures; ranking from the private sheet, profit % before allowances)

Thinnest at the normal price: 30-piece jigsaw, plastic bauble, 24×32″ framed print, snap phone case, 110-piece jigsaw,
22″ one-sided cushion, socks, adult tee in navy/grey/khaki (because the cost loader stores the white price for it).
Postage is the biggest share of cost on: plastic bauble, playing cards, jigsaws, height charts, wrapping paper,
socks, mugs, heart cushion and the ceramic ornament.

## Volume assumptions to use (no real sales figures are in the repo)

- Planning figure used across the project: about **200 orders a month**, about 1.1–1.3 items an order
  (investor notes, `PRODUCT-RANGE-expansion.md` §0). Year-one marketing plan: roughly 600–1,200 orders in the year.
- December will be several times a normal month; January–February quiet.
- Use three volumes when giving £ a month: **50, 200 and 500 orders a month**, and say the mix is an assumption.
