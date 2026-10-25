# Christmas 2026 — the range, wool, a second supplier, the calendar, and does bundling save postage? (2026-10-25)

> Founder (25 Oct): **scenario A**. Finish and test the app, start marketing early-to-mid November, and
> sell for Christmas 2026. This brief answers the five questions that came with that decision.
> Labels: **[verified]** = Prodigi **sandbox** API (`/products/{sku}` + `/quotes`, GB destination, GBP,
> read-only) or a page read today · **[search]** = search snippet · **[inferred]** = my reading.
> Companion: [CHRISTMAS-strategy.md](CHRISTMAS-strategy.md). Mockups: `mockups/christmas/`.

## 1. Does bundling save us postage? **Yes, but only within one lab, and not for socks.**

Our checkout already sends **one Prodigi order per basket, with one shipping method**
(`src/fulfillment/submit.ts`: one `createOrder` with every fulfillable line). Prodigi then splits that
order into **shipments**, one per lab and parcel class. Each shipment has its own carrier, its own cost and its own
item list. **[verified]** by quoting single items and then combinations (Standard, to GB):

| Basket | Postage | Shipments | Saving vs separate |
|---|--:|---|--:|
| ceramic bauble alone | £4.30 | 1 (uk9, Tracked 48) | — |
| christmas sack alone | £4.30 | 1 (uk9) | — |
| **bauble + sack** | **£5.30** | **1 (uk9, both items)** | **£3.30** |
| **bauble + sack + coasters** | **£6.30** | **1 (uk9, 3 items)** | **£6.60** |
| **mug + bauble** | **£5.30** | 1 (uk9, 2 items) | £3.30 |
| 2 × bauble (copies) | £5.30 | 1 | £3.30 |
| 2 × A4 calendar | £5.35 (vs £4.35 single) | 1 (uk15) | £3.35 |
| 3 × greetings card | £0.95 (flat) | 1 (uk7) | £1.90 |
| plastic + aluminium ornament | £6.70 (vs £6.45 each) | 1 (uk5) | £6.20 |
| bauble + **socks** + tea towel | £9.10 | **2** (uk9 ×2: socks go on their own) | £3.30 |
| card + wrapping paper | £6.65 | 2 (uk7 + gb2) | **£0** |
| bauble + calendar + card | £9.60 | **3** (uk9 + uk15 + uk7) | **£0** |
| bauble + calendar + card + wrap | £15.30 | **4** | **£0** |

**What this means**
- **Same lab, same parcel class:** one shipment, about **+£1 per extra item** on tracked services (cards
  stay a flat £0.95). That's a real saving of about £3.30 per extra item.
- **Different labs:** no saving at all. Each lab is its own parcel, at full single-item price.
- **Socks** come from the same lab (uk9) as mugs, tees, baubles and sacks but still ship as **a separate shipment**.
- So **bundles must be built inside one lab** to be honest. uk9 is our best Christmas lab: ceramic bauble,
  sack, mug, tea towel, coasters, placemats, tees, the kids' Stanley/Stella sweatshirt. For example,
  "**the grandparents' box**" = bauble + mug (+ tea towel), all uk9, one parcel. A "wrap the lot" bundle
  (wrap gb2 + card uk7) saves nothing, so price it as the plain sum or don't bundle it.
- Today's prices bake **single-item postage into every product**, so any multi-item uk9 basket already makes us about
  £3.30 more per extra item. That's margin we can hand back in bundles.

**How certain is this?** The pricing is certain *as Prodigi quotes it*. It's their own quote engine, and the
same order shape our checkout submits. Two things are **not** proven by an API quote, so add them to the
open Prodigi support email and get them **in writing**:
1. Does **one shipment = one physical parcel with one tracking number**? The API models it that way, with one
   carrier and one cost per shipment, but the docs don't say so in words [verified: API reference].
2. Does **live** price the same as **sandbox** for multi-item shipments, including in December peak?
Optional proof without email: place one **sandbox order** (bauble + sack) and check that it returns one
shipment. That's free and nothing is printed.

## 2. What we'd sell for Christmas: the Prodigi range, quoted today

### 2.1 Already in our catalogue (show for Christmas)
| Product | SKU | Lab → postage (Standard) | Our cost | Shelf | Status |
|---|---|---|--:|--:|---|
| **Ceramic bauble** 3″ | `XMAS-PORC-BAUB` | uk9 → Royal Mail Tracked 48 £4.30 | £8.00 | £21 | hidden → **show** |
| **Christmas sack** 50×75 cm | `XMAS-SACK` | uk9 → Tracked 48 £4.30 | £15.00 | £35 | hidden → **show** |
| Wrapping paper rolls | `WRAP-ROL-70X200…500` | gb2 → RM24 £5.70 (untracked) | £8–17 | £23–38 | visible |
| Greetings card / packs of 5 · 10 | `CLASSIC-GRE-FEDR-7X5-BLA` | uk7 → Guernsey Post £0.95 flat | £1.10 ea | £5.50 / £12 / £21 | visible |
| **Calendar** (A5 / A4) | currently `…-UNDATED` | uk15 → "Mixed" £4.35 | £9 / £10 | £19 / £21 | hidden; see §5 |
| Tea towel, mug, socks, apron, jigsaw, cushion, blanket… | existing | mostly uk9 | — | — | as now |

### 2.2 New Prodigi lines worth adding for Christmas **[verified quotes]**
| Product | SKU | Lab → postage | Cost | Suggested shelf* | Why |
|---|---|---|--:|--:|---|
| **Kraft wrapping paper** rolls 2/3/5 m, sheets | `WRAP-KFT-ROL-70X200` etc. | gb2 → RM24 £5.70 (Budget: Evri 48 £4.30) | £8 (2 m) | ~£23 | **Kraft is literally the scrapbook look**. A brown-paper version of the pattern edit |
| Aluminium ornament, rect 10×8 / square 8×8 cm | `XMAS-ALUM-RC` / `-SQ` | uk5 → RM24 £6.45 (untracked) | £6 | ~£18 | Lighter, cheaper "starter" ornament |
| Glass ornament, square 7 cm | `XMAS-GLASS-SQ` | uk5 → RM24 £6.45 (untracked) | £7 | ~£19 | Premium look; sample first |
| Plastic bauble 8 cm | `XMAS-PLAS-BAUB` | uk5 → RM24 £6.45 (untracked) | £5 | ~£16 | Unbreakable, so it's the one *for little hands* |
| Fridge magnets, 4 images 10×10 | `MAG-4-10X10` | gb2 → RM24 £2.45 (untracked) | £4 | ~£10 | Stocking filler; 4 drawings in one |
| **Gold-foil box-framed print** 12×12″ | `FRA-BOX-FOIL-GOL-12X12` | gb3 → Evri Next Day £7.85 (tracked) | £34 | ~£65 | "Frame the wonky bits in gold", literally. **Sample essential**: on foil paper, the white of the drawing may read as gold [inferred] |
| Cork placemats ×4 / coasters ×6 | `H-PLACE-4PK` / `H-COAST-6PK` | uk9 → Tracked 48 £4.30 | £32.50 / £15 | already priced in range brief | Christmas dinner table; **same lab as bauble, so bundles work** |
| Metal tin, rect 18×11 cm | `MET-TIN-REC` | uk5 → RM24 £6.45 (untracked) | £9 | ~£22 | "Grandma's cookie tin". On-name for a *snickerdoodle*, but lid-only print and untracked |

\*Suggested shelf = rough whole-pound positions on the D21 model (~15 % net after all costs).
Run `scripts/price-catalogue.mjs` before committing. The uk5 lines use untracked RM24 on Standard. They're
fine as small add-ons (same call as cards) but **the wrong tier for a £20+ gift in December**, so
price in Express (Tracked) or accept the risk knowingly.

### 2.3 Christmas colours (red/green) — what Prodigi actually makes in the UK **[verified]**
| Garment | SKU | Festive colours | Lab → postage | Cost | Verdict |
|---|---|---|---|--:|---|
| **Kids sweatshirt, organic** (Stanley/Stella Dreamer) | `SWEAT-SS-STSK913` | **varsity green** | **uk9 → Tracked 48 £4.30** | £19 | ✅ **Best fit**: organic like our tees, UK, tracked, bundles with the bauble |
| Kids hoodie, organic (Mini Cruiser, ours) | `HOOD-SS-STSK911` | burgundy | uk9 | £22 | ✅ burgundy reads Christmassy |
| Kids tee, organic (Mini Creator, ours) | `TEE-SS-STTK909` | burgundy | uk9 | — | ✅ easy add |
| Adult sweatshirt (AWDis JH030) | `GLOBAL-SWEAT-AWD-JH030` | fire red, bottle green, kelly green, burgundy, red hot chili | uk2 → RM **1st Class £2.35 (untracked)** | £15 | ✅ cheap and fast, but not organic and untracked |
| Adult hoodie (AWDis JH001) | `GLOBAL-HOOD-AWD-JH001` | bottle/forest/kelly/moss green, fire red, burgundy | uk2 → RM 1st £2.35 | £18 | ✅ as above |
| Adult hoodie, organic (Drummer, ours) | `HOOD-SS-STSU812` | red, bottle green | ⚠ **pl1 Poland → Asendia £7.20** | £25.13 | ⚠ EU-made, slower, a new country for the image; skip for Christmas |
| Adult tee (Gildan 5000) | `GLOBAL-TEE-GIL-5000` | irish green (uk2 £2.35) · **cherry red ships from Australia, £17.45** | mixed | £8–9 | ⚠ per-colour lab trap, so pin colours to uk2 only |
| Kids Gildan hoodie/sweat in red | `GLOBAL-HOOD-GIL-18500B` / `-SWEAT-GIL-18000B` | red | **not available to GB** | — | ❌ |

**Recommendation for the open founder question** (NEXT-2026-10-23): yes, add festive colours, **organic-first**.
Add kids varsity-green sweatshirt + burgundy kids tee/hoodie (all uk9). For grown-ups, the **AWDis sweatshirt in
fire red / bottle green** (uk2) is the "matching family Christmas jumper" (a printed sweatshirt, not knit).
Christmas Jumper Day (Save the Children) is mid-December [inferred; confirm the 2026 date], so market it
then. Adults (uk2) and kids (uk9) are different labs, so **a family set ships as two parcels**. Fine, but
don't call it a bundle saving.

### 2.4 Not viable (US-made, ~£57–£63 postage each) **[verified]**
Quilted table runner (`GLOBAL-RUNNER-GREY-14X72`: £14 + **£62.96**), premium fleece blanket
(`GLOBAL-BLANKET-PREMIUM-FLEECE-*`: £26 + **£57.31**), quilted throw (£31 + £57). Napkins (`NAPKIN-W`) didn't resolve in the API.
There's no UK table linen beyond placemats and coasters.

## 3. Can we do wool? **Not for Christmas 2026.**
- **Prodigi has no knitwear at all**: no jumpers, beanies, scarves or knitted blankets in its whole catalogue
  (sitemap crawled today [verified]). Its only woven blanket is US-made.
- **Printful** does on-demand **jacquard knit**: a crew-neck sweater (55 % cotton / 45 % poly, **4-colour knit**)
  and a knitted beanie. The sweater blank is **"sourced and fulfilled in China"** [search: Printful]. Nov–Dec fulfilment
  is **9–16 business days, plus shipping up to 3 weeks** [search]. It's not wool, it would miss Christmas, and it means
  sending a child's image to a new processor in China, a transfer that LG3 would have to clear. ❌
- **Knitwise** (knit-on-demand) is a Shopify app with no API we can use [search]. ❌
- **Worth knowing for 2027:** a jacquard knit turns a drawing into a chunky few-colour "stitch" version. That could be
  a lovely product (the "knitted version of their drawing"), but it needs a **UK/EU knit-on-demand mill with an API,
  an Article 28 DPA and a sample**. Put it on the 2027 list (Contrado's catalogue is the first place to check).

## 4. Would another supplier be worth it? **Not for Christmas 2026; yes for 2027.**
- **For 2026, Prodigi already covers a proper Christmas range:** four ornament materials, sack, two wrapping
  papers, cards, the 2027 calendar, festive-colour sweats, placemats/coasters, magnets and a gold-foil frame. The
  gaps are stocking, tree skirt, knitwear, Christmas Eve box and UK table linen.
- **What a second supplier costs before it sells one item:** it's a **new processor of children's images**.
  That means an Article 28 DPA (LG5), a DPIA update (LG1), a transfer check (LG3), an integration (Contrado is
  Shopify-first; the API needs confirming), samples, and new cut-off dates. That's weeks of work, and none of it fits a
  launch that must be marketing by about 10 November. Under CLAUDE.md this is also a **stop-and-ask** (a new processor of child images).
- **For 2027: Contrado** (UK, London, in-house) is the natural second supplier: the keepsake/Christmas Eve box (brief
  already written), plus PJs, slippers and a hot-water-bottle cover from the range brief. Start the trade account and
  DPA in **January**, so it's live and sampled by September.

## 5. The calendar can go live for the new year, but it needs a real build (est. 2–3 days)
**Today it can't be ordered correctly.** The catalogue uses `CALENDAR-A4/A5-L-UNDATED`, which has a single
`default` print area, so the order would be one image. The product we want is **`CALENDAR-A4-L-DATED` /
`CALENDAR-A5-L-DATED`: "includes 2027 calendar dates"** [verified]. Prodigi prints the 2027 date grid. We
supply **13 required images (cover + 12 months) + an optional back cover**, each 3507×2480 px (A4) / 2480×1748 px (A5).
Same cost as undated: A4 £10 / A5 £9 + £4.35, from lab uk15. **Express isn't offered**, so its Christmas cut-off is
the Standard one.

**To ship it:**
1. Swap the SKUs to the `-DATED` versions (2027).
2. A "pick up to 12 drawings" step: from the Keepsake Home or new uploads, plus a cover. Gaps fill by repeating, so
   *one* drawing still makes a calendar. Per-page DPI check, as everywhere else.
3. `submit.ts` sends **a different URL per print area** (today `printTo` repeats one URL across areas).
4. A flip-through preview (cover → months).
5. **Re-price: today's £19/£21 nets about £0.80 on the A4** (ex-VAT £17.50 − fulfil £14.35 − fees/reprints/codes/running
   ≈ £2.35). Suggest **A5 £22 · A4 £24** (≈14–16 % net). Required tests: pricing, a 13-asset order, the DPI gate.
6. It keeps selling as "the new-year present" until about mid-January, then the dated stock goes stale. Swap to the
   2028 SKU when Prodigi lists it.

## 6. Founder actions from this brief
1. **Prodigi email** (one message): 2026 Christmas cut-offs per lab (uk9, uk7, uk15, gb2, gb3, uk2, uk5); written
   confirmation that one shipment = one parcel and that live pricing matches sandbox for multi-item shipments;
   whether uk15's "Mixed" carrier is tracked.
2. **Approve:** show bauble + sack; add kids varsity-green sweatshirt + burgundy kids lines + AWDis adult red/green;
   add kraft wrap; calendar → dated 2027 at £22/£24; uk5 ornaments as untracked add-ons (or skip).
3. **Order samples now** (sandbox → live): ceramic bauble, sack, gold-foil frame, kraft wrap, A4 dated calendar,
   varsity sweatshirt. Prodigi lead time is days, so they arrive in time for photos.
4. **No second supplier and no wool for 2026.** Contrado trade account + DPA in January for 2027.

## Sources (25 Oct 2026)
- Prodigi sandbox API `/v4.0/products/{sku}` and `/v4.0/quotes` (GB, GBP, Standard/Budget/Express), run from a
  read-only scratch script. No orders placed. Prodigi sitemap: https://www.prodigi.com/sitemap/ · Christmas
  category pages under https://www.prodigi.com/products/home-and-living/christmas/ ·
  API reference (shipments, per-shipment cost): https://www.prodigi.com/print-api/docs/reference/
- Printful knitwear [search]: https://www.printful.com/custom/mens/knitwear/relaxed-fit-knitted-crew-neck-sweater ·
  https://www.printful.com/custom/collections/holiday-season/knitted-beanie
- Knitwise [search]: https://appnavigator.io/app/knitwise-knit-on-demand-dropshipping/reviews/
