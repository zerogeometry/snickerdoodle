# Christmas — how Snickerdoodle leans into the season (researched 2026-10-25)

> **Decided 2026-10-25: scenario A** — finish + test the app, market from early/mid November, sell for
> Christmas 2026. Range, wool, supplier, calendar and postage-bundling answers:
> [CHRISTMAS-range-and-postage.md](CHRISTMAS-range-and-postage.md). Mockups: `mockups/christmas/`.
>
> Founder ask: when we go fully live, lean heavily into Christmas. Strategy across UI, product
> range, retail timing, families, SEO + AEO. Options + a recommendation; nothing here is decided.
> Labels as in the other briefs: **[verified]** page read today · **[search]** search snippet only ·
> **[inferred]** my reading · **[ours]** from our own repo/briefs.

## 0. The one-paragraph version
Christmas is the occasion our product was built for: the buyer is usually a grandparent or relative
("extended family destroys ~⅓ of gift value" — Waldfogel, in PRICING-elasticity-premium), and their
gift is the child's own art. So Christmas is not a red skin over the shop. It is **three loops**:
(1) **"draw it this weekend"**, getting the art made before the deadline; (2) **"send it to the
grandparents"**, the gift-link loop we already have, framed around Christmas; (3) **"this year's
bauble"**, a dated keepsake every year, so the Keepsake Home grows one Christmas at a time.
Keep the scrapbook look and add a festive *sticker layer*, not a new theme. Make the delivery
deadline honest and computed on the server. Don't run Black Friday discounts: our 15 % net can't
pay for them. Do evergreen `/christmas` pages that stay live all year.

## 1. The timing reality (read this first)
- **Today is 25 Oct 2026. LG1–LG5 are not closed** [ours: LAUNCH-GATES.md]. LG3 and LG5 aren't
  even started. No live child image can be processed until they are. Real Christmas 2026 trade
  needs the gates closed by **~mid-November**, because UK Christmas search and buying peaks
  **mid-Nov → 1 Dec** (34 % of Brits buy in November, 26 % in December) [search: OnePulse/Captify].
- **Shipping deadlines, Christmas 2025 for reference** [search, Royal Mail via press]: 2nd Class
  17 Dec · Tracked 48 19 Dec · 1st Class 20 Dec · Tracked 24 21 Dec · Special Delivery 23 Dec.
  Prodigi's 2026 cut-offs are **not published yet**. Their page says "last order dates will be
  posted here" [verified, prodigi.com/christmas-delivery-dates]. Last year: reduced hours on
  24 Dec, closed 25/26 Dec + 1 Jan, a skeleton crew in between [verified, Prodigi peak-season post].
  → **Action:** email Prodigi (add it to the open support email) for 2026 per-lab cut-offs,
  especially Guernsey (cards) and the textile labs.
- **A drawing takes time to exist.** A parent has to get the child to draw, photograph it, then
  order. So the *effective* deadline for marketing is about a week before the shipping cut-off.
  Every Christmas message should say "draw it this weekend", not just "order by".

**Three scenarios — pick one by ~8 Nov:**
| | If… | Then |
|---|---|---|
| **A. Live for Christmas 2026** | gates closed by ~15 Nov | §3 range (existing SKUs only) + §4 UI + a short paid/organic push 15 Nov–12 Dec |
| **B. "Founding families" Christmas** *(recommended default)* | gates not closed by 15 Nov | Public pages + waitlist live now; the Studio runs on-device previews only (no upload leaves the phone); "be first for Christmas 2027" + the **January thank-you-card launch** (§3.4) as the first real sale |
| **C. Christmas 2027 as the main event** | regardless | §7 calendar: Christmas-in-July press, September landing pages, October PTA schools |

Scenario B is safe either way. Everything in it is reused in C, and the pages do the SEO work
of building age and backlinks for 2027 (§6).

## 2. Who buys at Christmas, and why (positioning)
- **Grandparents:** £97–126 per grandchild; UK total £2.4–2.75bn [ours, SunLife via pricing brief].
  They are price-tolerant (buyer ≠ recipient) and want something that *isn't more plastic*. They
  arrive through the parent's gift link: no account wall, a ready-to-buy product, already made.
- **Parents:** 61 % spend >£100 per child [ours, YouGov Nov 2025]. *They* are buying **for the
  grandparents, the aunties, the teacher**, not for the child. This is the inversion that matters:
  **the child is the artist, everyone else is the recipient.** Merchandise by *who it's for*.
- **Teachers / nursery keyworkers** (end of term, ~19 Dec): a classic small gift. The tea towel,
  mug, card with "drawn by …".
- **Lead emotional line** (brand voice): *"the present they made themselves."* Secondary:
  *"they're only little once — and so is this Christmas."* Avoid guilt-pressure ("before it's too
  late"). The deadline is presented as *reassurance* ("order by 12 Dec and it's under the tree").

## 3. Product range for Christmas
We already have most of it [ours: catalogue.ts / D21]: **ceramic bauble £21 · christmas sack £35 ·
wrapping paper £20–£38 · greetings cards £5.50 / packs £12–£21 · calendar £19/£21 · tea towel £27 ·
socks £20 · mug · jigsaw · storybook · cushion · blanket · hoodies (hidden) · playing cards £24**.
The bauble and the sack are currently **hidden**, and the founder's open question is whether to show them
[ours: NEXT-2026-10-23]. **Recommendation: yes, show them from 1 Nov,** once their mockups pass
the visual diff.

### 3.1 Hero line-up (in shelf order on /christmas)
1. **"This year's bauble"**: the ceramic bauble with an optional small **year + first name**
   on the back ("Ava · 2026"). This is the heart of the plan: an *annual collectable*. Every year
   the Keepsake Home asks for the new one, and the tree fills up with a timeline of their drawings.
   (A first name only is already the rule; screen the text field as for the Studio.)
2. **Christmas card packs**: the family's own Christmas card, drawn by the child. Packs of 10 at
   £21 are the gateway product, and they're the classic "Cauliflower Cards" school-fundraiser item
   parents already know (deadlines early Oct, delivered early Dec) [search: school letters].
3. **Wrapping paper + gift tags** via the repeat "pattern" magic edit: *"every present wrapped in
   their art."* It's the most shareable reveal on social ("we wrapped everything in Ava's reindeer").
4. **The 2027 calendar**: a year of their drawings, *the* grandparent gift, and it sells through
   to mid-January. Make the multi-drawing builder fast: 12 drawings, or 1 repeated.
5. **Christmas sack**: *"where the magic waits on Christmas Eve"* (already the blurb).
6. **Tea towel / mug**: the teacher gift and the "from the grandchildren" kitchen gift.

### 3.2 New SKUs worth checking (cheap to add, all [inferred] until quoted)
- **Gift tags** (if Prodigi has a small-format card/sticker sheet): add-on, tasteful, ~£6.
- **Christmas Eve box**: the Contrado keepsake box brief already exists [ours]. Christmas Eve
  boxes are a big UK tradition. Ours could carry the child's drawing on the lid and be *reused every
  year*, a keepsake rather than packaging. Sample it before committing.
- **Stocking** (personalised stockings are a top UK Christmas search, [inferred]): check Prodigi /
  Contrado for a UK-made one. If none, the sack covers the need.
- **Placemat / table runner / napkins** ("Christmas dinner, set with their art"): check UK-made
  availability. A strong grandparent hosting gift.
- **Family matching hoodies / "Christmas jumper day"** (2nd Friday of Dec, Save the Children):
  the hoodies are seeded hidden pending packshots [ours]. A red tee/hoodie colour is the
  founder's open question. **Recommendation:** add UK-made red only if the packshot is ready by
  1 Nov, otherwise leave it for 2027. Apparel sizing in peak = returns risk.
- **Not this year:** drawing → silver pendant and drawing → plush. Both are high-WTP
  [ours, pricing brief] but have multi-week lead times that can't hit Christmas 2026.

### 3.3 Bundles instead of discounts
Our "plus one" postage is real money saved when a basket ships from one lab. Turn it into
Christmas bundles priced a little under the sum, honestly:
- **"Grandparents' box"**: calendar + bauble + card.
- **"Wrap the lot"**: wrapping paper + tags + card pack, from one drawing.
- **"The whole family"**: N baubles, one per cousin, from one gift link.
Price them server-side like everything else, with the saving computed and never trusted from the client.
Unit-test them, as the PR rules require for pricing.

### 3.4 After Christmas, the bit everyone forgets
- **Thank-you card packs (27 Dec → mid-Jan)**: "draw what you got." It's the same card SKU and a
  natural first order for families who missed the Christmas deadline. It's also scenario B's launch product.
- **Boxing Day → New Year: "keep this Christmas"** prompts in the Keepsake Home: upload the
  drawings from this Christmas and they file into a *Christmas 2026* chapter.
- **The calendar keeps selling into January.**

### 3.5 Last-minute buyers (after the cut-off)
- **Gift voucher (digital)**: the biggest last-minute Christmas earner in gifting [inferred].
  It needs a stored-value build + T&Cs (expiry rules, a UK gift-card Code of Practice review). It's a
  **2027 item** unless it's small enough to ship by 1 Dec.
- **Printable "it's on its way" reveal card**: for orders placed after the cut-off. A PDF
  the parent prints for under the tree showing a preview of the keepsake. It costs nothing, it's very warm, and
  the parent generates it (it shows only what the parent already sees; no new exposure).

## 4. UI — "Christmas in the scrapbook"
**Principle:** the D12 scrapbook direction is binding. Christmas is a **seasonal layer of stickers,
tape and copy**, not a new theme. No snow-globe redesign, no red/green palette swap.

### 4.1 Visual layer (all from existing tokens, no raw hex)
- **Washi tape** in a holly/candy-stripe pattern: cta-tomato + leaf on paper. It's a CSS gradient, so
  no image weight.
- **Chunky ink-outlined stickers** from Tabler: `christmas-tree`, `christmas-ball`, `snowflake`,
  `snowman`, `gift`, `star`, `candle`, `cookie-man` (a gingerbread man, and we're a cookie brand:
  make him the seasonal mascot sticker), `sock`, `confetti`, `truck-delivery`. All of these are in the
  installed package [verified]. ⚠ The installed `@tabler/icons` is **3.44.0**, but CLAUDE.md
  pins **3.31.0**. Check that the sprite is built from the pinned set. These icons are old and
  should exist in 3.31 too, but confirm before relying on them.
- **Honey/gold "frame the wonky bits in gold"**: a gold-foil-look preset frame for festive
  products (honey #F6C445 fills, cocoa ink). The brand line becomes literal at Christmas.
- **Motion:** one gentle "sticker wiggle" on the bauble and a **CSS-only snowfall** on the
  /christmas hero only (transform/opacity, a few pseudo-elements, *never* on an ancestor of the tab
  bar/sheets, fully off under `prefers-reduced-motion`). No JS timers, per the motion rules.
- **Gaegu handwriting moment** (one per view): "drawn by Ava, Christmas 2026" on the product page.

### 4.2 Turning it on and off
- One server-side **season flag** (`SEASON=christmas` by date window, e.g. 1 Nov → 6 Jan), read in the
  root layout. It adds a `data-season` attribute and swaps a few copy strings and stickers. It's
  server-rendered so there's no flash, and easy to preview and visual-test. Add a `tests/visual` snapshot
  of the festive home at 390 px + desktop, as CLAUDE.md requires.
- Seasonal *content* (copy, featured products, deadline dates) lives in **one data file**, so
  next year's Christmas is an edit, not a build.

### 4.3 Screens that change
| Screen | Christmas change |
|---|---|
| **Home** | Hero: "the present they made themselves" + taped polaroid of a bauble/card. Primary CTA stays **"start creating"** (keep the wobble). A small **deadline strip** under the header. |
| **Deadline strip** (new) | "order by **Fri 12 Dec** for christmas · draw it this weekend". Computed **server-side per product** from lab cut-off + carrier, and it changes as dates pass ("now: 1st class, order by 18 Dec"). After the last date it says so honestly and points to thank-you cards / the reveal card. Never a fake countdown timer. |
| **Shop** | A "christmas" shelf first; filter **by who it's for** (grandparents · teacher · aunties & uncles · the whole family) as well as by product. |
| **Product page** | "arrives by christmas ✓" badge per product + the delivery date. The "this year's bauble" year/name option. |
| **Studio** | Festive **preset frames + sticker sheet** (holly tape, gold frame, snowflakes) as one-tap magic edits. They're deterministic and self-hosted, so no third party sees the image (Phase-1 rule). No generative "make it Christmassy" until P3, and never a free-text prompt. |
| **After first creation** | The gift-link moment becomes: *"send it to the grandparents for christmas"*, pre-filled with the 5 % join saving (already built). |
| **Keepsake Home** | A **"Christmas 2026"** chapter that collects this season's drawings + orders. Next November it says "Ava's 2025 bauble is on the tree — make this year's?" (an opt-in reminder, parent only). |
| **Basket / checkout** | Gift options stay small: gift message (screened), send-to-recipient address, the reveal card. Guest checkout stays one tap away. No pre-ticked add-ons. |
| **Mobile** | The deadline strip collapses into the sticky header as a single line; the primary action stays in the thumb zone. |

### 4.4 Copy bank (brand voice — lowercase, warm, a wink)
- "the present they made themselves"
- "draw it this weekend. under the tree by christmas."
- "wrap every present in their art"
- "this year's bauble — one for every christmas they're little"
- "frame the wonky reindeer in gold"
- "send it to the grandparents (they'll cry, in a good way)"
- "missed the post? draw a thank-you instead"
- deadline: "order by fri 12 dec for christmas — we'll keep you posted if anything changes"

## 5. Trust, privacy and child safety at Christmas (non-negotiables, season-specific)
- **No public "Christmas gallery", competition entry wall or "share your drawing" UGC.** Nothing
  public, ever. Any social campaign uses **parent-posted** content on their own accounts with
  explicit consent for any reuse. We never collect submissions.
- **Letters to Santa / wish lists: do NOT build** as a data feature. A child's wish list is
  profiling-shaped data about a child (Children's Code). A *drawn* "letter to santa" printed as a
  keepsake card is fine: it's just an image the parent uploads. The text-on-image screening stays on.
- **School nativity / party photos contain other people's children.** If photo upload is promoted
  at Christmas, the copy should steer to drawings and the parent's own child: "please only use
  photos of your own family".
- **The PTA "class Christmas cards" scheme:** the parent uploads at home, and the class code is an
  attribution tag only. The school never bulk-uploads children's art [ours, marketing brief §1].
  The class code needs building (Sept 2027 for schools; school card deadlines are early Oct).
- **Gift messages / name on bauble:** first name only, abuse-screened, child surname rejected
  (existing rule; add the bauble's text field to the same test).
- **Reminders next November** are opt-in, sent to the parent, and say what they are. No
  marketing email to anyone who didn't opt in (PECR).

## 6. SEO + AEO
### 6.1 Structure (evergreen, so authority compounds year on year)
- **`/christmas`** (never `/christmas-2026`). It stays live all year, with the copy refreshed each autumn
  and a visible "updated" date. Under it, intent-matched pages (one product + one question each):
  - `/christmas/personalised-baubles` — "personalised bauble from a child's drawing"
  - `/christmas/cards` — "christmas cards from my child's drawing"
  - `/christmas/wrapping-paper` — "wrapping paper with my child's drawing"
  - `/christmas/gifts-for-grandparents` — "christmas gifts for grandparents from grandchildren"
  - `/christmas/teacher-gifts` — "christmas gift for teacher from child"
  - `/christmas/delivery-dates` — "last order date for christmas" (the page people and engines
    actually look for in December; it's generated from the same cut-off data as the strip)
- Add them to `sitemap.ts`; keep the family/app pages closed (they already are).
- **Search reality:** "personalised christmas ornament" (US spelling) runs ~2.4k/mo in May → 49.5k in Oct
  → 165k in Nov [search: RankHero, US-weighted]. The shape matters more than the number: pages must
  be **indexed by September**. For 2026 we are already late, which is another reason scenario B's job is to
  build page age for 2027. → Founder: pull **UK** Google Trends / Keyword Planner for "personalised
  bauble", "christmas cards from child's drawing", "gifts for grandparents from grandchildren".

### 6.2 Answer engines
- Use the FAQ pattern we already ship [ours: SEO-AEO-faq]: question headings, a **one-sentence answer that
  names Snickerdoodle**, specific facts, FAQPage schema from the same source.
  Christmas questions to add:
  - "What's the last day to order from Snickerdoodle for Christmas?" (dynamic date)
  - "Can I turn my child's drawing into a Christmas bauble?"
  - "What's a good Christmas present for grandparents from a toddler?"
  - "Can I make Christmas cards from my child's drawing?"
  - "Can I make wrapping paper from my child's drawing?"
  - "Is it safe to upload my child's drawing?" (our edge; link the family promise)
- **Product structured data** on public product pages: `Product` + `Offer` with price,
  `shippingDetails` (handling + transit time), `hasMerchantReturnPolicy` (personalised = not
  returnable for change of mind; faulty = reprint). ChatGPT shopping research (launched late Nov
  2025) and Google both read offers like these [search: eMarketer, Digital Commerce 360].
- **Google Merchant Center free listings** (UK) with **holiday cut-off** settings. Holiday cut-offs
  live in Merchant Center shipping settings, not on-page markup [search: Google Content API
  docs]. Low-ops and free.
- **Corroboration beats markup.** Vendor data suggests AI shopping answers lean on video reviews
  and forum threads [search: BrightEdge, vendor]. So: Mumsnet/Reddit presence (honest, founder
  voice), parenting-blog gift guides, and short "drawing → bauble" reveal videos on
  YouTube Shorts / TikTok / Pinterest (parent-made, with consent).
- **Bing Webmaster Tools** (it feeds ChatGPT search) — still on the founder's pre-launch list.

## 7. Calendar
**Christmas 2026 (scenario A or B)**
| When | What |
|---|---|
| by 1 Nov | Season flag + /christmas pages + deadline page (with placeholder dates) + FAQ additions live; bauble + sack un-hidden *if* mockups pass |
| ASAP | Prodigi: 2026 per-lab cut-offs; Merchant Center account |
| ~8 Nov | **Decide A or B** on gate status |
| 15 Nov → 1 Dec | Peak window: "draw it this weekend" weekly emails (opt-ins only), gift-link prompts, Pinterest/Shorts |
| 28 Nov (Black Friday) | **No sitewide discount.** Instead, a "keepsake friday" bundle *or* a donation per order to a children's charity. 15 % net can't fund 20 % off, and the brand shouldn't shout |
| ~12 Dec (TBC) | Last standard-delivery day → the strip switches to express-only dates |
| ~19–20 Dec | Last express day → the reveal card + thank-you cards take over |
| 27 Dec → mid-Jan | Thank-you cards · 2027 calendar · "keep this Christmas" Keepsake Home prompts |

**Christmas 2027 (scenario C)**
| When | What |
|---|---|
| Jan–Mar | Review 2026: which products, which recipients, cut-off misses, reprint rate |
| Apr–May | Sample new SKUs (Christmas Eve box, stocking, table set, gift tags); gift voucher build |
| **Jul** | **"Christmas in July" press pitches.** Print and online gift guides are compiled July–Sept [inferred, industry norm] |
| Aug | Build PTA class codes + the school pack (school card deadlines are early Oct) |
| **Sept** | /christmas refreshed and re-submitted; Merchant Center holiday settings; Pinterest pins (Pinterest gift search starts early) |
| Oct | Schools run their "class christmas cards"; returning families get "this year's bauble" reminders (opt-in) |
| Nov–Dec | As 2026, with a year of page age, reviews and returning families |

## 8. Ops for a solo founder
- **The cut-off dates are the single biggest support-ticket generator.** Make them data (one file,
  per lab × service), shown everywhere from that one source, and add a margin day.
- **Reprints:** after ~15 Dec there's no time to reprint a damaged item. Say so kindly in the
  FAQ, and offer the reveal card + the delivery date as soon as it's known.
- **Moderation queue at peak:** the classifier flags into human review, and a flagged item can't reach
  print. In December a slow review = a missed Christmas. Plan review time daily from 15 Nov, and tell
  the parent "we're just checking this one — it won't take long".
- **Prodigi capacity:** last year they ran reduced hours 24 Dec and were closed 25/26 Dec + 1 Jan
  [verified]. Pause "arrives by christmas" badges automatically when the data says so.

## 9. What to build (if the founder says go), in order
1. Season flag + festive sticker/tape layer + /christmas hub + visual test. *(small)*
2. Cut-off data file → deadline strip, product "arrives by christmas" badge, `/christmas/delivery-dates`,
   FAQ entry. **Server-side, unit-tested** (date math per lab/service, before/after cut-off). *(small–medium)*
3. Un-hide bauble + sack (mockup check); bauble year + first-name option (text screened). *(small)*
4. Christmas Studio presets: holly tape, gold frame, snowflake stickers (deterministic). *(medium)*
5. Gift-link copy swap "send it to the grandparents for christmas". *(tiny)*
6. Shop "who it's for" filter + Christmas bundles (server-priced, tested). *(medium)*
7. Keepsake Home "Christmas 2026" chapter. *(medium)*
8. Printable reveal card. *(small)*
9. 2027: gift vouchers, PTA class codes, opt-in "this year's bauble" reminder, new SKUs.

## 10. Founder decisions needed
1. **Scenario A / B / C**: decide by ~8 Nov on gate status (B is the safe default).
2. Show the **bauble + sack** from 1 Nov? (recommended: yes, if mockups pass)
3. **Red/green tee or hoodie** line for Christmas 2026? (recommended: only if packshots are ready by 1 Nov)
4. **Black Friday**: none / "keepsake friday" bundle / charity donation? (recommended: a bundle, no discount)
5. Approve the **`cookie-man` gingerbread sticker** as the seasonal mascot (on-brand for a cookie name).
6. Build order in §9: go?

## Sources (25 Oct 2026)
- Prodigi peak-season post (closures, reduced hours) [verified]: https://www.prodigi.com/blog/preparing-for-peak-season/
- Prodigi Christmas delivery dates (2026 not yet posted) [verified]: https://www.prodigi.com/christmas-delivery-dates/
- Royal Mail 2025 last posting dates [search]: https://www.royalmail.com/christmas/last-posting-dates ·
  https://www.create.net/blog/christmas-last-posting-dates-2025---royal-mail
- UK Christmas timing (34 % Nov / 26 % Dec; mid-Nov → 1 Dec search peak) [search]: https://www.onepulse.com/?p=15765 ·
  https://www.exchangewire.com/?p=1784185 · https://www.mintel.com/insights/retail/consumer-gifting-behaviour-and-seasonal-retail-trends/
- "personalized christmas ornament" seasonality [search, US-weighted]: https://www.rankhero.com/keywords/personalized-christmas-ornament
- School card fundraisers (Cauliflower Cards: Oct deadlines, Dec delivery, ~£300/school) [search]:
  https://blogs.glowscotland.org.uk/ea/gargiestonpsandecc/2018/10/03/cauliflower-christmas-card-project/ ·
  https://www.dunbury.dsat.org.uk/_site/data/files/migrated/letters/cauliflower-cards-letter.pdf
- ChatGPT shopping research (late Nov 2025) [search]: https://www.emarketer.com/content/chatgpt-free-personalized-buying-guides-holiday-shoppers ·
  https://www.digitalcommerce360.com/2025/11/25/chatgpt-shopping-research/amp/
- AI Overview shopping citations (vendor data) [search]: https://gist.ai/blog/ecommerce-ai-overviews ·
  https://videos.brightedge.com/assets/weekly-insights/aio-holiday/AIO%20HOliday.pdf
- Merchant Center holiday cut-offs / shippingDetails [search]: https://developers.google.com/shopping-content/reference/rest/v2.1/shippingsettings ·
  https://developers.google.com/search/docs/appearance/structured-data/shipping-policy
- Black Friday opt-outs / Green Friday [search]: https://stylist.co.uk/news/environment/green-friday-black-friday/456016 ·
  https://bira.co.uk/news/independent-retailers-boycotting-black-friday-sales-for-second-year/
- Grandparent spend, gift deadweight loss, UK parent spend: see PRICING-elasticity-premium.md sources [ours].
