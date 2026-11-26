# Fulfilment options for a Snickerdoodle subscription (Prodigi first, UK/EU POD alternatives)

Scope: map each subscription idea (monthly/quarterly sticker sheet, sticky-note pad, mini prints/postcards, greetings cards, fridge magnet; yearly calendar; yearly "year in drawings" photo book; birthday keepsake) to concrete Prodigi SKUs, or the best UK/EU POD with an API. Researched 26 Nov 2026. As instructed, no exact Prodigi costs from private files are given. Repo cost notes are described only in relative terms. Public Prodigi "from" prices are quoted where the website shows them. Snickerdoodle's own retail prices from the repo are quoted, because they are not Prodigi costs.

## 1. What the repo already wires up (Prodigi SKUs in src/server/catalogue.ts)

### Takeaway
Snickerdoodle already has live, sandbox-validated Prodigi wiring for three of the subscription formats:
- greetings cards and card packs (UK lab uk7, a cheap flat letter-post route);
- a dated 2027 A5/A4 wall calendar (lab uk15, 13 print areas);
- a hardcover A5/A4 photo book (BOOK-FE-*-HARD-G).

The photo book is paused because it needs multi-page PDF rendering. A fridge-magnet SKU (MAG-4-10X10), spiral notebooks and softcover books have been sandbox-quoted in briefs but are not in the catalogue. There is nothing for stickers, sticker sheets or sticky notes.

### Cited Findings
**Cards (live)**
- Single greetings card: `CLASSIC-GRE-FEDR-7X5-BLA`, a 7×5″ portrait card on 330gsm Fedrigoni with envelope included. The print file is a 4-panel spread, 6120×2160 px, with the front panel at 1530×2160 px at 300dpi. Retail is £5.50. — [src/server/catalogue.ts](src/server/catalogue.ts) (card, lines ~447-461)
- Card packs use the same SKU, with N card lines in one Prodigi order. Pack of 5 is £12 and pack of 10 is £21, blank inside, one envelope per card, live since 2026-10-21. A code comment records that the sandbox postage is a single flat, untracked Guernsey Post rate (lab uk7) covering 1–15 cards. That is the cheapest letterbox route the repo has found. — [src/server/catalogue.ts](src/server/catalogue.ts) (cardPack, lines ~462-476)

**Calendar (live)**
- Dated 2027 wall calendar: `CALENDAR-A5-L-DATED` (2480×1748 px a page) and `CALENDAR-A4-L-DATED` (3507×2480 px). Both are landscape, silk 300gsm, a cover plus 12 months.
- The order sends 13 files to the `cover` and `january`…`december` print areas; the optional back cover is not sent. Lab is uk15, there is NO Express service, and retail is A5 £22 / A4 £24.
- Code comment: "Swap to the 2028 SKUs when Prodigi lists them". So the dated calendar is tied to a calendar year, January to December. — [src/server/catalogue.ts](src/server/catalogue.ts) (calendar, lines ~477-497); [src/lib/delivery.ts](src/lib/delivery.ts) line 23 ("Products Prodigi has NO Express service for — the dated calendar (lab uk15)")

**Photo book (paused)**
- Storybook: `BOOK-FE-A5-P-HARD-G` (page 1748×2480 px) and `BOOK-FE-A4-P-HARD-G` (2480×3507 px). Hardcover gloss, 24 pages, retail £26/£29.
- It is PAUSED because "Prodigi refuses a book order without its pages (pageCount + one file per page — `InvalidPageCount`)". — [src/server/catalogue.ts](src/server/catalogue.ts) (storybook, lines ~411-423)

**Sandbox-quoted in briefs but not in the catalogue**
- Softcover photo books: `BOOK-FE-A5-P-SOFT-G`, `BOOK-FE-8_3-SQ-SOFT-G` and `BOOK-FE-A4-P-SOFT-G`, plus hardcover square `BOOK-FE-8_3-SQ-HARD-G`. All are lab uk15 and need `pageCount` plus PDF files.
- Spiral notebooks: `NB-LINED-A4` and `NB-GRAPH-A4`, lab prodigi_gb2, with one cover image. "A5 is not available (NB-*-A5 → 404)".
- The brief says books "take 96–120 h to make". — [project-office/briefs/PRODUCT-RANGE-global-uk-nov.md](project-office/briefs/PRODUCT-RANGE-global-uk-nov.md)
- Fridge magnets: `MAG-4-10X10`, "4 images 10×10", lab gb2 to Royal Mail RM24 (untracked) on Standard. The brief suggests a shelf price of ~£10 and calls it a "Stocking filler; 4 drawings in one". — [project-office/briefs/CHRISTMAS-range-and-postage.md](project-office/briefs/CHRISTMAS-range-and-postage.md) §2.2
- Asset coverage: kiss-cut stickers have only a stock mockup; there is a magnets template; wall stickers are a gap. — [project-office/briefs/PRODIGI-ASSET-COVERAGE.md](project-office/briefs/PRODIGI-ASSET-COVERAGE.md)

**Other live SKUs, for reference (not subscription formats)**
- Framed prints `GLOBAL-CFP-11X14`…`24X32`
- Multi-photo frames `GLOBAL-MPF-*`
- Jigsaws `JIGSAW-PUZZLE-30/110/252`
- Mugs `H-MUG-11OZ-*`
- Cushions `GLOBAL-CUSH-*`
- Placemats and coasters `H-PLACE-*PK` / `H-COAST-*PK`
- Socks `GLOBAL-ANKLE-SOCKS` / `GLOBAL-TUBE-SOCKS`
- Height chart `POSTER-HANGER-*`
- Wrapping paper `WRAP-ROL-*` / `WRAP-KFT-ROL-*`
- Garments (`HOOD-SS-*`, `SWEAT-SS-STSK913`, `GLOBAL-SWEAT-AWD-JH030`, `GLOBAL-BB-RS-4411`)
- Bandanas `PET-BANDANA-*`
- Ornaments `XMAS-*`

— [src/server/catalogue.ts](src/server/catalogue.ts)

**Lead times coded**
- [src/lib/delivery.ts](src/lib/delivery.ts) lines 83-85 gives working-day ranges per lab:
  - uk7 (cards): handling 1–3, transit 2–5.
  - uk15 (calendar): handling 1–3, transit 2–5 ("Mixed" carrier).
  - gb2: handling 1–3, transit 1–2 (RM24 untracked).
- [src/lib/season.ts](src/lib/season.ts) gives Christmas last order dates: uk7 is 10 Dec; uk15 and gb2 are 11 Dec.

**Wiring that already exists for inserts and shipping**
- Gift-note insert: Prodigi's per-order `branding.postcard` insert is already used for a printed gift note tucked into the parcel. It is sent only where the lab's shipment `brandingItems` include the slot, with a retry without branding on a 4xx. — [src/fulfillment/giftNoteInsert.ts](src/fulfillment/giftNoteInsert.ts); [src/fulfillment/submit.ts](src/fulfillment/submit.ts) lines ~596-607
- Shipping method: the code chooses only between 'Standard' and 'Express' (`resolveShippingMethod`), and splits a phone case into its own Express order. Budget is not used anywhere today. — [src/fulfillment/submit.ts](src/fulfillment/submit.ts) lines 97-98, 564-570

### Inferences
- A monthly card-pack subscription can ship on today's code path with no new SKU. N different drawings on `CLASSIC-GRE-FEDR-7X5-BLA`, in one order, on the flat uk7 letter route, is the lowest-friction subscription product.
- A yearly calendar subscription is already buildable, but only as a January-start dated calendar (or an undated SKU with our own dates). The cut-off is driven by Prodigi listing the next year's SKUs.
- The yearly "year in drawings" book needs the same multi-page PDF rendering that blocks the storybook. Building it once unblocks both.

### Gaps
- No repo code handles recurring or scheduled orders. Each order is created as it arrives (idempotencyKey per order).
- The magnet's exact print-area px and its insert support are not recorded in the catalogue.

## 2. Prodigi public range: what exists, where it ships from, rough costs, delivery, packaging

### Takeaway
Prodigi publicly lists these, all UK-fulfillable:
- kiss-cut stickers (UK/EU);
- magnets (UK);
- classic and fine-art postcards (UK);
- greetings cards;
- custom and classic notebooks;
- A4/A5 dated and undated calendars (UK/EU/US/AU);
- hardcover and softcover photo books (UK/EU/US/AU). Layflat is EU/US only.

There is no sticker-sheet (multi-design kiss-cut) product, no notepad or sticky-note pad, and no "mini prints" product on the public pages. Public wholesale "from" prices start at about £0.80 for a kiss-cut sticker and about £5.86 for a calendar. Prodigi has no branded mailers, only inserts and stickers.

### Cited Findings
**Catalogue structure**
- Top-level categories include Stickers (kiss-cut, transparent, temporary tattoos), Books & magazines (hardcover, softcover and layflat photo books), and Cards & stationery (greetings cards, postcards, custom notebooks). — [Prodigi products](https://www.prodigi.com/products/)
- Cards & stationery lists greetings cards, postcards, custom notebooks (paperback, hardback, spiral), classic notebooks, themed journals, calendars, invitations and wrapping paper. No notepads or sticky notes are listed. — [Prodigi cards & stationery](https://www.prodigi.com/products/cards-and-stationery/)

**Stickers and magnets**
- Stickers category: kiss-cut stickers "ship from EU and UK"; transparent stickers are "coming soon", UK; temporary tattoos are UK; magnets ("personalised photo fridge magnets") ship from UK; wall stickers and furniture decals ship from EU/UK/US. — [Prodigi stickers](https://www.prodigi.com/products/stickers/)
- Kiss-cut stickers come in 3×4″, 5.5×5.5″, 8.5×8.5″ and 14×14″. Each is a single contour-cut sticker in removable white vinyl, matt or gloss. Production is 24–72 h. Wholesale is "from £0.80" ex tax and shipping, with 15% off for Pro. The page does not state multiple designs per sheet. — [Prodigi kiss-cut stickers](https://www.prodigi.com/products/stickers/kiss-cut-stickers/)
- Prodigi's sticker blog says "If you'd like to sell personalised stickers via our print API, please contact sales@prodigi.com". So the API route for stickers may need a sales conversation. — [Prodigi blog: personalised stickers](https://www.prodigi.com/blog/how-to-create-personalised-stickers)

**Postcards**
- Fine-art postcards are "designed for self-sending", single or multiple, and ship from EU/UK/US. Classic postcards are "one custom postcard… sent direct to the recipient" and ship from UK. Sizes and prices are not shown publicly. — [Prodigi postcards](https://www.prodigi.com/products/cards-and-stationery/postcards/)

**Calendars**
- A4 (297×210 mm) and A5 (210×148 mm), Wire-O bound, 300gsm silk, 26 pages (13 sheets), HP Indigo print.
- Dated SKUs (`CALENDAR-A4-L-DATED`, `CALENDAR-A5-L-DATED`) have pre-printed 2027 dates and take 14 images (12 months plus front and back covers). Holidays are not marked.
- Undated SKUs (`CALENDAR-A4-L-UNDATED`, `CALENDAR-A5-L-UNDATED`) take a full PDF from a template, so we print our own dates. That allows any start month (e.g. a birthday-to-birthday or school-year calendar).
- Ships from UK/EU/US/AU. Production is 120 h. Wholesale "from £5.86". No desk calendar is listed. — [Prodigi calendars](https://www.prodigi.com/products/cards-and-stationery/calendars/calendars/)

**Photo books**
- Hardcover: A5, A4 or 21×21 cm square; portrait, landscape or square. 24 to 300 pages, or up to 500 on 150gsm gloss. Paper is 120gsm Mohawk matte, 150gsm gloss or 200gsm gloss. Matte-laminate cover, PUR binding, printable spine. Ships from UK/EU/US/MX/AU. Production is 120 h. No public price or per-page price; Pro saves 15%. — [Prodigi hardcover photo book](https://www.prodigi.com/products/books-and-magazines/hardcover-photo-book/)
- Softcover (PUR) ships from AU/EU/UK/US. Layflat (hardcover) ships from EU/US only, so it is not UK-made. Magazines (matte or gloss cover) ship from AU/EU/UK/US. — [Prodigi books & magazines](https://www.prodigi.com/products/books-and-magazines/)

**Branded inserts (the only packaging customisation)**

| Insert | Size and stock | Per unit, free account | Per unit, Pro |
|---|---|---|---|
| Exterior sticker | 65 mm round or 4×3″ | £1.00 | £0.25 |
| On-product sticker | 25 mm round or 4×3″ | £1.00 | £0.25 |
| Flyer | A5, 150gsm silk | £2.00 | £0.50 |
| Postcard | A6, 260gsm | £2.00 | £0.50 |
| Packing slip, colour | A4 | £2.00 | £0.50 |
| Packing slip, B&W | A4 | Free | Free |

- Pro gives "75% off" inserts. The Pro subscription fee is not stated on that page.
- Availability varies by product. Full range: prints, stickers, magnets, jigsaws, fine-art cards. Not available: "books and notebooks (many)", mugs, phone cases, ornaments. No branded boxes or mailers are mentioned. — [Prodigi branded packaging inserts](https://www.prodigi.com/branded-packaging-inserts/)
- Delivery is white-label: "no Prodigi branding" on orders. — [Prodigi stickers](https://www.prodigi.com/products/stickers/)

### Inferences
- "Mini prints" would have to be built from Prodigi's photo or art prints at small sizes, or from postcards. No dedicated mini-print pack appears on the public category pages, so it needs a check in the dashboard product search.
- A "sticker sheet" on Prodigi would be one kiss-cut sticker per drawing (several SKUs per order), or one large kiss-cut with several drawings composed into one contour. The contour may or may not support multiple separate shapes; this needs a sample or sales confirmation.
- Inserts are unavailable for many books and notebooks. So a branded "this month's magic" note works with the stickers, magnets, prints and fine-art cards, but may not work for photo book or calendar orders.

### Gaps
- Public sizes and prices for postcards and greetings cards were not shown on the category pages.
- The magnets product page URL guessed (`/products/home-and-living/magnets/`) returned 404, so magnet sizes come only from the repo brief (`MAG-4-10X10`, 4 images at 10×10).
- Per-page photo-book pricing is not public; it needs a dashboard price sheet or a sandbox quote at 24/40/60 pages.

## 3. Specific formats: sticky notes, sticker sheets, photo books, calendars

### Takeaway
On Prodigi:
- Sticky-note / post-it pads: no.
- Multi-design kiss-cut sticker sheets: no (single kiss-cut stickers only).
- Photo books: yes, UK-made hard and softcover, A5/A4/square, 24–300 pp.
- Wall calendars: yes, A4/A5 landscape, dated 2027 (January start) or undated (any start month via our own PDF). No desk calendar was found.

For sticker sheets, Printful (5 designs a sheet) is the obvious API alternative, but its UK/EU fulfilment for that product is unconfirmed. Sticker it (Bristol, HP Indigo, has a Print API) is the strongest UK sticker and magnet option. I found no UK POD API that clearly offers personalised sticky notes.

### Cited Findings
**Sticker sheets**
- Printful kiss-cut sticker sheet: "five" designs a sheet, listed at $6.25. The page does not state fulfilment locations, and reviewers mention US and Australian production. — [Printful kiss-cut sticker sheet](https://www.printful.com/custom/stationery/personalized/kiss-cut-sticker-sheet)
- Printful says it prints and ships stickers from its UK facility, without stating which sticker products. — [Printful UK custom stickers](https://www.printful.com/uk/custom-stickers) (via search result)

**UK sticker and magnet alternatives**
- Sticker it has a Print API covering stickers, labels and magnets. Orders "ship in 3–4 days" to UK/Europe/USA/Canada/Australia, with HP Indigo printing. Access is by form or api@stickerit.co, docs at customer-api.live.stickerit.co/docs, and there is an Order Desk integration. Sticker sheets, kiss-cut and sticky notes are not mentioned on the API page. — [Sticker it API](https://stickerit.co/pages/api)
- A Polotno integration page describes Sticker it printing in Bristol, with the order sent as file URLs, SKU, quantity, material and address. — [Polotno: Sticker it integration](https://polotno.com/sdk/product/integrations/sticker-it)
- Sticker Mule's API is a small REST API for reordering your own saved items. Drop-shipping and print-on-demand appear only as feature requests, so it is not suitable for per-customer POD. — [Sticker Mule API](https://www.stickermule.com/api); [Sticker Mule feedback](https://feedback.stickermule.com/features/p/print-on-demand-and-drop-shipping)

**Sticky notes**
- Printify's catalogue lists sticky notes for dropshipping; UK production was not confirmed. — [Printify custom office supplies](https://printify.com/custom-office-supplies/)
- Contrado and Inkthreadable have UK-made POD APIs (Contrado covers stationery), but no notepad or sticky-pad product was confirmed. — [Contrado print-on-demand API](https://au.contrado.com/print-on-demand-api); [Inkthreadable API](https://www.inkthreadable.co.uk/with-api)

**Gelato**
- Gelato has a REST API with sandbox and webhooks, a UK partner network, calendars (square, A4, A3, 14.8×40 cm, two mounting options) and soft and hardcover photo books. No sticker-sheet or notepad spec was confirmed. — [Gelato features](https://www.gelato.com/au/features); [Gelato UK calendars](https://www.gelato.com/uk/custom-calendar-printing); [Gelato UK](https://www.gelato.com/print-on-demand/united-kingdom)

**Photo-book pricing structure**
- The repo brief's sandbox quotes show cost rising with page count: 24 pp versus 40 pp tiers, with uk15 postage on top. This is consistent with a base price plus a per-page increment. The brief puts retail at about £24 (softcover) and £26–£29 (hardcover). — [project-office/briefs/PRODUCT-RANGE-global-uk-nov.md](project-office/briefs/PRODUCT-RANGE-global-uk-nov.md)

### Inferences
- **Sticker sheet.** The cleanest UK route is Sticker it (UK-printed, API, magnets too), if it sells a multi-image sheet. The fallback is several small Prodigi kiss-cut stickers per order, which are UK/EU, low per-unit, and support inserts.
- **Sticky-note pad.** No UK POD API clearly supports it. It is likely a short-run trade-printer job (not true POD), or must be dropped from the list. Flag it as a stop-and-check.
- **Data residency.** Printify and Printful routes may send a child's image outside the UK/EU. Under CLAUDE.md residency rules, prefer Prodigi UK or Sticker it (UK), and confirm Printful's UK/EU (Latvia or Spain) routing per product before considering it.
- **Year-in-drawings book.** The minimum is 24 pages. Twelve months at about 2 pages each fits a 24–28 pp hardcover A5 or square.

### Gaps
- Sticker it's product list behind the API (sheet formats, magnet sizes) and its pricing are not public.
- Moo, Peecho, Hello Print, Printed.com, Mixam and StickerApp were not verified in this pass (tool budget). Specifically, the API availability of Moo's sticker and postcard packs and Peecho's photo-book API were not checked.
- I found no source confirming any UK POD API for personalised sticky notes.

## 4. Letterbox economics: Royal Mail Large Letter limits and Prodigi shipping tiers

### Takeaway
A Royal Mail Large Letter is at most 353×250×25 mm and 750 g. Franked 2nd Class Large Letter starts around £1.52 (≤100 g) and 1st around £2.86 (from 7 Apr 2026, reseller figures). Prodigi's tiers run Budget (slowest, usually untracked), Standard (tracked or untracked), Express (courier, tracked) and Overnight (some UK labs). For a monthly letterbox item, the cheapest proven route in the repo is the cards lab uk7 (one flat untracked rate for 1–15 cards). Next is gb2 on Standard, Royal Mail 24 untracked, used for magnets and wrapping paper.

### Cited Findings
**Royal Mail Large Letter**
- Large Letter maximum is 353 mm × 250 mm × 25 mm and up to 750 g. — [University of Bristol print services, Royal Mail size guidelines](https://www.bristol.ac.uk/print-services/post-services/external-post/size-guidelines-and-postal-options)
- Franked prices from 7 April 2026: 1st Class Large Letter £2.86 (≤100 g), £3.28 (101–250 g), £3.30 (251–750 g); 2nd Class £1.52 (≤100 g), £1.81 (101–250 g), £2.30 (251–500 g). — [Pitney Bowes UK postage rate change](https://www.pitneybowes.com/uk/postage-rate-change.html). These are reseller (franked) figures; stamp prices are higher. Not verified against Royal Mail's own PDF. See also [Royal Mail Prices 2026](https://www.royalmail.com/prices2026).

**Prodigi shipping tiers**
- "Four different shipping options; each increasing in price and speed":
  - Budget: the slowest, "typically sent using an untracked service".
  - Standard: "may be tracked or untracked… depending on destination".
  - Express: courier, tracked.
  - Overnight: "only available in the UK & USA with certain labs".
- Prodigi tries to offer at least Budget and Standard for every product. — [Prodigi help: shipping options](https://help.prodigi.com/support/solutions/articles/35000225356-what-different-shipping-options-do-you-support-)
- The API's `shippingMethod` accepts Budget, Standard, StandardPlus, Express or Overnight (per search summary of the API reference; not directly fetched). — [Prodigi API reference](https://www.prodigi.com/print-api/docs/reference)

**Repo route notes**
- Wrapping paper on gb2 goes Royal Mail RM24 untracked on Standard; Budget switches to Evri 48. Magnets (`MAG-4-10X10`) go gb2 to RM24 untracked. — [project-office/briefs/CHRISTMAS-range-and-postage.md](project-office/briefs/CHRISTMAS-range-and-postage.md)
- Card packs: one flat Guernsey Post untracked rate for 1–15 cards (uk7). — [src/server/catalogue.ts](src/server/catalogue.ts)
- One code note says Budget (RM48) roughly halves the cost of one gb2 product's Standard RM24 post. The code does not use Budget today. — [src/server/catalogue.ts](src/server/catalogue.ts) line ~725

### Inferences
- Monthly letterbox candidates, in order of postage cost:
  1. A card or postcard pack from uk7 (flat letter rate; card packs are proven).
  2. Kiss-cut stickers or a magnet set on Budget (untracked Royal Mail 48 or Evri 48).
  3. Standard RM24.
- Untracked is acceptable for a low-value monthly item if the subscription absorbs the occasional reprint. Keep tracked shipping for the yearly calendar and book.
- Mixing labs (e.g. stickers from one lab and cards from uk7) produces two envelopes and two postage charges. Prodigi routes per product to its lab. So the "one letterbox package" goal means picking products from the same lab, or accepting a split.
- A calendar or photo book will not fit a Large Letter when padded (Wire-O A4 calendar, hardcover book). Expect parcel rates. The calendar also has no Express (uk15).

### Gaps
- Prodigi's exact UK carrier for Budget on uk7 and on the sticker lab was not confirmed. It needs a sandbox quote per SKU with `shippingMethod: Budget`.
- Royal Mail's own 2026 Large Letter table was not read directly.

## 5. Prodigi features that help subscriptions (scheduling, batching, inserts, branding)

### Takeaway
Prodigi has no scheduled or recurring order feature that I could find. A subscription has to be driven by our own scheduler, creating one API order per child or household per cycle; the existing `idempotencyKey` pattern fits this. Per-order inserts (A6 postcard, A5 flyer, packing slip, stickers) are available on many flat products, from £0.25–£2.00 per unit depending on Pro membership. Book and calendar orders largely can't carry them. There is no custom-branded packaging.

### Cited Findings
- The `branding` object on an order carries per-order assets: postcard, flyer, B&W packing slip, colour packing slip, exterior sticker (per search summary of the API reference). — [Prodigi API reference](https://www.prodigi.com/print-api/docs/reference)
- Branded inserts "can't be created or managed directly via the API". Instead, dashboard branding sets are assigned to API orders, and configured sets are not considered in quotes. — [Prodigi support: branded insert settings](https://support.prodigi.com/hc/en-us/articles/19847266436764) (via search summary)
- The repo already sends `branding.postcard` per order with a signed URL to a rendered gift-note card, gated on each shipment's `brandingItems`. — [src/fulfillment/giftNoteInsert.ts](src/fulfillment/giftNoteInsert.ts)
- Insert prices: free account £1 (sticker) or £2 (flyer, postcard, colour slip); Pro £0.25 or £0.50; B&W slip free. Insert availability depends on product and lab. — [Prodigi branded packaging inserts](https://www.prodigi.com/branded-packaging-inserts/)
- Prodigi Pro also gives 15% off calendars, photo books and stickers. — [Prodigi calendars](https://www.prodigi.com/products/cards-and-stationery/calendars/calendars/); [Prodigi hardcover photo book](https://www.prodigi.com/products/books-and-magazines/hardcover-photo-book/); [Prodigi kiss-cut stickers](https://www.prodigi.com/products/stickers/kiss-cut-stickers/)
- Prodigi's API docs page now titles itself "Prodigi Print API Documentation v5", with links back to v4. The repo uses v4 endpoints (`/v4.0/products`, `/v4.0/quotes`). — [Prodigi API docs](https://www.prodigi.com/print-api/docs/reference/); [project-office/briefs/CHRISTMAS-range-and-postage.md](project-office/briefs/CHRISTMAS-range-and-postage.md)

### Inferences
- For a "monthly magic" envelope, the A6 postcard insert works as a branded note ("this month's masterpieces"). Pro pricing makes it cheap at volume; work out the Pro fee against expected monthly volume.
- Batching: there is no bulk order discount endpoint. Each household's monthly pack is one Prodigi order with N items, as card packs already do. Generate them on a fixed day each month to smooth printing and support load.
- Per the mapping in this note, a pragmatic subscription stack is:
  - Monthly: a card or postcard pack (uk7, live code path), with stickers (Prodigi kiss-cut, or Sticker it) or a magnet set (gb2) as the rotating extra.
  - Yearly: the undated or dated calendar (uk15) and a 24–28 pp A5 or square hardcover book (uk15).
  - Birthday: either of the yearly items, or the card pack, triggered from the child's birth month. First name only.

### Gaps
- Whether the v5 API adds scheduling or batching was not checked; only the v5 landing title was seen.
- Prodigi Pro's monthly fee was not found on the pages fetched.
- Whether uk7 (cards) and the sticker lab support postcard or flyer inserts per shipment is unknown. The repo checks `brandingItems` at runtime, so a sandbox quote or order would answer it.
