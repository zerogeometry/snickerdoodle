# Prodigi options and UK postage choices for cutting make-and-ship cost (researched 26 Nov 2026)

Scope note: all pages were read on 26 Nov 2026 unless another date is given. Several Prodigi pages (API reference, Christmas dates table) and all royalmail.com price pages render with JavaScript or block automated reads (HTTP 403). Where that stopped me, the item is listed under Gaps rather than guessed. "Needs account" = only visible inside the Prodigi dashboard or a carrier business account.

## 1. Prodigi Pro: price, discount, higher tiers, what's included, stacking with negotiated rates

### Takeaway
Prodigi Pro costs £35/month billed annually (£420/yr) or £40/month billed monthly (£480/yr), plus 20% VAT for UK merchants. It gives 15% off most products and 10% off clothing, with no postage discount stated anywhere. It also gives 75% off branded inserts, a dedicated account manager and 24/7 priority support. The tier above it is a custom "Enterprise" plan with bespoke volume pricing (contact sales). Pro discounts can NOT be stacked with a bespoke or negotiated rate: you get one or the other.

### Cited Findings
- Price: "£35/month" paid annually, "£40/month if monthly", excl. tax — [Prodigi Pro page](https://www.prodigi.com/prodigi-pro/) (read 26 Nov 2026).
- Same figures as annual totals: monthly plan £40/month = £480/year, annual plan £35/month = £420/year ("saves 14%"). Post dated 22 May 2025, updated 16 Dec 2025 — [Prodigi blog: Grow with Prodigi Pro](https://www.prodigi.com/blog/grow-with-prodigi-pro/).
- The FAQ describes annual billing as "the equivalent of two months free" and adds 20% VAT for UK-based merchants (none for non-UK merchants) — [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).
- Discount by category on the Pro page: 15% off prints & posters, wall art, stickers, books & magazines, technology, home & living, sport & games, accessories, and business & commercial. Cards & stationery is "up to 15%", with hardback notebooks at 10%. Men's, women's and kids' clothing are 10% — [Prodigi Pro page](https://www.prodigi.com/prodigi-pro/).
- Conflicting older wording: a search snippet of the May 2025 blog and FAQ said "a minimum of 10% off… selected lines offering up to 25% off" / "10–25% discount". The current pages say 15% (10% apparel). Treat 15%/10% as current, and 25% as superseded or unconfirmed — [Prodigi blog](https://www.prodigi.com/blog/grow-with-prodigi-pro/); [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).
- No shipping discount is listed on the Pro page or the FAQ ("Shipping discount: not mentioned") — [Prodigi Pro page](https://www.prodigi.com/prodigi-pro/); [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).
- Other benefits: "75% savings on custom packaging inserts", "Custom AI-generated mockup scenes", "Dedicated account manager" and "24/7 priority support". Free accounts get email and live chat support in business hours — [Prodigi Pro page](https://www.prodigi.com/prodigi-pro/); [Prodigi blog](https://www.prodigi.com/blog/grow-with-prodigi-pro/).
- Not combinable: Pro discounts "cannot be stacked with existing bespoke or account-level discounts". You get either your bespoke pricing or the Pro discount — [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).
- Terms: cancel by switching to Core (free) in the dashboard. Benefits run to the end of the billing period. No refunds, no minimum term, no free trial. Monthly/annual switches take effect at period end. Benefits pause if a payment fails and is not fixed within 3 days. Benefits apply immediately on subscribing — [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).
- Higher tier: "Prodigi Enterprise is a custom plan for high-volume businesses… all Pro features plus additional premium benefits". Contact sales@prodigi.com, no published price or threshold. The Pro page says "Need more? … custom account plans with bespoke volume pricing" — [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/); [Prodigi Pro page](https://www.prodigi.com/prodigi-pro/).

### Inferences
- Break-even, if VAT-registered and reclaiming VAT: £35 ÷ 15% ≈ £233/month of product base cost (ex-postage) on the annual plan. On the monthly plan it is £40 ÷ 15% ≈ £267/month. Apparel-heavy spend at 10% needs about £350/month (annual).
- Break-even if NOT VAT-registered (VAT is a real cost): £42 ÷ 15% ≈ £280/month (annual) or £48 ÷ 15% = £320/month (monthly).
- Because postage is not discounted, Pro only cuts the product line of each order. It has no effect on the per-lab shipment cost, which is the shop's main structural cost.
- In December peak, monthly billing for a single month is a low-risk test: no minimum term, cancel any time, benefits run to period end. It pays off if December product spend clears about £267–£320.
- Negotiated (bespoke) pricing replaces Pro rather than adding to it. Ask the Enterprise/sales team whether a bespoke rate beats 15% once volume is known. Which tier pays more depends on volume, and no threshold is published.

### Gaps
- No published volume threshold for Enterprise or bespoke pricing, and no Enterprise price.
- Whether a bespoke rate could include postage discounts is not stated.
- The per-SKU effect of 15% (for example the actual £ saving on a uk9 mug) needs account: it is only in the dashboard price sheets.

## 2. Prodigi shipping methods and per-order vs per-item; splitting a basket into two orders

### Takeaway
Prodigi publicly documents Budget (usually untracked), Standard (tracked or untracked depending on product and destination), Express (usually a courier, tracked) and Overnight (only some UK/US facilities). The API also lists a "StandardPlus" value. The shipping method is set once per order, not per item. Nothing stops a merchant from sending the same customer's basket as two Prodigi orders. Because different labs already ship and charge separately, splitting off a phone case as its own Express order should cost nothing extra in most baskets, and would save the £1–£8 Express uplift on the other items. This last point is inference from Prodigi's own billing rules, not a documented feature.

### Cited Findings
- FAQ wording (read 26 Nov 2026): "We have three different shipping options, each with increasing price and speed" (Budget, Standard, Express). "Budget shipping … is typically sent using an untracked service" (except all US orders, which are tracked). "Standard shipping may be tracked or untracked for most print on demand products, depending on the destination". "Express shipping is typically handled by a courier and includes tracking". "We strive to provide at least budget and standard shipping options for all products." — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- A help-centre article (search snippet, not read in full: the help.prodigi.com page refused the TLS handshake) describes four options including Overnight, available only from some UK and US facilities — [Prodigi help: shipping options](https://help.prodigi.com/support/solutions/articles/35000225356-what-different-shipping-options-do-you-support-).
- Per-order: in Prodigi's OpenAPI spec (as mirrored on apis.io), `shippingMethod` is "The shipping service level for the order" with enum Budget, Standard, StandardPlus, Express, Overnight, required on order creation. There is an order action to change it on an existing order. Shipments (carrier and service per item) are assigned by Prodigi, not the merchant — [apis.io Prodigi Orders API mirror](https://apis.io/apis/prodigi/prodigi-orders-api/); [Prodigi API reference](https://www.prodigi.com/print-api/docs/reference).
- A Quotes endpoint (`POST /quotes`) returns "pricing and shipping breakdowns before ordering" for a given shippingMethod and destination. It can be used to compare one Express order against a split before placing an order — [apis.io Prodigi Quotes API](https://apis.io/apis/prodigi/prodigi-quotes-api/).
- The dashboard's automatic fulfilment shipping choice is Budget / Standard / Express or Auto-select (search snippet) — [Prodigi help: configure shipping rates](https://help.prodigi.com/support/solutions/articles/35000225513-how-do-i-configure-shipping-rates-for-products-ready-for-automatic-fulfilment-).
- Billing rules: "For multi-item orders, our shipping logic consolidates items instead of applying the full rate to each one". Additional items pay a "+1" rate. "If an order contains products that come from different fulfilment facilities … the shipping costs from each facility are combined." Example: A1 framed canvas UK Standard £11.50 plus an A5 framed canvas at its +1 rate of £3.00 (instead of its £7.25 full rate) = £14.50 — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- "Orders produced through our partner network generally follow the same approach, but there may be exceptions." — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- Couriers including FedEx, UPS and DPD cannot deliver to PO Boxes — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).

### Inferences
- Splitting into two orders: the phone case (uk6 on Express) is already its own shipment at full price in a one-order basket, because no other product in the range ships from uk6 on Express. Moving it into a separate Express order should therefore cost the same for the case. The rest of the basket drops from Express to Standard, saving roughly £1–£8.
- The split costs more than one Express order only in edge cases. One is a watch strap (uk6 on Standard) in the same basket: on Express the case and strap might combine at uk6, and when split they would not. Check with `POST /quotes` both ways before committing.
- Operational cost of splitting: two Prodigi order IDs per customer order, two tracking emails, and two statuses to reconcile in the admin. It is a code change, not a Prodigi setting.
- "StandardPlus" may be a tracked Standard-type tier for some destinations. It might give a tracked phone case without paying Express, but this is unconfirmed. Ask for a quote via the API.
- Typical price gaps between methods per UK lab need account: the dashboard price sheets show full and +1 rates per product and method.

### Gaps
- No public table of UK carrier per method per lab. The shop's own observed mapping (uk9 RM Tracked 48, uk3 FedEx, and so on) is better evidence than anything public.
- What "StandardPlus" means for UK labs is not documented publicly.
- I could not read the full v5 API reference: it is JS-rendered, and only the title and nav came through.

## 3. Lab routing / pinning / consolidation

### Takeaway
Routing is automatic: Prodigi sends each item to the facility nearest the customer that makes it. I found no public setting, API field or help article that lets a merchant pin a product to a lab or force a "pack together" across labs. Consolidation exists only within one facility (the "+1" rule), and for framed and rolled prints in particular.

### Cited Findings
- "Upon receiving your order, our print API automatically routes it to the fulfilment centre nearest to your customer" — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- Global products "can be shipped from multiple locations. We will route orders…" (search snippet from Prodigi's manual order form guide) — [Prodigi manual order form guide (PDF)](https://Prodigi.com/download/solutions/Manual%20order%20form%20guide.pdf).
- Consolidation rules inside one facility: framed prints and canvases are charged at the largest item's full rate, with others at +1. The full cost is paid once for the largest rolled print, with "no '+1' charges for additional rolled prints" — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- Items from different facilities have their shipping "combined" (summed), not merged into one parcel — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- Comparable POD (Printful) also says you cannot manually choose a fulfilment centre. Shown only to illustrate that this is normal across the industry — [Printful help](https://help.printful.com/hc/en-us/articles/360014068659-Can-I-choose-where-my-products-are-fulfilled).

### Inferences
- The levers are product choice (pick SKUs that come from the same lab, such as uk9 for mugs, tees, coasters, tea towels and ornaments) and SKU swaps. For example, a mug-plus-ornament bundle from uk9 is far cheaper to post than a cushion (uk3) plus a framed print (gb3).
- Ask the Pro account manager or Enterprise sales whether a lab override or a "preferred facility" exists for bespoke accounts. Nothing public says it does.

### Gaps
- No documented case found of items from different Prodigi labs being merged into one parcel.
- Whether Prodigi will move a SKU (for example plastic baubles or playing cards) to uk9 for a consolidating merchant is unknown and needs a sales conversation.

## 4. Branded packaging, inserts and gift notes: cost

### Takeaway
Branded inserts are per-unit add-ons, priced as a separate line on the order. Standard prices are: sticker £1.00, A5 flyer £2.00, A6 postcard £2.00, full-colour A4 packing slip £2.00. Pro prices are 75% lower: £0.25 / £0.50 / £0.50 / £0.50. A black-and-white packing slip is free for everyone where supported. Support depends on product and facility. Some products (for example cushions) get only a B&W slip, and some (for example snap cases) get nothing.

### Cited Findings
- Price table, per unit (Standard / Pro): sticker (65mm round or 4×3") £1.00 / £0.25. A5 flyer 150gsm £2.00 / £0.50. A6 postcard 260gsm £2.00 / £0.50. Full-colour packing slip £2.00 / £0.50. B&W packing slip "Free for all customers (where supported)" — [Prodigi branded packaging inserts](https://www.prodigi.com/branded-packaging-inserts/).
- "Availability of branded inserts is dependent on fulfilment location." Support varies by product: prints, classic frames and canvas get the full range. Laptop sleeves and cushions get a B&W packing slip only. Snap cases and mouse mats get none — [Prodigi branded packaging inserts](https://www.prodigi.com/branded-packaging-inserts/).
- Inserts that don't apply to an order are not charged. The insert cost appears as a separate line in the order breakdown (search summary) — [Prodigi support article](https://support.prodigi.com/hc/en-us/articles/19846392218780).
- Pro and Enterprise get 75% off all branded inserts — [Prodigi Pro FAQ](https://www.prodigi.com/faq/prodigi-pro/).

### Inferences
- For a shop without Pro, each colour insert costs £2 per order (per shipment, if added to each). With a basket split across 3 labs, a postcard in every parcel costs £6. With Pro it is £1.50.
- A free B&W packing slip carrying a short printed gift note is the cheapest gift-message route, where the facility supports it.

### Gaps
- No public price for custom boxes or tape (no custom outer packaging is listed). There is no public gift-message feature beyond packing-slip content.
- Which UK labs (uk3/uk5/uk6/uk7/uk8/uk9/uk15/gb2/gb3) support which inserts needs account.

## 5. UK postage reality: Royal Mail 2026 prices, Evri/DPD, loss rates, cost of a loss

### Takeaway
Royal Mail raised prices on 7 April 2026: 1st class letter £1.70 → £1.80, 2nd class 87p → 91p, and parcels up roughly 5–7%. More online, Post Office and Tracked changes followed on 5 October 2026. Royal Mail's own business guide (effective 13 May 2026) lists account 1st/2nd Large Letter at £3.00/£1.55 (100g) and Small Parcel at £5.15/£3.95. Tracked 24/48 contract rates are quote-only. Untracked mail is measurably unreliable: 2025/26 1st class on time was 75.7% against a 93% target, and 2nd class within 3 days was 90.2% against 98.5%. Ofcom opened an investigation on 1 June 2026. Prodigi says it replaces orders not received within 30 days (except bad addresses), so a lost untracked Prodigi parcel mainly costs the shop customer goodwill and delay rather than a reprint.

### Cited Findings
**Royal Mail prices**
- 7 April 2026 tariff (new / old): 1st class letter £1.80 / £1.70. 2nd class letter £0.91 / £0.87. 1st class Large Letter 100g £3.30 / £3.15. 2nd class LL 100g £1.55 / £1.55. 2nd class LL 250g £1.90 / £2.00. 2nd class LL 500g £2.40. 2nd class LL 750g £2.70. 1st class LL 250–750g £3.60. Small Parcel 2kg 1st £5.45 / £5.09, 2nd £4.25 / £3.99 (single tariff, not labelled retail or online). Blog post of 7 Mar 2026 — [Norphil blog](https://blog.norphil.co.uk/2026/03/1st-class-up-10p-2nd-class-up-4p-in.html).
- Same source: Tracked 24 basic Large Letter (up to 1kg) +10p to £3.95, Tracked 48 +35p to £3.30, with "Parcels show 5-7% rises". A commenter cites online 2kg small parcel figures of 2nd £3.95 and Tracked 48 £3.65, which do not match the table — [Norphil blog](https://blog.norphil.co.uk/2026/03/1st-class-up-10p-2nd-class-up-4p-in.html).
- eBay's 7 April 2026 tariff notice (increases via eBay labels): 1st letter +10p, 1st LL 0–100g +15p, 2nd letter +4p, 2nd LL 0–100g unchanged. Tracked 48 small and medium parcels up to +55p, Tracked 24 up to +65p. 2nd small/medium parcels +45p to +£1.20, 1st +85p to +£1.75. eBay also says Tracked 24/48 parcels now cost less than the equivalent 1st/2nd class parcels — [eBay community: Royal Mail tariff changes 7 April 2026](https://community.ebay.co.uk/t5/Announcements/Royal-Mail-Tariff-Changes-7th-April-2026/ba-p/8008432).
- Royal Mail's Tracked 48 page (undated) shows online prices of £2.85 for a Large Letter up to 1kg and £3.65 for a small parcel up to 2kg. This conflicts with Norphil's £3.30 Tracked 48 LL, possibly a different channel (online vs Post Office) or date — [Royal Mail Tracked 48](https://www.royalmail.com/sending/uk/tracked-48) (search snippet; royalmail.com returned 403 to direct fetch).
- Royal Mail pricing pages list a further change "from 5 October 2026" to online and Post Office prices for Tracked, 1st/2nd class parcels and Signed For parcels, plus Tracked/24/48 barcoded LL and parcels. Figures were not retrievable (403) — [Royal Mail Prices 2026](https://www.royalmail.com/prices2026); [Royal Mail prices page](https://www.royalmail.com/prices2025).
- Royal Mail Business Price Guide, "Prices effective from 13 May 2026", account (OBA) prices, VAT exempt: 1st/2nd Letter £1.80 / 91p. Large Letter 100g £3.00 / £1.55, 250g £3.30 / £1.85, 500g £3.30 / £2.30, 750g £3.30 / £2.50. Small Parcel 2kg £5.15 / £3.95. Medium Parcel 2kg £7.35 / £6.25. 1st/2nd class include compensation up to £20 — [Royal Mail Business Price Guide May 2026 (PDF)](https://www.royalmailtechnical.com/rmt_docs/Rate_Cards_May_2026/Business_Price_Guide_May_2026_v1.pdf).
- Same guide: a Business Account needs a minimum spend of £5,000/yr, unless the business sends 1,000+ Royal Mail Tracked or International Business Tracked items a year. Tracked 24/48 have no list price ("to get a quote, go to royalmail.com/tracked"). They include compensation up to £150, a signature option from 70p, SMS/email notifications and a 2-hour delivery window — [Royal Mail Business Price Guide May 2026 (PDF)](https://www.royalmailtechnical.com/rmt_docs/Rate_Cards_May_2026/Business_Price_Guide_May_2026_v1.pdf).
- Same guide, Royal Mail 24/48 (untracked contract, for 1,000+ items/yr per site, ex VAT). Basic barcode Large Letter 100g: RM24 £2.25 / RM48 £1.55. 250–750g: £2.45 / £1.75. Parcel 1kg £5.55 / £3.75, 2kg £5.75 / £4.15 — [Royal Mail Business Price Guide May 2026 (PDF)](https://www.royalmailtechnical.com/rmt_docs/Rate_Cards_May_2026/Business_Price_Guide_May_2026_v1.pdf).

**Evri / DPD (indicative, consumer or broker)**
- Evri "pay online" prices (no effective date shown). Home delivery, drop-off: Postable (<1kg) £2.70, 0–1kg Small £3.04, 0–1kg Standard £3.29, 1–2kg Small £3.52, 1–2kg Standard £4.79. Next Day: £3.49–£5.48. To a ParcelShop: £2.62 standard, £3.20 next day, all bands to 2kg. £20 cover on most items. "Frequent Seller" (40+ parcels/month) pricing is hidden behind login (needs account) — [Evri prices](https://evri.com/our-services/our-prices).
- Parcel2Go promo: Evri Postable £1.99, Evri ParcelShop £2.32 for 1kg ex VAT (undated) — [Parcel2Go Evri price drop](https://parcel2go.com/promotions/evri-price-drop).
- DPD up to 1kg: 2-Day £7.49, Next Day £8.99 (ShippyPro table). Xero quotes DPD next day "from around £5" via brokers. These conflict, so treat both as indicative only — [ShippyPro](https://www.shippypro.com/blog/en/how-much-does-it-cost-to-ship-a-package-in-the-uk); [Xero guide](https://www.xero.com/uk/guides/shipping-for-small-business/).

**Reliability and loss**
- 2025/26 (Ofcom): 1st class delivered within 1 working day 75.7% (target 93%). 2nd class within 3 working days 90.2% (target 98.5%). Royal Mail announced the miss on 29 May 2026, and Ofcom opened an investigation on 1 June 2026 (status Open) — [Ofcom investigation 2025/26](https://www.ofcom.org.uk/post/royal-mail/investigation-into-royal-mails-quality-of-service-performance-in-202526).
- From 1 April 2026 the targets were cut to 90% (1st) and 95% (2nd). Ofcom fined Royal Mail £21m in Oct 2025 for 2024/25. Q3 2025/26 1st class was 77.5% — [Ofcom](https://www.ofcom.org.uk/post/royal-mail/ofcom-investigates-royal-mails-202526-delivery-performance); [Logistics Manager](https://www.logisticsmanager.com/royal-mail-falls-short-of-delivery-targets).
- Note: on-time % is a lateness measure, not a loss rate. I found no official Royal Mail or Ofcom figure for the share of untracked items never delivered.
- Anecdotal (old forum posts, 2012–2018): one eBay seller estimated 5–10% of untracked items were "lost". An Amazon seller forum reported more large letters going missing than ever — [eBay community thread](https://community.ebay.co.uk/t5/Business-Seller-Board/Royal-Mail-lost-items/td-p/359023/page/37); [Amazon Seller Central forum](https://sellercentral-europe.amazon.com/seller-forums/discussions/t/0d821d4e-4b02-439b-9017-aa72e44bf64d). Low-quality evidence; do not use as a rate.

**What a loss costs when Prodigi fulfils**
- "In the event that an order is not received within 30 days of placing the order" Prodigi will replace it (contact support@prodigi.com), but "we cannot offer free replacements for orders not received due to an incorrect address." The page also says untracked orders are "more likely" to be lost — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).
- Etsy's position, for comparison: Etsy doesn't hold sellers responsible for items lost in the mail, but suggests a refund or replacement — [Etsy help](https://help.etsy.com/hc/en-gb/articles/360050349953-What-if-My-Buyer-s-Package-Gets-Lost).

### Inferences
- The shop does not post anything itself: Prodigi's labs choose the carrier. Royal Mail and Evri prices are mainly a benchmark for checking Prodigi's postage markups, and an input to how much tracking is worth. They are not a direct lever, unless the shop moved to self-fulfilment, which is out of scope.
- Royal Mail's own contract rates show untracked RM48 Large Letter at £1.55–£1.75 and Royal Mail 1st/2nd LL at £3.00/£1.55. Tracked 48 LL online is roughly £2.85–£3.30. So the tracked premium on a letterbox-size item is around £1–£1.50 at carrier level. Compare that with what Prodigi charges for Express on the phone case (needs account).
- With Prodigi's 30-day replacement promise, an untracked loss costs the shop: the customer waits up to 30 days, there is support time, there may be a refund if the customer won't wait, and at Christmas the gift misses the day. Prodigi's free replacement (where honoured) covers reprint and post. The real cost is a missed-Christmas gift plus a possible refund (full order value) and lost goodwill.
- Rough worked example (inference, illustrative): if 1–3% of untracked letterbox parcels go missing, on a £20 item the expected refund cost is £0.20–£0.60 per parcel. That is less than a £1–£8 Express uplift on the whole basket, but close to or above a £1–£1.50 tracked premium on the case alone.

### Gaps
- October 2026 Royal Mail online and Click & Drop tables were not retrievable (royalmail.com returned 403). The Norphil, Royal Mail page and Business Guide figures disagree on Tracked 48 Large Letter (£2.85 vs £3.30), probably channel differences.
- No authoritative untracked loss rate (Royal Mail or Ofcom publish lateness, not loss).
- DPD small-business account rates need an account or quote.

## 6. Is a phone case untracked (RM24 Large Letter) acceptable? What UK case sellers do

### Takeaway
I found no authoritative survey. Evidence from sellers is anecdotal, and the usual advice is tracking for anything over about £10–£15. Prodigi's own insert table lists snap cases as getting no inserts, which suggests they ship in minimal letter-style packaging. A case in a Large Letter is physically normal. The risk is non-receipt claims at Christmas, partly offset by Prodigi's 30-day replacement rule.

### Cited Findings
- A UK eBay seller recommends tracked postage for items over about £10–£15. One commenter estimated 5–10% of untracked items "lost" (old thread) — [eBay community thread](https://community.ebay.co.uk/t5/Business-Seller-Board/Royal-Mail-lost-items/td-p/359023/page/37).
- Amazon sellers report rising losses of untracked large letters — [Amazon Seller Central forum](https://sellercentral-europe.amazon.com/seller-forums/discussions/t/0d821d4e-4b02-439b-9017-aa72e44bf64d).
- Royal Mail 1st/2nd class include compensation up to £20. Tracked 24/48 include up to £150 — [Royal Mail Business Price Guide May 2026 (PDF)](https://www.royalmailtechnical.com/rmt_docs/Rate_Cards_May_2026/Business_Price_Guide_May_2026_v1.pdf).
- Snap cases: branded inserts "Not available" — [Prodigi branded packaging inserts](https://www.prodigi.com/branded-packaging-inserts/).
- Prodigi replaces non-received orders after 30 days (not for bad addresses) — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).

### Inferences
- Middle option: keep the case tracked, but split it into its own Express order (see Q2) so the rest of the basket goes Standard. This keeps tracking where the risk is and drops the £1–£8 uplift on other items.
- Alternative: offer untracked as the default for case-only orders outside the Christmas window, with tracked as a paid upgrade. Because Prodigi absorbs the reprint, untracked risk is mostly delay and goodwill, which matters most in December.
- Watch the routing: on Standard the case goes to uk8 (often untracked RM24). The shop's existing observation is the best evidence here.

### Gaps
- No survey of what UK phone-case brands (for example CaseApp or Casetify UK) use for UK postage. Shop pages found were Etsy storefronts without readable postage detail.

## 7. Prodigi price changes 2026/2027 and Christmas 2026 UK cut-offs

### Takeaway
I found no public Prodigi announcement of 2026 or 2027 product or postage price changes. Prodigi has a "Christmas 2026 delivery dates" page that describes "currently confirmed cut-off dates" as "recommended (not guaranteed)". Its date table renders with JavaScript and could not be read. Royal Mail's own 2026 last posting dates, per press reports, are roughly: 2nd class 17–18 Dec, Tracked 48 19 Dec, 1st class 21 Dec, Special Delivery 23 Dec. Prodigi cut-offs will be earlier, because production comes first.

### Cited Findings
- The Prodigi page is titled "Christmas 2026 delivery dates". It says "recommended (not guaranteed) last order dates", "we will continue adding more as they are finalised", and points readers to the network status page. The table contents were not readable — [Prodigi Christmas delivery dates](https://www.prodigi.com/christmas-delivery-dates/).
- The 2025 Prodigi peak post (3 Dec 2025): "Cut-off dates are recommended based on current carrier deadlines and may be subject to change… Production and shipping times are estimates only and not guaranteed… Refunds for late orders are at the discretion of Prodigi." — [Prodigi blog: Preparing for peak season](https://www.prodigi.com/blog/preparing-for-peak-season/).
- Royal Mail 2026 recommended last posting dates (press, search snippet): 2nd class 18 Dec, Tracked 48 19 Dec, 1st class 21 Dec, Special Delivery 23 Dec — [Yorkshire Evening Post](https://www.yorkshireeveningpost.co.uk/business/consumer/royal-mail-christmas-posting-dates-2026-uk-international-deadlines-9346915). Another guide gives 2nd class / 2nd Signed For as Thursday 17 Dec — [Easyship UK holiday deadlines 2026](https://www.easyship.com/blog/holiday-shipping-deadline-uk); [ShipStation UK 2026](https://www.shipstation.com/en-gb/blog/christmas-2026-last-posting-dates-uk.md). The sources disagree by a day.
- Evri 2026 (guide snippet): Standard Tracked Sat 19 Dec, Next Day Tracked Tue 22 Dec — [Easyship UK holiday deadlines 2026](https://www.easyship.com/blog/holiday-shipping-deadline-uk).
- Prodigi's shipping FAQ: most products dispatch within 1–4 days, and global products typically within 24–48 hours — [Prodigi shipping FAQ](https://www.prodigi.com/faq/shipping/).

### Inferences
- With 1–4 days of production, UK Standard on a Tracked 48 lab (uk9) probably needs ordering by about 14–16 Dec, and Budget/untracked 2nd class earlier. This is inference: read Prodigi's own table in a browser or the dashboard before publishing any dates.
- Express is the only safe late option for 21–22 Dec orders. The Q2 split (only the case on Express) does not help in the last days, when the whole basket may need Express.

### Gaps
- Prodigi's actual Christmas 2026 UK dates per method and lab: not readable by fetch. Open https://www.prodigi.com/christmas-delivery-dates/ in a normal browser or check the dashboard or network status page.
- No Prodigi 2026/2027 price-change notice found publicly. Notices may go by merchant email or dashboard (needs account).
- Royal Mail's official 2026 Christmas page was not reachable (403).
