# Product prices, costs and competitors

*26 November 2026. Covers every product on sale at snickerdoodle.co.uk today.*

> **This file is public.** It has our selling prices, how the costs are worked out, and what other shops charge.
> It has **no** real costs and **no** profit figures. Those are in a private sheet on the founder's computer
> (`.prodigi-assets/PRODUCT-MARGINS-2026-11-26.md`, in the main Snickerdoodle folder; git never picks it up).

## The short version

- **We are priced like a small drawing maker, not like a photo-gift site.** Most of the range sits inside the band of
  UK shops that turn a child's drawing into a product, and about level with the big sites' full prices once their
  delivery is added. This week (Black Friday) the big sites look much cheaper, because almost everything there is on sale.
- **Looks dear against the market:** the plastic bauble (£19) and ceramic ornament (£21), fleece blankets (£60 / £75),
  placemats (4 for £60), the Apple Watch strap (£45) and the A5 calendar (£22).
- **Looks cheap against the market:** cushions (the 12″ square is about £10 under the best-known drawing cushion) and
  the two big framed prints (18×24″ and 24×32″).
- **Nobody else does it:** height charts, calendars and watch straps made from a child's own drawing, and the
  Christmas table bundle. Here we set the price.
- **Free tracked delivery is worth £2.50 to £6 an item** against the big sites. We rarely say so. Showing "£18, delivered"
  would close most of the gap shoppers see.
- **Thin margins:** which products also earn little is in the private sheet (section 4), because it needs the real costs.

Pricing suggestions are at the end ([What we could change](#what-we-could-change)). They are only suggestions: no price
in the code has changed.

---

# Part 1: our numbers

## Where the prices come from

- The server decides every price. The shopper's browser only sends "which product, how many".
- The price list is in `src/server/catalogue.ts`. A product is **live** when it is on show in the shop (`visibleInShop`)
  and not paused. The shop listing (`src/server/shop/listing.ts`) also leaves out the Christmas bundle's extra pack
  sizes (single placemats, 2- and 6-packs of placemats, single coasters), which are never sold on their own.
- **Live today (23 products):** framed print, multi photo frame, mug, cushion, kids tee, adult tee, jigsaw, blanket,
  greetings card, card pack, 2027 calendar, ceramic ornament, Christmas bauble, placemats, coasters, Christmas family
  bundle, phone case, Apple Watch strap, socks, height chart, wrapping paper, tea towel, playing cards.
- **Not live** (hidden or paused): storybook, baby bodysuit, apron, Christmas sack, kids and adult hoodies, kids and
  Christmas jumpers, pet bandana, gift wrap, the old Christmas Eve bundle.

## What one sale costs us (the method)

For each item, at the normal price:

| What | How it is worked out | Where it comes from |
|---|---|---|
| **Price** | what the shopper pays, VAT included | `src/server/catalogue.ts` |
| **VAT owed** | price − price ÷ 1.2. We are VAT-registered, so this goes to HMRC; it is not ours | `project-office/briefs/PRICING.md` |
| **Prodigi product cost** | what Prodigi charges to make it, before VAT (we claim Prodigi's VAT back) | live database, `product_variants.unit_cost_pence` minus the post |
| **Post, first item** | Prodigi's standard post for one item. Delivery is free to the shopper, so it is inside our price | `post_first_pence` |
| **Post, each extra item** | what Prodigi adds for each extra item in the same parcel | `post_extra_pence` |
| **Card fee** | Stripe: 1.5% of what the shopper pays + 20p | `src/pricing/sample.ts`, `multibuy.ts` |
| **Profit** | price without VAT − product − first post − card fee | |
| **Cautious profit** | profit − 3% for reprints − 5% kept for codes − 55p running costs per order | `src/pricing/multibuy.ts` |

Other things that count:
- **No packaging cost and no delivery charge.** Prodigi packs and posts; delivery is in the price.
- **Card packs** cost us the card × the number of cards, sent as one parcel.
- **The Christmas bundle** costs its pieces (placemats, coasters, one ceramic ornament per person) plus one parcel. It
  never gets "buy more & save" and never takes a discount code.
- **Partner codes** (creators, school PTAs) pay **10% of the order before VAT**.
- **The free first card (FIRSTCARD) is switched off**, so it costs nothing today.
- **Sample orders** (an admin's own) are charged at cost and don't count as sales.

### Buying more

- **Buy more & save:** 2 or more of the same product take 0, 5, 10 or 15% off. The shop works each step out from the
  product's own costs: it picks the biggest step that still keeps 15% cautious profit (`src/pricing/multibuy.ts`). Card
  packs get it too (since today, PR #95). The bundle does not.
- **Same parcel:** £3 off each extra item that ships in the same Prodigi parcel as another (`src/pricing/parcels.ts`).
  It stacks with buy more & save. The groups are: homeware (mug, tea towel, ornament, placemats, coasters, the
  bundle); textiles (cushion, blanket); wrapping paper; calendars; socks; plastic baubles.
- **Family set:** 5% off garments when 3 or more ship together, if that beats buy more & save.

The private sheet works out the profit per item when you buy 1, 2 and 5, with both savings taken off.

## Live prices

Prices include VAT and free tracked UK delivery. The cost and profit columns for each line are in the private sheet.

| Product | Variant | Price |
|---|---|--:|
| Framed print | 11×14″ · 12×16″ · 18×24″ · 24×32″ (any frame colour) | £65 · £70 · £90 · £105 |
| Multi photo frame | 12×12″ · 16×24″ · 24×36″ | £62 · £87 · £125 |
| Mug | 11oz, any colour | £18 |
| Cushion | 11″ heart · 18″ round | £22 · £30 |
| Cushion | 12″ square, one side / both sides | £30 / £35 |
| Cushion | 22″ square, one side / both sides | £40 / £45 |
| Kids tee | white / any colour (all sizes 3–14) | £25 / £27 |
| Adult tee | any colour, XS–2XL | £32 |
| Jigsaw (in a tin) | 30 · 110 · 252 pieces | £26 · £30 · £35 |
| Fleece blanket | medium · large | £60 · £75 |
| Greetings card | 7×5″ | £5.50 |
| Card pack | 5 cards · 10 cards | £12 · £21 |
| 2027 calendar | A5 · A4 | £22 · £24 |
| Ceramic ornament | 7.5 cm | £21 |
| Christmas bauble | 8 cm plastic | £19 |
| Placemats | pack of 4 | £60 |
| Coasters | pack of 2 · 4 · 6 | £18 · £26 · £34 |
| Christmas family bundle | set for 2 · 4 · 8 | £78 · £145 · £279 |
| Phone case | snap · tough (every model) | £25 · £30 |
| Apple Watch strap | small · large | £45 |
| Socks | ankle · tube | £20 |
| Height chart | 20×120 cm · 30×120 or 20×150 cm · 30×150 cm | £31 · £34 · £36 |
| Wrapping paper | 2 m · 3 m · 5 m roll (white or kraft) | £23 · £28 · £38 |
| Tea towel | one size | £27 |
| Playing cards | 54 cards | £24 |

## Where the real costs are, and how sure we are

- **The real live costs are in the live database.** They were loaded from Prodigi's price sheets by
  `scripts/ops/push-costs.sh`. The repo deliberately keeps none of them.
- **The private sheet is an estimate.** It uses the same sources the live database was loaded from: Prodigi's
  July 2026 price sheets (kept on the founder's computer) and the Prodigi test quotes from October and November. It is
  not from real Prodigi invoices, and Prodigi may have changed prices since July.
- **To confirm it**, run [`reports/product-margins/live-costs-readonly.sql`](product-margins/live-costs-readonly.sql)
  on the live database. It only reads (a read-only transaction that ends with ROLLBACK). It gives three tables: each
  product's price, costs and profit; what has sold since 13 November; and the savings and commission given.
  **Don't paste the results into the repo.**

### Two things this check turned up (no figures needed)

1. **Coloured tees cost Prodigi more than white ones, but the cost loader may not know.** For one Prodigi product it keeps
   the cheapest colour, so every colour gets the white (or black) cost. The local test database shows exactly that.
   For the adult tee in navy, grey or khaki, the shop thinks it earns more than it does, and its buy-more-&-save steps
   come out more generous than its real costs allow. The kids tee is not affected enough to matter. The SQL shows
   whether the live database has the same problem: one cost for all five adult-tee colours means yes.
2. **The watch strap had no cost in the local test database.** If the live one is the same, the strap gets no
   buy-more-&-save offer and no code can come off it. The shop plays safe, so nothing is lost, but the offer is missing.
   The SQL will say "NO COST ON FILE".

### The multi photo frame against the market

The competitor research below has no section on the multi photo frame. It is the nearest thing to our framed prints:
12×12″ £62, 16×24″ £87, 24×36″ £125, a few pounds under the single framed print of a similar size. No UK shop was
found framing several of a child's drawings together, so like the height chart it has no direct rival.

---

# Part 2: what other shops charge

## Snickerdoodle prices sit with makers, above discounters

Snickerdoodle prices like a UK drawing specialist, not like a photo-gift site. On most of the range it sits **within the band set by the small makers who turn a child's drawing into a product** (lukedrewthis, Dinky Artist, NOTHS sellers, the better Etsy shops), and roughly level with the **everyday "was" prices** of the big photo-gift sites once their delivery is added. It is **well above what those big sites are charging this Black Friday week**, and usually £3 to £10 above a typical Etsy drawing seller once Etsy postage is added. Four products stand out as **above the market on any measure**: Christmas baubles (especially the £19 plastic one), fleece blankets, the placemat set and the Apple Watch strap. Two sit **below** the specialists: cushions and the larger framed prints. The free tracked delivery inside every Snickerdoodle price is worth **£2.50 to £6 per item** against the big sites and £1.65 to £4.50 against Etsy sellers, so every comparison below adds the rival's delivery for one item. This matters because Snickerdoodle is selling into the busiest discount week of the year: a parent comparing a £18 drawing mug with a £7.19 Photobox mug this week sees a big gap, but against the £15.98 that the same Photobox mug costs delivered at full price, the gap is just £2.

## How to read the numbers

Every price in this report was seen on **26 November 2026**, the week of Black Friday, from research notes gathered that day. All prices are in pounds and include VAT. "Delivered" means the price plus the cheapest standard UK delivery for one item, which is the fair comparison with Snickerdoodle's free-delivery price. "Everyday" means the full or struck-through price shown on the page. "Sale" means the price shown that day. Prices marked **(snippet)** come from a search-engine result because the live page was blocked; the date of the underlying page is unknown, so treat them as rough. EU and US figures use €1 = £0.87 and $1 = £0.79.

The three reference groups used for every verdict are: **drawing specialists** (UK makers and NOTHS sellers whose product is made from the child's own drawing), **Etsy drawing sellers** (UK-based Etsy shops selling the same idea; overseas Etsy shops are noted but usually lose on delivery), and **mass photo-gift sites** (Photobox, Vistaprint, Snapfish, Moonpig, Funky Pigeon, ASDA Photo, Printerpix, Bags of Love and similar).

### The whole range at a glance

| Product | Snickerdoodle (delivered) | Drawing specialists, delivered | Etsy UK drawing sellers, delivered | Mass photo sites, delivered: everyday (sale) | Verdict |
|---|---|---|---|---|---|
| Framed print | 11×14″ £65 · 12×16″ £70 · 18×24″ £90 · 24×32″ £105 | none found | A4 to A3 frames £19 to £25; wooden art £41 | 30×40cm £54 to £67 (£45 to £46); 40×60cm £96 (£55) | **Within** mass everyday; big sizes below |
| Mug | £18 | £16 to £20 | about £13 to £15 typical | about £15 to £16 (£9 to £14) | **Within** specialists, low end |
| Cushion | £22 to £45 | lukedrewthis 41cm about £40 to £42 | £12 to £20 | 30cm £33 to £37; 56cm £53 (£18 to £28) | **Below** specialists |
| Kids' tee | £25 / £27 | £27.50 to £29.50 | £10 to £22 | £12 to £17 | **Within** specialists |
| Adult tee | £32 | £33.50 to £40.50 | £27 to £37 | £15 to £21 | **Within** |
| Jigsaw in a tin | £26 / £30 / £35 | none found | thin; overseas £26 to £39 | £18 to £46 (£17 to £31) | **Within** mass |
| Fleece blanket | £60 / £75 | none found | £26 to £51 (free delivery) | £32 to £52 typical; Snapfish "regular" up to £88 | **Above** |
| Greetings card | £5.50 | £8 | £3 to £6 (up to £10) | Moonpig £5.54 to £6.98 | **Within** |
| Card pack of 10 | £21 | from £22.79 (count unclear) | £11 to £23 | Moonpig about £29 with code | **Within** |
| 2027 calendar | A5 £22 · A4 £24 | none found | none UK; overseas £29 to £54 | A4 £21 to £28 (£11 to £16); A5 £19 (£11) | A4 **within**; A5 **above** |
| Ceramic ornament / plastic bauble | £21 / £19 | £14 to £23 | ceramic £8 to £12 | ceramic £12 to £21; plastic £12.50 to £16 (£11 to £13) | **Above** |
| Phone case | snap £25 · tough £30 | none found | £22 to £29 | £16.50 to £25 | **Within** Etsy; above mass |
| Socks | £20 | none found | £19.59 (everyday £23.99) | £10 to £22 | **Within** |
| Tea towel | £27 | £28.50 to £30.50 | £11.55 to £21.55 | £10 to £20 | **Within** specialists only |
| Playing cards | £24 | none found | £22 to £30 | £13 to £17 | **Within** Etsy; above mass |
| Height chart | £31 to £36 | none print the child's art | £25.50 to £39 (not from art) | NOTHS £30 to £38 | **Within** |
| Wrapping paper | 2m £23 · 3m £28 · 5m £38 | none found | 2m £24.60 · 3m £28.20 · 5m £31.80 | 1.83m £31 to £39 | **Within** |
| Placemats, 4 | £60 | none found | £48.50 | about £37.50 typical | **Above** |
| Coasters | 2 £18 · 4 £26 · 6 £34 | Dinky Artist £14.79 (count unclear) | singles £6 to £12 each | 4-pack £17 to £25 | **Within**, top of mass |
| Apple Watch strap | £45 | none found | overseas £35.50 | Casestation £34.99 | **Above** |

## Wall art, mugs and home textiles: frames hold up, blankets do not

*All rows in this section seen 26 Nov 2026.*

### Framed prints: Snickerdoodle's big frames undercut Photobox at full price

No UK drawing specialist sells a framed print of the child's art at a listed price. Point101 offers framed mosaics of scanned art from £199 ([Point101](https://www.point101.com/kids_artwork/prices/sizes-prices)). On Etsy, genuine "your child's drawing, framed" listings are fewer than searches suggest, and they are small: A4 and A3 frames at about £20 to £25 delivered. So the real comparison is the big sites' framed posters, which stay the least discounted category even this week.

| Seller | Product / size | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Photobox | Framed poster 30×40cm (≈12×16″) | £40.94 (was £62.99) | £3.99 standard gift rate* | £44.93 (£66.98 at full price) | Sale, 35% off | [Photobox](https://www.photobox.co.uk/wall-art/framed-poster) |
| Photobox | Framed poster 40×60cm (≈16×24″) | £50.59 (was £91.99) | £3.99* | £54.58 (£95.98) | Sale, 45% off | same |
| Photobox | Framed poster 50×70cm (≈20×28″) | £57.49 (was £114.99) | £3.99* | £61.48 (£118.98) | Sale, 50% off | same |
| Vistaprint | Framed print 30×40cm | £45.72 (was £53.79) | free over £40 | £45.72 (£53.79) | Sale, 15% off | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/wall-art/framed-prints) |
| Vistaprint | Framed print 40×50cm | £81.59 (was £95.99) | free over £40 | £81.59 (£95.99) | Sale | same |
| ASDA Photo | Full-photo framed print A3 | £24.80 (was £31) | not shown | £24.80 + delivery | Sale | [ASDA](https://photo.asda.com/product/full-photo-framed-print) |
| Snapfish | Framed print, 3 images | £39.99 (was £79.99) | from £2.69 | £42.68 (£82.68) | Sale; "regular" is an anchor | [Snapfish](https://www.snapfish.co.uk/framed-prints) |
| Funky Pigeon | Photo collage frame | £30 | £2.49 to £2.95 (snippet) | about £32.50 to £33 | Everyday | [Funky Pigeon](https://www.funkypigeon.com/gifts/personalised-photo-frames) |
| LifeMomentsPrinted (Etsy, UK) | Child's artwork, A4 / A3 framed | £17.24 / £22.49 | £2.95 | £20.19 / £25.44 | Sale | [Etsy](https://www.etsy.com/uk/listing/4588258240/personalised-framed-childs-artwork-print) |
| DuffysCreationsGB (Etsy, UK) | Child's drawing gold-foil print, A4 framed | £17.25 to £18 | £2.00 | £19.25 to £20 | Sale | [Etsy](https://www.etsy.com/uk/listing/4607769844/personalised-childs-drawing-gold-foil) |
| modocreative (Etsy, UK, Bestseller) | Drawing as hand-painted wood in oak frame | £36.50 | £4.20 | £40.70 | Everyday | [Etsy](https://www.etsy.com/uk/listing/630862302/bespoke-childs-drawing-wooden-wall-art) |
| LittlestGalleries (Etsy, UK) | Bespoke framed artwork collage | £425 | free | £425 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4392080004/childrens-art-bespoke-collector-piece) |

*Photobox's £3.99 is its standard gift delivery seen on its mug and gifts pages ([Photobox](https://www.photobox.co.uk/shop/gifts-objects/102/prices)); the frame's own delivery was not captured.

**Bands (delivered, around 12×16″):** Etsy drawing sellers £19 to £25 (A4 to A3 only), up to £41 for crafted pieces · mass sites everyday £54 to £67, sale £45 to £46 · at 16×24″ and up, mass everyday £82 to £119.

**Verdict: within the mass everyday band, and below it at the large sizes.** The 12×16″ at £70 sits £3 above Photobox's full price delivered and £16 above Vistaprint's; the 18×24″ at £90 and 24×32″ at £105 undercut Photobox's full price for smaller frames. Against Etsy it looks expensive, but Etsy sellers mostly offer A4 frames, not wall-sized art. The multi photo frame (12×12″ £62 to 24×36″ £125) sits between Funky Pigeon's £30 collage frame and Snapfish's £82.68 "regular" three-image frame.

### Mugs: £18 is £2 above the big sites at full price

Three of the biggest sites land on exactly the same delivered everyday price for a photo mug: **£15.98** (Photobox, Moonpig and Vistaprint). Drawing specialists on NOTHS charge about £18 to £20 with free delivery. Etsy is cheaper, with a typical UK drawing mug around £10 plus £3.50 to £4 postage.

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Hoobynoo (NOTHS) | Child's drawing mug | £15.96 (was £19.95) | free | £15.96 (£19.95) | Sale, 20% off | [NOTHS](https://www.notonthehighstreet.com/hoobynoo/product/childs-drawing-personalised-teacher-mug) |
| Dinky Artist (own site) | Ceramic mug | £15.30 (was £18) | tracked, price not shown; free over £75 | £15.30 + delivery | Sale to 30 Nov | [Dinky Artist](https://www.dinkyartist.com/) |
| Joanna Emily (NOTHS) | Child's drawing travel mug | £29.25 (was £39) | free | £29.25 (£39) | Sale, 25% off | [NOTHS](https://www.notonthehighstreet.com/personalised/personalisation-by-technique/drawings) |
| Sazzamaroos (Etsy, UK) | Children's drawing mug 11oz | £3.19 | £3.99 | £7.18 | Sale | [Etsy](https://www.etsy.com/uk/listing/580705844/your-childrens-drawing-on-a-mug-childs) |
| MugMeWales (Etsy, UK) | Kid's art mug | £8.50 | £3.95 | £12.45 | Everyday | [Etsy](https://www.etsy.com/uk/listing/640409018/childs-own-drawing-mug-kids-drawing-your) |
| TheKeepsakeShopUK (Etsy, UK) | Artwork mug | £10.95 | £3.95 | £14.90 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1702320124/childs-artwork-mug-and-coaster-unique) |
| Jelliegiftco (Etsy, UK) | Child's drawing mug | £11.99 (was £14.99) | free | £11.99 | Sale | [Etsy](https://www.etsy.com/uk/listing/997252692/personalised-childs-drawing-mug-homemade) |
| LifeLessOrdinaryCo (Etsy, UK) | Kids art mug | £14.50 | free | £14.50 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4614638435/personalized-kids-art-or-drawing-mug) |
| FredAndBo (Etsy, UK) | Child's drawing mug | £16 (£18 if you post the original) | free | £16 | Everyday | [Etsy](https://www.etsy.com/uk/listing/484129648/childs-drawing-printed-on-a-mug-gift-for) |
| HabulousCeramics (Etsy, UK) | Handmade stoneware mug with drawing | £45 | £4.99 | £49.99 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4509034390/custom-ceramic-mug-with-childs-drawing) |
| Photobox | Classic white mug | £7.19 (was £11.99) | £3.99 | £11.18 (£15.98) | Sale, code EARLYBF26 | [Photobox](https://www.photobox.co.uk/personalised-mugs/detail) |
| Moonpig | Photo-upload mug | £7.99 (was £9.99) | £5.99 tracked | £13.98 (£15.98) | Sale | [Moonpig](https://www.moonpig.com/uk/gifts/personalised-mugs/all/) |
| Vistaprint | Mug | £4.94 (was £10.99) | £4.99 | £9.93 (£15.98) | Sale | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/personalised-mugs) |
| Snapfish | White mug 11oz | £5.99 (was £11.99) | from £2.99 | £8.98 (£14.98) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/photo-mugs) |
| Funky Pigeon | Photo mug | £10 | £2.49 to £2.95 (snippet) | about £12.50 to £13 | Everyday, no sale | [Funky Pigeon](https://www.funkypigeon.com/gifts/mugs) |

**Bands (delivered):** drawing specialists £16 to £20 typical, £29 to £39 for travel mugs · Etsy drawing sellers low £7, typical £13 to £15, high £17 printed and £50 handmade · mass sites everyday £12.50 to £16, sale £9 to £14.

**Verdict: within the specialist band, at its low end.** It is £2 above the big sites' full delivered price and about £3 to £5 above a typical Etsy drawing mug, which is about as close as a drawing product can sit to the commodity price.

### Cushions: Snickerdoodle undercuts the best-known drawing cushion

lukedrewthis, the longest-running drawing maker on NOTHS (3.4K+ orders over 13 years, [NOTHS](https://www.notonthehighstreet.com/lukedrewthis)), sells a 41cm cushion from £36 plus £8 for a second side, and its own site charges £3.50 to £5.50 delivery ([delivery](https://www.lukedrewthis.co.uk/pages/delivery)).

| Seller | Product / size | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| lukedrewthis | Drawing cushion 41×41cm, pad included (+£8 second side) | from £36 | £3.50 to £5.50 | about £39.50 to £41.50 (two-sided about £47.50 to £49.50) | Everyday | [lukedrewthis](https://www.lukedrewthis.co.uk/); [NOTHS](https://www.notonthehighstreet.com/lukedrewthis/product/cushion-personalised-with-your-child-s-drawing) |
| Betsy Benn (NOTHS) | Drawing velvet cushion 35×50cm | £55 | free | £55 | Everyday | [NOTHS](https://www.notonthehighstreet.com/betsybenn/product/child-s-drawing-personalised-velvet-cushion) |
| Dinky Artist (own site) | Purple glitter cushion | £15 (was £30) | not shown | £15 + delivery | Sale | [Dinky Artist](https://www.dinkyartist.com/) |
| oliveandpip (Etsy, UK) | Double-print drawing cushion | £34.99 | £2.99 | £37.98 | Everyday | [Etsy](https://www.etsy.com/uk/listing/700073614/double-print-cushion-childrens-drawing) |
| Jelliegiftco (Etsy, UK) | Drawing cushion, cover / with inner | £13.99 / £19.99 | free | £13.99 / £19.99 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1118679271/childs-drawing-gift-kids-drawing-cushion) |
| TheKraftyGoose (Etsy, UK) | Artwork cushion | from £13.99 | £3.99 | £17.98 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1152416633/custom-bespoke-kids-drawing-cushion) |
| LucyLocketsCaravan (Etsy, UK) | Drawing keepsake cushion | £12.74 (was £14.99) | £3.65 | £16.39 | Sale | [Etsy](https://www.etsy.com/uk/listing/909673435/childs-drawing-keepsake-cushion-mothers) |
| Snapfish | Cushion 12×12″ / 18×18″ / 22×22″ | £14.99 / £19.99 / £24.99 (was £29.99 / £39.99 / £49.99) | from £2.69 | £17.68 / £22.68 / £27.68 (£32.68 / £42.68 / £52.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/photo-cushions) |
| Photobox | Cushion 28cm / 43cm / 53cm | £19.79 / £25.79 / £34.19 (was £32.99 / £42.99 / £56.99) | £3.99* | £23.78 / £29.78 / £38.18 (£36.98 / £46.98 / £60.98) | Sale, 40% off | [Photobox](https://www.photobox.co.uk/personalised-cushion) |
| Vistaprint | Cushion 36cm / 46cm / 66cm | £13.99 / £16.79 / £19.99 (was £17.49 / £20.99 / £24.99) | £4.99 | £18.98 / £21.78 / £24.98 | Sale, 20% off | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/cushions) |
| Funky Pigeon | Photo cushion | from £22 | £2.49 to £2.95 (snippet) | about £24.50 to £25 | Everyday | [Funky Pigeon](https://www.funkypigeon.com/gifts/cushions) |

**Bands (delivered):** drawing specialists £38 to £55 · Etsy drawing sellers £12 to £20 typical, £38 high · mass sites everyday £22 to £61 by size, sale £18 to £38.

**Verdict: below the drawing specialists, within the mass everyday band.** The 12″ square at £30 (two-sided £35) is about £10 under lukedrewthis's slightly bigger cushion, and the 22″ at £40 is £12 under Snapfish's "regular" price for the same size. Vistaprint and most Etsy shops are cheaper, but they sell a cover-and-print, not a keepsake.

### Fleece blankets: £60 and £75 sit at the top of a discounted market

Blankets are one of the most heavily discounted photo gifts, and no UK drawing specialist sells one. Snickerdoodle's medium and large sizes are not stated in this brief, so this compares the nearest named sizes.

| Seller | Product / size | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| DreamWithDragons (Etsy, UK) | Plush drawing blanket 40×50″ / 50×60″ / 60×80″ | £32.20 / £40.60 / £51.10 | free | same | Sale (was from £37) | [Etsy](https://www.etsy.com/uk/listing/4425531092/personalized-picture-drawing-plush-photo) |
| RetroArtDecor (Etsy, overseas) | Child's drawing plush fleece 30×40″ | £52.63 | £30.60 | £83.23 | Everyday | [Etsy](https://www.etsy.com/uk/listing/524899531/turn-your-childs-drawing-into-a-30-x-40) |
| ComfortAndKindCo (Etsy, overseas) | Kids artwork blanket | £55.72 | free | £55.72 | Sale | [Etsy](https://www.etsy.com/uk/listing/1147922224/custom-kids-artwork-blanket-personalized) |
| ASDA Photo | Photo blanket cheapest / Medium / Large | £32 / £42 / £52 | not shown | £32 to £52 + delivery | Everyday, no sale | [ASDA](https://photo.asda.com/photo-gifts/personalised-blankets) |
| Vistaprint | Fleece blanket Medium / Large | £33.75 / £34.55 (was £42.19 / £43.19) | £4.99, free over £40 | £38.74 / £39.54 (£42.19 / £43.19) | Sale, 20% off | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/fleece-blankets) |
| Snapfish | Fleece 60×50″ / 80×60″ | £34.99 / £42.49 (was £69.99 / £84.99) | from £2.69 | £37.68 / £45.18 (£72.68 / £87.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/photo-blankets) |
| Printerpix | Fleece blanket, default size | £29.99 (was £84.90) | £4.99 | £34.98 | "Was" price inflated | [Printerpix](https://www.printerpix.co.uk/photo-blankets/personalised-fleece-blanket/) |
| Menkind | All-over face fleece blanket | £35 | not captured | £35 + delivery | Everyday | [Menkind](https://www.menkind.co.uk/personalised-gifts/personalised-photo-gifts) |
| NOTHS sellers | Photo / personalised blankets | £29.95 to £53.96 (was £40.99 to £59.95) | varies | about the same | Sale | [NOTHS](https://www.notonthehighstreet.com/search?term=personalised%20photo%20blanket) |

**Bands (delivered):** Etsy UK drawing seller £32 to £51 · mass sites typical everyday £32 to £52 (ASDA, Vistaprint), sale £35 to £45 · only Snapfish's and Printerpix's "regular" anchors (£72 to £90) and the top NOTHS listing (about £60) reach Snickerdoodle's level.

**Verdict: above the market.** At £60 and £75, Snickerdoodle is £8 to £25 over ASDA's full price and the one UK Etsy drawing seller, and about 1.7 times this week's sale prices. The only prices it beats are "was" figures that few shoppers ever pay.

### Tea towels: £27 matches lukedrewthis, nobody else

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| lukedrewthis | Child's drawing tea towel | £25 | £3.50 to £5.50 | about £28.50 to £30.50 | Everyday | [lukedrewthis](https://www.lukedrewthis.co.uk/) |
| lukedrewthis (NOTHS) | Family picture tea towel | £26 (marked unavailable) | not stated | — | Everyday | [NOTHS](https://www.notonthehighstreet.com/lukedrewthis/product/family-picture-tea-towel) |
| School class tea towels | What schools charge parents | £6 to £7.50 | collected at school | £6 to £7.50 | Fundraiser (snippet) | [Zeffy](https://www.zeffy.com/en-GB/ticketing/self-portrait-tea-towels) |
| RedOwlGiftCo (Etsy, UK) | Children's drawing tea towel, 1 drawing | £8.50 | £3.05 | £11.55 | Everyday | [Etsy](https://www.etsy.com/uk/listing/711876495/personalised-childrens-drawing-tea-towel) |
| GetInvitedUK (Etsy, UK) | Children's drawing tea towel | £9.99 | £2.99 | £12.98 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4482925893/personalised-childrens-drawing-tea-towel) |
| HandmadebyStaceyx (Etsy, UK, Bestseller) | Children's drawing tea towel | £11.95 | £3.95 | £15.90 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4316046465/personalised-tea-towel-childrens-drawing) |
| oliveandpip (Etsy, UK) | Children's drawing tea towel | £18.99 | £2.50 | £21.49 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1299077202/childrens-drawing-tea-towel-kids-own) |
| MoodyMoonStudioShop (Etsy, UK) | Kids drawing waffle tea towel | £16.10 (was £21.46) | £5.45 | £21.55 | Sale | [Etsy](https://www.etsy.com/uk/listing/4576758292/custom-kids-drawing-tea-towel-waffle-tea) |
| Snapfish | Tea towel | £8.49 (was £16.99) | from £2.69 | £11.18 (£19.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/christmas-and-holiday-photo-gifts) |
| Bags of Love | Tea towel | £11.95 (30% off) | £4.95 | £16.90 | Sale | [Bags of Love](https://www.bagsoflove.co.uk/personalised-towels) |
| Photo-Canvas.com | Cotton-linen tea towel | from £11.95 | £4.95 | £16.90 | Everyday (snippet) | [Photo-Canvas](https://www.photo-canvas.com/personalised-tea-towel) |
| Zazzle UK | Photo tea towels | about £18.40 to £20 | not shown | about £18.40 to £20 + delivery | Everyday (snippet) | [Zazzle](https://www.zazzle.co.uk/photo+tea+towels) |

**Bands (delivered):** drawing specialist £28.50 to £30.50 · Etsy drawing sellers low £11.55, typical £13 to £16, high £21.55 · mass sites £11 to £20.

**Verdict: within the specialist band, above everyone else.** Only lukedrewthis prices a drawing tea towel this high. Many parents also meet the product through school fundraisers at £6 to £7.50, which makes £27 a hard sell unless the quality is visibly better.

## Clothing and accessories: tees fit the niche, the watch strap overreaches

*All rows in this section seen 26 Nov 2026.*

### Kids' tees: £25 sits just under lukedrewthis

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| lukedrewthis | Kids' organic tee with their drawing | £24 | £3.50 to £5.50 | about £27.50 to £29.50 | Everyday | [lukedrewthis](https://www.lukedrewthis.co.uk/) |
| SolaraCandles (Etsy, UK) | Kids drawing tee, printed | £9.68 to £11.63 by age | free | same | Everyday | [Etsy](https://www.etsy.com/uk/listing/4609805785/custom-kids-drawing-t-shirt-child) |
| KapraDesign (Etsy, UK) | Kids drawing tee | from £12.99 (was £43.30) | free | £12.99 | Sale | [Etsy](https://www.etsy.com/uk/listing/1876841796/personalised-kids-drawing-t-shirt-custom) |
| LittleBigApparelCo (Etsy, UK, Bestseller) | Kids photo/drawing tee | from £15.30 (was £22.50) | £4.25 | £19.55 (£26.75) | Sale | [Etsy](https://www.etsy.com/uk/listing/4510686512/custom-kids-photo-drawing-t-shirt) |
| EzgyEmbroideryStudio (Etsy, UK) | Embroidered kids drawing tee | £19.84 | free | £19.84 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4550086041/custom-kids-photo-drawing-embroidered-t) |
| FestiveTrendz (Etsy, UK) | Embroidered kids drawing tee, ages 2 to 13 | £21.99 | free | £21.99 | Sale (card "was £39.97") | [Etsy](https://www.etsy.com/uk/listing/4315348262/custom-embroidered-kids-drawing-tshirt) |
| Funky Pigeon | Toddler photo tee | £12 | £2.49 to £2.95 (snippet) | about £14.50 to £15 | Everyday | [Funky Pigeon](https://www.funkypigeon.com/gifts/t-shirts) |
| ASDA Photo | Photo tee | from £15 | not shown | £15 + delivery | Everyday | [ASDA](https://photo.asda.com/photo-gifts) |
| Vistaprint | Kids' tee, promo range | £6.30 to £10.79 (was £6.99 to £11.99) | £4.99 | £11.29 to £15.78 | Sale | [Vistaprint](https://www.vistaprint.co.uk/clothing-bags/t-shirts/all-kids-t-shirts) |

**Bands (delivered):** drawing specialist £27.50 to £29.50 · Etsy drawing sellers £10 to £22 · mass sites £11 to £17.

**Verdict: within the specialist band.** At £25 white or £27 coloured, Snickerdoodle is at or just below lukedrewthis delivered, but £3 to £15 above Etsy. Older background (July 2026 brief, not rechecked): lukedrewthis then charged £26, and the drawing-tee niche ran £26 to £35 ([PRICING-elasticity-premium.md](../project-office/briefs/PRICING-elasticity-premium.md)).

### Adult tees: £32 is mid-niche

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| lukedrewthis | Women's tee / men's tee | £30 / from £35 | £3.50 to £5.50 | about £33.50 to £35.50 / £38.50 to £40.50 | Everyday | [lukedrewthis](https://www.lukedrewthis.co.uk/) |
| oliveandpip (Etsy, UK) | Child's drawing tee, adult | £24.99 | £2.50 | £27.49 | Everyday | [Etsy](https://www.etsy.com/uk/listing/777477341/childrens-drawing-t-shirt-daddy-t-shirt) |
| StitchedUpBridal (Etsy, UK) | Embroidered drawing tee, adult | £24 (was £32) | £2.95 | £26.95 (£34.95) | Sale | [Etsy](https://www.etsy.com/uk/listing/4525941318/personalised-childs-drawing-embroidered) |
| SewnByCarolineStudio (Etsy, UK) | Organic tee, embroidered drawing | £26 | £4.50 | £30.50 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4374024150/adult-unisex-organic-cotton-t-shirt-with) |
| LittleBigApparelCo (Etsy, UK) | Adult unisex drawing tee | £33.15 | £4.25 | £37.40 | Sale price on menu | [Etsy](https://www.etsy.com/uk/listing/4510686512/custom-kids-photo-drawing-t-shirt) |
| Funky Pigeon | Adult photo tee | £16 (some £12 to £15) | £2.49 to £2.95 (snippet) | about £18.50 to £19 | Everyday | [Funky Pigeon](https://www.funkypigeon.com/gifts/t-shirts) |
| Vistaprint | Adult unisex tee, cheapest range | £4.67 to £9.76 | £4.99 | £9.66 to £14.75 | Sale | [Vistaprint](https://www.vistaprint.co.uk/clothing-bags/t-shirts/all-unisex-t-shirts) |

**Bands (delivered):** drawing specialist £33.50 to £40.50 · Etsy drawing sellers £27 to £37 · mass sites £10 to £21.

**Verdict: within the band.** £32 is just below lukedrewthis and in the middle of the Etsy drawing range.

### Socks: £20 matches the leading drawing-sock seller

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Solesmith (Etsy, UK) | Child's drawing socks | £17.60 (was £22) | £1.99 | £19.59 (£23.99) | Sale | [Etsy](https://www.etsy.com/uk/listing/1019569342/personalised-childs-drawing-socks-custom) |
| Solesmith / Alphabet Interiors (NOTHS, Next) | Photo socks | £21.99 to £22 | varies | about £22 | Everyday (snippet) | [NOTHS](https://www.notonthehighstreet.com/alphabetinteriors/product/smiley-face-personalised-photo-socks) |
| Print A Sock | Face socks | £17.99 | free | £17.99 | Everyday (snippet) | [Print A Sock](https://www.printasock.co.uk/products/face-socks) |
| Bags of Love | Photo socks, UK made | £11.95 (was £15) | £4.95 | £16.90 (£19.95) | Sale | [Bags of Love](https://www.bagsoflove.co.uk/personalised-socks.aspx) |
| Card Factory | Photo socks, smiley face | £22 | not shown | £22 + delivery | Everyday (snippet) | [Card Factory](https://www.cardfactory.co.uk/personalised-photo-socks---smiley-face/86327.html) |
| Funky Pigeon | Photo face socks | £10 | £2.49 to £2.95 (snippet) | about £12.50 to £13 | Everyday (snippet) | [Funky Pigeon](https://www.funkypigeon.com/gifts/photo-upload) |
| Jungley (NOTHS) | Christmas pet face socks | £24.65 (was £29) | varies | about £24.65 | Sale (snippet) | [NOTHS](https://www.notonthehighstreet.com/jungley/product/personalised-christmas-pet-face-socks) |

**Bands (delivered):** Etsy drawing seller £19.59 (everyday £23.99) · mass and gift sites £12.50 to £22, with NOTHS up to about £25.

**Verdict: within the band.** £20 sits at Solesmith's sale price and below its everyday price.

### Phone cases: priced like Etsy drawing cases, above the big sites

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| CastroLabs (Etsy, UK) | Child's drawing case: flexi / tough / tough MagSafe | £22.40 / £27.30 / £28.70 (was £32) | free | same | Sale | [Etsy](https://www.etsy.com/uk/listing/4331602952/childs-art-phone-case-personalized) |
| AcasoPrints (Etsy, UK) | Kids drawing phone case | £25.49 (was £29.99) | £3.50 | £28.99 | Sale | [Etsy](https://www.etsy.com/uk/listing/4586512028/kids-custom-drawing-phone-case-for-mom) |
| oliveandpip (Etsy, UK) | Child's drawing phone case | £25.99 | £2.50 | £28.49 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1313639797/childrens-drawing-phone-case) |
| Wrappz | Hard (snap) case / tough case | from £14.95 / from £16.95 | £2.95 | £17.90 / £19.90 | Everyday | [Wrappz](https://www.wrappz.com/personalised-phone-cases) |
| Wrappz | iPhone 15 tough case | £21.95 | £2.95 | £24.90 | Everyday, no sale | [Wrappz](https://www.wrappz.com/personalised-phone-cases/iphone-cases/iphone-15/tough-case) |
| Funky Pigeon | Photo phone case (gel) | £14 | £2.95 (snippet) | about £16.95 | Everyday (snippet) | [Funky Pigeon](https://www.funkypigeon.com/gifts/phone-cases) |

**Bands (delivered):** Etsy drawing sellers £22.40 to £29 · mass sites £17 to £25.

**Verdict: within the Etsy drawing band, about £5 to £10 above the mass sites.** The £30 tough case sits £2.70 above CastroLabs' sale price and £2 below its everyday price.

### Apple Watch straps: £45 is £10 above the only UK upload strap

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Casestation UK | Personalised faux-leather strap, upload pics | £34.99 | not shown | £34.99 + delivery | Everyday | [Casestation](https://uk.casestation.com/personalised-apple-watch-strap/) |
| Etsy UK sellers | Photo-printed silicone / vegan leather straps | about £22 to £32 | varies | — | Many discounted (snippet) | [Etsy](https://www.etsy.com/uk/market/picture_apple_strap) |
| WristoMods (Etsy, overseas) | Kids' drawing engraved on a band | £14.48 (was £20.68) | £21.02 | £35.50 | Sale | [Etsy](https://www.etsy.com/uk/listing/1828708084/kids-hand-drawn-sketch-image-drawing) |
| eBay UK | Custom printed band | £36.74 | varies | — | Everyday (snippet) | [eBay](https://www.ebay.co.uk/itm/234950664192) |
| CustomLoveDecor (Etsy, overseas) | Pet-photo Apple Watch band | £43.89 | free | £43.89 | Sale | [Etsy](https://www.etsy.com/uk/listing/1887061992/personalized-pet-photo-iphone-apple) |

**Bands (delivered):** £22 to £37 for printed or engraved photo straps; one overseas pet-photo band at £44.

**Verdict: above the market.** No UK seller prints a child's drawing on a watch strap, so there is little to compare, but the nearest UK product is £10 cheaper.

## Christmas, paper and games: cards fit, baubles stand out

*All rows in this section seen 26 Nov 2026.*

### Greetings cards and packs: priced at Moonpig for one card, mid-Etsy for packs

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Moonpig | Photo-upload card, standard | £4.19 | £1.35 economy / £1.90 1st / £2.79 tracked | £5.54 / £6.09 / £6.98 | Everyday (30% off 2+ with code) | [Moonpig](https://www.moonpig.com/uk/personalised-cards/p/photo-upload-christmas-card-from-the-family/btn025/); [delivery](https://www.moonpig.com/uk/delivery-information/) |
| Funky Pigeon | Photo card A5 | £3.99 | not shown | £3.99 + delivery | Everyday (50% off 5+ with code) | [Funky Pigeon](https://www.funkypigeon.com/card/merry-woofmas-dog-photo-card/290023) |
| DinkyArtist (Etsy, UK) | Child's drawing greeting card, single | £8 | free | £8 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1086856427/personalised-childs-drawing-greeting) |
| NorthInkCustoms (Etsy, UK) | Child's drawing card: 1 / 5 / 10 | £2.99 / £14.96 / £22.46 | free | same | Everyday | [Etsy](https://www.etsy.com/uk/listing/4581705354/personalised-childs-drawing-card-kids) |
| RedOwlGiftCo (Etsy, UK) | Christmas cards from your child's drawing: 1 / 5 / 8 | £3 / £10 / £16 | £3.05 | £6.05 / £13.05 / £19.05 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4588953810/personalised-christmas-cards-from-your) |
| RonnieBCrafts (Etsy, UK) | Kids artwork Christmas cards: 1 / 6 / 12 | £2.75 / £12 / £18 | £1.00 | £3.75 / £13 / £19 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4389689531/personalised-kids-artwork-christmas) |
| TheLittleGemCompany (Etsy, UK) | Children's drawing Christmas cards: 10 | £14.99 | £2.50 | £17.49 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4398248486/childrens-drawing-christmas-cards-unique) |
| CozybeeCraft (Etsy, UK) | Cards from child's drawing, pack of 10: A6 / A5 | £18.67 / £23.17 (was £24.90) | free | same | Sale | [Etsy](https://www.etsy.com/uk/listing/4622786272/christmas-cards-from-your-childs-drawing) |
| FullCirclePartiesUK (Etsy, UK) | Christmas cards, your own design: 10 | £10 to £11 | £1.00 | £11 to £12 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1595327372/personalised-christmas-cards-your-own) |
| Dinky Artist (NOTHS) | Christmas card set from child's drawing, A5 (count not stated) | from £20 | £2.79 | £22.79 | Everyday | [NOTHS](https://www.notonthehighstreet.com/dinkyartist/product/personalised-christmas-card-sets-with-child-s-drawing) |
| Moonpig (calculated) | 10 standard cards with 30OFF2 code | about £29.33 | £1.35+ | about £30.70+ | Code price (my arithmetic) | [Moonpig](https://www.moonpig.com/uk/personalised-cards/p/photo-upload-christmas-card-from-the-family/btn025/) |
| School fundraiser | 12 A6 cards with envelopes (2025 letter) | £8.99 | via school | £8.99 | Fundraiser, 2025 | [St Joseph's letter](https://files.schudio.com/st-joseph-s-catholic-primary-school-wigan/files/documents/FOSJ_Christmas_Cards_letter_2025.pdf) |

**Bands (delivered):** single card — Etsy £3 to £6 typical (up to £10), Moonpig £5.54 to £6.98, Dinky Artist £8 · pack of 5 — Etsy £13 to £15 · pack of 10 — Etsy £11 to £23, Dinky Artist from £22.79, Moonpig about £30.

**Verdict: within the band.** The £5.50 single matches Moonpig's cheapest delivered price and beats its tracked price. The pack of 5 (£12) is below NorthInkCustoms and RedOwlGiftCo, and the pack of 10 (£21) sits between CozybeeCraft's A6 and A5 packs. School card schemes at about £9 for 12 are the cheapest reference many parents know.

### Calendars: the A4 fits, the A5 looks dear

No UK Etsy seller prints a 2027 calendar from a child's drawings; UK listings are colour-in calendars, a different product. Overseas Etsy sellers do, but delivery makes them expensive.

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Photobox | Wall calendar A4 | from £11.99 (was £23.99) | £3.99* | £15.98 (£27.98) | Sale, 50% off | [Photobox](https://www.photobox.co.uk/personalised-calendars/wall) |
| Vistaprint | Wall calendar A5 / A4 small / A4 double | £5.59 / £6.39 / £9.19 (was £13.99 / £15.99 / £22.99) | £4.99 | £10.58 / £11.38 / £14.18 (£18.98 / £20.98 / £27.98) | Sale, 60% off | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/calendars/wall-calendars) |
| Funky Pigeon | Photo calendar A4 / A3 | £10 / £12.50 | £2.49 to £2.95 (snippet) | about £12.50 to £15.50 | Sale, "50% off all calendars" | [Funky Pigeon](https://www.funkypigeon.com/gift/calendar/single-photo-upload-calendar/133414) |
| Card Factory | Photo-upload calendar | from £9.99 | not shown | £9.99 + delivery | Everyday | [Card Factory](https://www.cardfactory.co.uk/gifts/personalised-gifts/?q=photo&sz=96) |
| Snapfish | Wall calendar 11×17″ open | £12 (was £29.99) | from £2.69 | £14.69 (£32.68) | Sale | [Snapfish](https://www.snapfish.co.uk/home) |
| PrintGalCo (Etsy, overseas) | 2027 wall calendar, kids artwork | £22.98 (was £28.73) | £6.38 | £29.36 | Sale | [Etsy](https://www.etsy.com/uk/listing/4607158273/2027-wall-calendar-personalized-kids) |
| NitroLaneStudio (Etsy, overseas) | 2027 kids artwork wall calendar | £39.22 | £14.93 | £54.15 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4571376975/2027-kids-artwork-calendar-personalized) |
| OnePrintGallery (Etsy, UK) | 2027 colouring / photo calendar (not from art) | £33.74 (was £44.99) | free | £33.74 | Sale | [Etsy](https://www.etsy.com/uk/listing/4619002116/personalised-2027-colouring-calendar) |

**Bands (delivered):** mass A4 everyday £21 to £28, sale £11 to £16 · mass A5 everyday £19, sale £11 · overseas Etsy drawing calendars £29 to £54.

**Verdict: A4 within, A5 above.** The A4 at £24 is £4 under Photobox and Vistaprint at full price, but calendars are 50 to 60% off everywhere in late November, so shoppers will see £11 to £16 delivered. The A5 at £22 is £3 above Vistaprint's full delivered A5 price, and only £2 less than Snickerdoodle's own A4.

### Ornaments and baubles: the clearest overpricing in the range

Baubles are the most commoditised Christmas photo gift. Ceramic drawing ornaments on Etsy are about £8 to £12 delivered, and the plastic or acrylic photo baubles at big sites are £10 to £13 before delivery.

| Seller | Product (material) | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Joanna Emily (NOTHS) | Wooden child's-drawing bauble | £13.50 (was £18) | free | £13.50 (£18) | Sale, 25% off | [NOTHS](https://www.notonthehighstreet.com/joannaemily/product/hand-drawn-wooden-bauble) |
| Dinky Artist (NOTHS) | Handprint keepsake decoration | £20 | £2.79 | £22.79 | Everyday | [NOTHS](https://www.notonthehighstreet.com/dinkyartist) |
| NOTHS sellers | Child's-drawing Christmas decoration / angel decoration | £11.90 / £22.50 (was £14 / £25) | some free | about the same | Sale | [NOTHS](https://www.notonthehighstreet.com/search?term=personalised%20child%27s%20drawing) |
| MaeRoseandRoo (Etsy, UK) | Ceramic disc, child's drawing: 1 / 4 | £8 / £25 | free | same | Everyday | [Etsy](https://www.etsy.com/uk/listing/4612725880/christmas-tree-decoration-personalised) |
| craftylittlefoxshops (Etsy, UK) | Child's artwork ornament, ceramic single / double-sided | £7.15 / £8.95 | £1.65 | £8.80 / £10.60 | Everyday | [Etsy](https://www.etsy.com/uk/listing/898899865/personalised-childs-artwork-christmas) |
| T2UD (Etsy, UK) | Child's drawing made into a decoration | £7.95 | £1.75 | £9.70 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4621237512/personalised-childs-drawing-converted-to) |
| BadgerandBramble (Etsy, UK) | Child's drawing bauble | £7.99 | £3.99 | £11.98 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4547983548/personalised-childs-drawing-christmas) |
| Magicalcreations78 (Etsy, UK) | Drawing enclosed in a clear glass bauble | £10 | £4.50 | £14.50 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1082101166/christmas-tree-decoration-with-your) |
| TwentySevenUK (Etsy, UK) | Child's drawing in a glass dome bauble | £34 | free | £34 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1094400948/personalised-childs-drawing-in-a-dome) |
| Argos | Ceramic photo bauble 6cm | £12 | not shown | £12 + delivery | Everyday (snippet) | [Argos](https://www.argos.co.uk/product/4034278) |
| Uniqueful (NOTHS) | Ceramic photo bauble (out of stock) | £15 | NOTHS free-delivery banner | about £15 | Everyday | [NOTHS](https://www.notonthehighstreet.com/uniqueful/product/personalised-ceramic-photo-bauble) |
| Zazzle UK | Create-your-own round ceramic ornament | £14.84 (was £17.45) | not shown | £14.84 + delivery | Sale (snippet) | [Zazzle](https://www.zazzle.co.uk/christmas+home+living) |
| Bags of Love | Christmas bauble, printed both sides | £14.95 | £4.95 to £5.99 | about £19.90 to £20.94 | Everyday (snippet) | [Bags of Love](https://www.bagsoflove.co.uk/unusual-stocking-fillers) |
| Photobox | Christmas photo bauble | £11.99 | £3.99 | £15.98 | Everyday (snippet) | [Photobox](https://www.photobox.co.uk/content/prices-and-services/home-gifts) |
| Funky Pigeon | Full-photo bauble | from £10 | £2.49 to £2.95 (snippet) | about £12.50 to £13 | Everyday (snippet) | [Funky Pigeon](https://www.funkypigeon.com/gift/bauble/full-photo-bauble/156010) |
| Snapfish | Acrylic round ornament | £8.49 (was £16.99) | from £2.69 | £11.18 (£19.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/christmas-and-holiday-photo-gifts) |
| Printerpix | Photo ornament | £7.98 (was £15.95) | £4.99 | £12.97 (£20.94) | Sale (snippet) | [Printerpix](https://www.printerpix.co.uk/photo-gifts/all/photo-ornament-awin/) |
| Personalised Gifts Shop | Photo-upload bauble | £7.99 (was £9.99) | free over £30 | £7.99 + delivery | Black Friday | [PGS](https://www.personalisedgiftsshop.co.uk/christmas/baubles.html) |

**Bands (delivered):** drawing specialists £13.50 to £22.79 · Etsy drawing sellers, ceramic £8 to £12, glass £14.50 to £34 · mass sites, ceramic £12 to £21, plastic or acrylic £12.50 to £16 everyday (£11 to £13 sale).

**Verdict: above the market.** The £21 ceramic ornament matches only the dearest specialist decoration (Dinky Artist, £22.79 delivered) and is about double a typical Etsy ceramic drawing ornament. The £19 plastic bauble is the biggest outlier in the whole range: plastic is the cheapest bauble material, and its rivals land at £12.50 to £16 even at full price.

### Wrapping paper: level with the one drawing-wrap specialist

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| PersonalisedbyTLPC (Etsy, UK) | Wrapping paper from your child's drawing: 1.5m / 2m / 3m / 5m roll | £17.95 / £20.65 / £24.25 / £27.85 | £3.95 | £21.90 / £24.60 / £28.20 / £31.80 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4571260012/personalised-christmas-wrapping-paper) |
| MintPrintsGB (Etsy, UK) | Child's drawing wrapping paper: 3 sheets 61×61cm / 1m roll | £15.99 / £14.99 | free | same | Everyday | [Etsy](https://www.etsy.com/uk/listing/4600395220/personalised-childs-drawing-wrapping) |
| Zazzle UK | Add-your-photo wrapping paper, 73.66cm × 1.83m | £31.44 (was £39.30) | not shown | £31.44 + delivery | Sale, 20% off | [Zazzle](https://www.zazzle.co.uk/add_your_photo_wrapping_paper_personalised_text-256801755553007673) |
| Bags of Love | Personalised wrapping paper, short 61×79cm | from £8.95 (was £10) | £4.95 | £13.90 | Sale | [Bags of Love](https://www.bagsoflove.co.uk/personalised-wrapping-paper) |
| wrappingpaper.co.uk | Personalised wrap: 1m / 5m / 10m | £10.99 / £34.99 / £64.99 | not shown | + delivery | Everyday (snippet, about 4 months old) | [wrappingpaper.co.uk](https://wrappingpaper.co.uk/) |
| Funky Pigeon | Photo wrapping paper, sheets | from £6 | £2.49 to £2.95 (snippet) | about £8.50 to £9 | Everyday (snippet) | [Funky Pigeon](https://www.funkypigeon.com/gift/wrapping-paper/multi-photo-wrapping-paper/169100) |

**Bands (delivered):** Etsy drawing sellers 2m £24.60, 3m £28.20, 5m £31.80 · mass rolls about £31 to £39 for 1.83m · 5m specialist £34.99 plus delivery.

**Verdict: within the band.** Snickerdoodle's 2m (£23) and 3m (£28) match PersonalisedbyTLPC delivered; the 5m (£38) is £6 above it. Roll widths were not compared.

### Playing cards: drawing-deck price, above a photo deck

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| MartinDesigns12 (Etsy, UK) | Kids artwork playing cards: paper box / metal box | £18.20 / £23.10 (was £26) | £3.99 | £22.19 / £27.09 (£29.99) | Sale | [Etsy](https://www.etsy.com/uk/listing/4520072110/personalised-kids-artwork-playing-cards) |
| Boots Photo | Personalised playing cards, photo on back | £12.99 | extra, amount not shown | £12.99 + delivery | Everyday | [Boots](https://www.bootsphoto.com/photo-gifts/toys-and-games/personalised-playing-cards.html) |
| Snapfish | Playing cards | £6.99 (was £13.99) | from £2.69 | £9.68 (£16.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/christmas-and-holiday-photo-gifts) |
| Zazzle UK | Photo playing cards | about £14.70 to £16.55 | not shown | + delivery | Everyday (snippet) | [Zazzle](https://www.zazzle.co.uk/photo+playing+cards) |

**Bands (delivered):** Etsy drawing seller £22 to £30 · mass sites £13 to £17 everyday.

**Verdict: within the Etsy drawing band, above mass.** The only UK drawing deck seen costs about the same; a photo deck from Boots or Snapfish is £7 to £11 cheaper.

### Jigsaws in a tin: within the photo-site range

No UK drawing specialist sells a jigsaw at a listed price, and only one UK Etsy shop does (HandmadebyStaceyx, from £11.95 plus £3.95, with piece tiers that are not clearly explained: [Etsy](https://www.etsy.com/uk/listing/4500332612/personalised-jigsaw-puzzle-childrens)).

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Photobox | Ravensburger jigsaw 49 / 100 / 200 pieces | £20.99 / £23.99 / £25.19 (was £34.99 / £39.99 / £41.99) | £3.99* | £24.98 / £27.98 / £29.18 (£38.98 / £43.98 / £45.98) | Sale, 40% off | [Photobox](https://www.photobox.co.uk/personalised-jigsaw) |
| Vistaprint | Jigsaw 80 / 120 / 300 pieces | £11.99 / £15.99 / £18.39 (was £14.99 / £19.99 / £22.99) | £4.99 | £16.98 / £20.98 / £23.38 (£19.98 / £24.98 / £27.98) | Sale, 20% off | [Vistaprint](https://www.vistaprint.co.uk/photo-gifts/custom-jigsaw-puzzles) |
| Funky Pigeon | Photo jigsaw 30 / 500 pieces | £15 / £25 | £2.49 to £2.95 (snippet) | about £17.50 to £18 / £27.50 to £28 | Everyday | [Funky Pigeon](https://www.funkypigeon.com/gift/jigsaw/full-photo-upload-jigsaw/185418) |
| Menkind | Family photo jigsaw | £31.35 (was £33) | not captured | + delivery | Sale | [Menkind](https://www.menkind.co.uk/personalised-gifts/personalised-photo-gifts) |
| EcluneStudio (Etsy, overseas) | 30-piece puzzle from child's drawing | £25.85 | £8.23 | £34.08 | Sale | [Etsy](https://www.etsy.com/uk/listing/4611574382/custom-puzzle-from-childs-drawing) |
| PuzzleLoversGift (Etsy, overseas) | Kids drawing puzzle | £31.62 | £7.85 | £39.47 | Everyday | [Etsy](https://www.etsy.com/uk/listing/4468780675/custom-kids-drawing-puzzle-turn-child) |

**Bands (delivered):** mass sites everyday £18 to £46, sale £17 to £31 · overseas Etsy drawing puzzles £34 to £39.

**Verdict: within the mass band.** The 110-piece (£30) and 252-piece (£35) sit £10 to £14 under Photobox's full price for similar counts, but £5 to £7 above Vistaprint. The 30-piece at £26 is £8 above Funky Pigeon's 30-piece. The tin is the visible difference.

## Table and nursery: height charts have an open lane, placemats run high

*All rows in this section seen 26 Nov 2026.*

### Height charts: nobody else prints the child's own art

No seller found prints a child's own drawing on a height chart. The rivals are illustrated name charts, mostly with free delivery.

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Pepper Print Shop (Etsy, UK) | Personalised canvas height chart | £25.50 (was £30) | free | £25.50 | Sale | [Etsy](https://www.etsy.com/uk/listing/735963807/personalised-pastel-or-bright-rainbow) |
| Pepper Print Shop (NOTHS) | Canvas height chart / 6ft family chart | £30 / £38 | varies | about £30 / £38 | Everyday (snippet) | [NOTHS](https://www.notonthehighstreet.com/pepperprintshop/product/personalised-rainbow-canvas-height-chart) |
| Made by Ellis (Etsy, UK) | "As tall as" height chart | £29.20 (was £36.50; others £32.50 to £36.50) | free | £29.20 | Sale | [Etsy](https://www.etsy.com/uk/listing/1607871351/personalised-as-tall-as-height-chart) |
| Made by Ellis (NOTHS) | "As tall as" height chart | £34 | varies | about £34 | Everyday (snippet) | [NOTHS](https://www.notonthehighstreet.com/madebyellis/product/personalised-as-tall-as-height-chart) |
| James Ellis | Alphabet canvas and wood chart, + name | £32.50 + £4 | not shown | £36.50 + delivery | Everyday (snippet) | [James Ellis](https://www.jamesellis.com/products/personalised-alphabet-height-chart) |
| AtomicSquibbler (Etsy, UK) | Self-adhesive height chart | £39 | free | £39 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1700341139/giraffe-self-adhesive-childrens-height) |
| Good Things To Come | Wooden photo height chart, 6 photo slots | £31.50 (was £45) | not shown | + delivery | Sale (snippet) | [GLTC](https://www.gltc.co.uk/products/photo-height-chart) |
| TillieMint (NOTHS) | Rainbow height chart | £70 | varies | about £70 | Everyday (snippet) | [NOTHS](https://www.notonthehighstreet.com/tilliemint/product/personalised-rainbow-height-chart) |
| Jessops Photo | Paper photo-and-name height chart 8×36″ | £8 | not shown | + delivery | Everyday (snippet) | [Jessops](https://photo.jessops.com/product/personalised-height-charts/) |

**Bands (delivered):** low £8 (paper) · typical £25.50 to £38 for canvas · high £70.

**Verdict: within the band.** £31 to £36 matches canvas name charts, and Snickerdoodle is the only one using the child's own drawing.

### Placemats: £15 a mat against a £9 to £12 norm

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| DinkyArtist (Etsy, UK) | Placemat set with child's drawing: single / 4 / 6 / 8 | £15 / £45 / £65 / £80 | £3.50 | £18.50 / £48.50 / £68.50 / £83.50 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1167828646/mummys-personalised-placemat-set-with) |
| Asda Photo | Photo placemats, MDF and cork, set of 4 | £37.50 | not shown | + delivery | Everyday (snippet) | [Asda](https://photo.asda.com/product/personalised-photo-placemats) |
| Max Photo | Photo placemats, set of 4 | £37.50 | not shown | + delivery | Everyday (snippet) | [Max Photo](https://www.maxphoto.co.uk/photo-placemat) |
| Splashbacks.co.uk | Glass photo placemats, 4-pack | £44.99 | not shown | + delivery | Everyday (snippet) | [Splashbacks](https://splashbacks.co.uk/splashback/personalised-glass-photo-placemats-4-pack/) |
| Snappy Snaps (branch pages) | MDF photo placemats, set of 4 | £46 to £68 | in-store / varies | — | Everyday (snippet) | [Snappy Snaps](https://www.snappysnaps.co.uk/brighton/photo-placemats) |
| Boots Photo | Personalised placemat, single | £9.99 | extra, amount not shown | £9.99 + delivery | Everyday | [Boots](https://www.bootsphoto.com/photo-gifts/for-the-home/place-mat.html) |
| Snapfish | Single photo placemat | £16.99 | from £2.69 | £19.68 | Everyday (snippet) | [Snapfish](https://www.snapfish.co.uk/design-detail?category=StoreCat_622229&dgId=880c4f4e4d634df09d8998d7eae50665&designId=dd442b2da2874beba905306e28abc5a3&sku=CommerceProduct_25696&ptype=homegifts&pcat=simple_79006_1580117487_snapfish_uk&designName=Simple&dgCatId=simple_79006_1580117487_snapfish_uk&sortCriteria=toppicks) |

**Bands (delivered, set of 4):** Etsy drawing seller £48.50 · mass sites typical £37.50 plus delivery, range £28 to £68.

**Verdict: above the market.** £60 is £11.50 above the only drawing-placemat set and about £20 above the usual photo set.

### Coasters: per piece, cheaper than Etsy drawing coasters

| Seller | Product | Price | UK delivery | Delivered | Sale or everyday | Source |
|---|---|---|---|---|---|---|
| Dinky Artist (NOTHS) | Engraved coasters (count not stated) | £12 | £2.79 | £14.79 | Everyday | [NOTHS](https://www.notonthehighstreet.com/dinkyartist) |
| A2B2crafts (Etsy, UK) | Kids artwork coaster, single | £6 | free | £6 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1571925449/custom-kids-artwork-coaster-personalized) |
| BandBDesignsUK (Etsy, UK) | Child's artwork ceramic coaster | £7.20 (was £9) | £2.80 | £10 | Sale | [Etsy](https://www.etsy.com/uk/listing/4574383228/childs-artwork-ceramic-coaster) |
| Jelliegiftco (Etsy, UK) | Child's drawing coaster | £9.99 | free | £9.99 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1104772474/childs-drawing-coaster-kids-artwork) |
| RusticFlitch (Etsy, UK) | Kids drawing acrylic coaster | £11.99 | free | £11.99 | Everyday | [Etsy](https://www.etsy.com/uk/listing/1292742843/personalised-kids-drawing-printed) |
| Printerpix | Photo coasters 2 / 4 / 6 | £11.98 / £19.98 / £27.98 (4 was £39.95) | £4.99 | £16.97 / £24.97 / £32.97 | Sale, ends 29 Nov | [Printerpix](https://www.printerpix.co.uk/photo-gifts/all/personalised-photo-coasters/) |
| Snapfish | Coasters, set of 4 | £9.99 (was £19.99) | from £2.69 | £12.68 (£22.68) | Always-on 50% "sale" | [Snapfish](https://www.snapfish.co.uk/christmas-and-holiday-photo-gifts) |
| Snapfish | Coasters, set of 6 | £27.99 | from £2.69 | £30.68 | Everyday (snippet) | [Snapfish](https://www.snapfish.co.uk/product-details?category=StoreCat_622229&sku=CommerceProduct_142840) |
| Photobox | Photo coasters, set of 4 | £19.99 | £3.99 | £23.98 | Everyday (snippet) | [Photobox](https://www.photobox.co.uk/shop/gifts-objects/102/prices) |
| Boots Photo | Photo coaster 2 / 6 | £7.99 / £17.99 | extra, amount not shown | + delivery | Everyday (snippet) | [Boots](https://www.bootsphoto.com/photo-gifts/for-the-home.html) |
| Max Photo / Keep It Personal | Photo coasters, set of 4 | £18.50 / from £16.99 | not shown | + delivery | Everyday (snippet) | [Max Photo](https://www.maxphoto.co.uk/personalised-photo-coaster); [Keep It Personal](https://www.keepitpersonal.co.uk/personalised-gifts-c-112/personalised-coasters-c-112_249/set-of-4-personalised-photo-coasters-p-3467.html) |

**Bands (delivered):** Etsy drawing coasters £6 to £12 each · mass 2-pack £17, 4-pack £17 to £25 everyday, 6-pack £31 to £33.

**Verdict: within the band, at the top of the mass range.** At £6.50 a coaster in the 4-pack and £5.67 in the 6-pack, Snickerdoodle is cheaper per piece than most Etsy drawing coasters, and £1 to £3 above the big sites' sets.

### The Christmas family bundle has no direct rival

Nobody else sells a placemat, coaster and ornament set made from a child's drawing. The bundle saves money against Snickerdoodle's own prices: the set for 4 (£145) costs £25 less than four placemats (£60), four coasters (£26) and four ceramic ornaments (£84) bought separately, before any multi-buy saving. The set for 8 (£279) is £61 under the separate total of £340. Built from other shops, a set for 4 costs roughly £97.50 from three Etsy drawing sellers (DinkyArtist placemats £48.50, four A2B2crafts coasters £24, four MaeRoseandRoo ceramic ornaments £25) or around £105 plus delivery from photo sites (Asda placemats £37.50, Snapfish coasters £19.99, four Argos ceramic baubles £48), using the sources above. **The bundle sits £40 to £50 above a do-it-yourself basket**, so its pitch is one matching set, one upload and one delivery rather than price.

## Multi-buys: "buy more & save" is rare among rivals

Snickerdoodle's "up to 15% off 2+ of the same product, plus £3 off each extra item in the same parcel" is more generous than most rivals. None of the drawing specialists ran a true multi-buy; they rely on seasonal sales (Dinky Artist's "up to 50%" Black Friday, NOTHS sellers at 20 to 25% off) and free-delivery thresholds (Dinky Artist £30 on NOTHS and £75 on its own site) ([Dinky Artist](https://www.dinkyartist.com/); [NOTHS](https://www.notonthehighstreet.com/dinkyartist/product/personalised-christmas-card-sets-with-child-s-drawing)). The big sites use codes: Moonpig 30% off two or more cards, Funky Pigeon 50% off five or more ([Moonpig](https://www.moonpig.com/uk/personalised-cards/p/photo-upload-christmas-card-from-the-family/btn025/); [Funky Pigeon](https://www.funkypigeon.com/card/merry-woofmas-dog-photo-card/290023)). Etsy sellers build quantity steps into the listing, for example MaeRoseandRoo's ceramic ornaments at £8 for one and £30 for five ([Etsy](https://www.etsy.com/uk/listing/4612725880/christmas-tree-decoration-personalised)). The free-delivery thresholds seen elsewhere sit at £30 (Personalised Gifts Shop), £40 (Vistaprint) and £70 to £75 (Custom Chic, Dinky Artist).

## EU and US context: similar mass prices, much dearer US specialists

*All rows seen 26 Nov 2026. €1 = £0.87, $1 = £0.79.*

| Product | Market | Seller | Price | ≈ £ | Delivery | Source |
|---|---|---|---|---|---|---|
| Mug | Germany | CEWE classic photo mug | from €12.99 | £11.30 | extra, not shown | [cewe.de](https://www.cewe.de/fotogeschenke/fototassen-trinkgefaesse.html) |
| Mug | Netherlands | Smartphoto white photo mug | €11.99 | £10.43 | €4.99 (£4.34) | [smartphoto.nl](https://www.smartphoto.nl/fotocadeaus/mok-met-foto) |
| Mug | US | Zazzle "turn your child's artwork into a mug" | $13.56 sale ($15.95) | £10.71 (£12.60) | not shown | [zazzle.com](https://www.zazzle.com/turn_your_childs_artwork_or_drawing_into_a_coffee_mug-168743509795201800) (snippet) |
| Framed print | US | Shutterfly 8×10″ framed print | $84.99 sale ($99.98) | £67 (£79) | not shown | [shutterfly.com](https://www.shutterfly.com/t/framed-prints/?dimensions=8x10) (snippet) |
| Framed print | US | Minted child's drawing art print, small frame | about $104 | about £82 | not shown | [minted.com](https://www.minted.com/product/custom-commissioned-art/MIN-2CJ-KCF/hand-painted-chevron) (search summary; listing unclear) |
| Cushion | Netherlands | Albelli mini / medium / large | €26.99 / €42.99 / €63.99 | £23.48 / £37.40 / £55.67 | at checkout | [albelli.nl](https://www.albelli.nl/prijsoverzicht) |
| Cushion | France | Photobox cushion | from €37.99 | £33.05 | not shown | [photobox.fr](https://www.photobox.fr/produits-photo) |
| Kids' / adult tee | US | Picture This Clothing, made from the drawing | from $59 / from $69 | £46.61 / £54.51 | not shown | [picturethisclothing.com](https://www.picturethisclothing.com/) |
| Jigsaw | Netherlands | Albelli 100 / 500 / 1000 pieces | €37.99 / €42.99 / €52.99 | £33.05 / £37.40 / £46.10 | at checkout | [albelli.nl](https://www.albelli.nl/prijsoverzicht) |
| Blanket | Germany | Pixum photo fleece blanket | from €44.99 | £39.14 | €3.99 to €4.99 | [pixum.de](https://www.pixum.de/fotogeschenke) |
| Blanket | US | Shutterfly fleece | $24.99 sale ($39.99) | £19.74 (£31.59) | not shown | [shutterfly.com](https://www.shutterfly.com/t/photo-blankets/) (snippet) |
| Cards | Netherlands | Albelli photo cards, pack of 10 | €10.99 | £9.56 | at checkout | [albelli.nl](https://www.albelli.nl/prijsoverzicht) |
| Calendar | Netherlands | Albelli A4 / A5 | €21.99 / €11.99 | £19.13 / £10.43 | at checkout | [albelli.nl](https://www.albelli.nl/prijsoverzicht) |
| Calendar | Germany | Pixum A4 photo calendar | €18.99 | £16.52 | €4.99 | [pixum.de](https://www.pixum.de/fotokalender/fotokalender-a4) (snippet) |
| Ornament | Germany | Pixum photo Christmas ornament | from €9.99 | £8.69 | €3.99 to €4.99 | [pixum.de](https://www.pixum.de/fotogeschenke) |
| Ornament | US | Etsy kids-art ceramic ornaments | $8.25 to $14.99 | £6.52 to £11.84 | varies | [etsy.com](https://www.etsy.com/market/kids_drawing_ornament) (snippet) |
| Phone case | Netherlands | Smartphoto smartphone case | from €19.99 | £17.39 | not shown | [smartphoto.nl](https://www.smartphoto.nl/fotocadeaus) |

Mass photo gifts cost about the same in the EU and US as in the UK once currency is converted: a mug about £10 to £11, an A4 calendar £15 to £19, an ornament £8 to £10. The gap opens with specialists. US drawing-to-clothing maker Picture This Clothing starts at about £47 for a kids' tee, nearly double Snickerdoodle's £25, and US framed prints start around £67 for 8×10″, more than Snickerdoodle's 11×14″. An EU or US shopper would see Snickerdoodle's mugs, calendars and ornaments as normal or dear, and its tees and frames as good value.

## How reliable this is

**Sale-week distortion is the biggest caveat.** Everything was captured during Black Friday week. Vistaprint's sale ended on 26 Nov, ASDA's and Dinky Artist's run to 30 Nov, and Printerpix's coaster offer ends 29 Nov, so the "sale" columns are deeper than a normal week. At the same time, some "everyday" prices are not real: Snapfish shows almost everything at exactly 50% off all year, and Printerpix shows 65 to 70% off against inflated "was" prices, so for those two the sale price is closer to what people actually pay ([Snapfish](https://www.snapfish.co.uk/home); [Printerpix](https://www.printerpix.co.uk/photo-blankets/)). Etsy drawing sellers were also running Cyber-week discounts, so their normal prices are typically 10 to 30% higher than shown. A recheck in the second week of December would show the post-sale level.

**Several sites could not be read in full.** Truprint closed in April 2020 and its customers moved to Snapfish. Photobox product pages for the less common items were blocked, so its bauble and coaster prices are snippets. Funky Pigeon was rate-limited, so its phone case, sock, bauble and delivery figures are snippets. Vistaprint showed no readable prices for baubles, socks and coasters. Caseapp's website did not load, Boots Photo's main photo-gifts page was empty, Prezzybox now redirects to Menkind, and Getting Personal now redirects to Card Factory. In the US, Budsies and Minted blocked automated reads, and Minted's drawing-print price comes from a search summary whose listing is unclear. Etsy could be read only through a real browser; its results are personalised and ad-ranked, so they are a sample, not a census.

**Some comparisons are thin or not quite like for like.** Several product types rest on one rival: drawing socks (Solesmith), drawing playing cards (MartinDesigns12), drawing placemats (DinkyArtist), drawing wrapping paper on rolls (PersonalisedbyTLPC) and UK drawing blankets (DreamWithDragons). No UK seller was found printing a child's drawing on a calendar, height chart or Apple Watch strap, and no UK specialist had a listed price for framed prints, jigsaws, blankets, phone cases or socks. Sizes rarely line up exactly: framed posters are metric, Snickerdoodle's are in inches, and Snickerdoodle's blanket sizes and wrapping-paper widths were not in the brief. Where a rival's delivery charge was not shown (ASDA, Card Factory, Boots, Zazzle, Menkind) the delivered price is understated. Where lukedrewthis's delivery band depends on parcel size, a range is given. Photobox's £3.99 standard gift delivery was applied to its cushions, jigsaws, frames and calendars, though it was seen only on its mug and gifts pages. Etsy shop sales figures cover the whole shop, not one listing, so they show that a shop sells, not that a given price sells.

## Conclusion

The pattern across the range is consistent: Snickerdoodle has priced itself as a keepsake maker, and it holds that position best where the product is visibly a crafted object or wall piece (frames, tees, cushions, height charts). It holds it worst where the product is a small, low-priced Christmas commodity that Etsy sellers sell at £8 to £12 delivered and photo sites sell for less (baubles, especially the plastic one), and where rivals are discounting hard (blankets, calendars). Placemats and the watch strap sit above their nearest rivals without a clear quality story to explain the gap. Free delivery is a real and under-told advantage: it closes most of the £3 to £6 gap that shoppers will otherwise see against the big sites' headline prices, so it is worth showing as "£X delivered" wherever Snickerdoodle is compared.

The open lanes are where no one else prints the child's own drawing at all: height charts, calendars, watch straps and the matching Christmas table set. There, Snickerdoodle sets the price rather than following it. The older July 2026 brief (background, not rechecked) warned that premium drawing prices are mostly earned by shops with thousands of reviews behind them, and that a new brand has to build that trust first ([PRICING-elasticity-premium.md](../project-office/briefs/PRICING-elasticity-premium.md)). That makes the outliers the first places to look: a £19 plastic bauble and a £60 blanket are where a first-time visitor comparing tabs this week is most likely to leave.

---

# What we could change

Suggestions only. No price in the code has changed. The private sheet (section 5) gives the profit behind each one.

1. **Raise the prices the market says are low.** The 12″ square cushions (£30 one side / £35 both sides) are about £10
   under lukedrewthis's drawing cushion. The 24×32″ framed print (£105) is under Photobox's full price for a smaller
   frame. Trying £34 / £39 for the 12″ cushions and £115 for the 24×32″ frame would still leave them at or below the
   drawing makers.
2. **Don't cut the Christmas ornaments: sell them in threes.** The £19 plastic bauble and £21 ceramic ornament are the
   clearest outliers (Etsy drawing ornaments are £8 to £12). Prodigi's cost and post leave no room for a big cut. Buy
   more & save plus the same-parcel saving already make several much cheaper each, so put that on the product page
   ("£X each when you buy 3") and lead with the Christmas bundle. Think about dropping the plastic bauble: it is the
   dearest against the market and Prodigi's post for it is untracked.
3. **Charge £2 more for coloured adult tees, as the kids tee already does** (£32 white or black, £34 navy, grey or
   khaki). Prodigi charges more for those colours. Separately, fix the cost loader so it stores each colour's own cost
   (see Part 1); that is a small code change, not a price change.

Also worth doing: show **"delivered"** next to every price, and test the watch strap at **£40** (the nearest UK
upload strap is £34.99). The A5 calendar, blankets and placemats also sit above their rivals, but Prodigi's costs
leave little room to cut them: the private sheet shows by how much. After Black Friday (around 8 December), re-check
the big sites' prices: this week's sale prices make them look cheaper than normal.
