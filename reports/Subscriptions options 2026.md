# Sell grandparents a year of drawings first

*Research report, 26 November 2026. Sources are linked inline. Our own costs from Prodigi appear only as ranges. Repo paths are relative to the repo root.*

## The answer: launch a prepaid grandparent gift this week, and keep storage free

**Launch "a year of little drawings" first.** It is a gift a grandparent buys once, for **£55, post included**. It does not renew. Over the next twelve months it brings **three seasonal letterbox drops** (the parent picks four fridge magnets or five cards each time, made from the child's own drawings) and then **a calendar of the year's drawings in November**. The parent stays in charge: they accept the gift, choose the drawings and choose where the post goes. The grandparent gets lovely post. They get no new view of anything in the Keepsake Home.

Here is why this one goes first, in plain words:

- **It sells into Christmas.** It can be sold as an emailed, printable gift certificate right up to 24 December. That is after the last posting dates for physical keepsakes (10–11 December).
- **It needs no new kind of payment.** It is a normal one-off Stripe payment, the same kind we already take.
- **The new subscription law does not cover it,** because nothing renews.
- **The money comes in up front.** It also brings new families to the site through their own parents.
- **It leaves about £10 per gift** after every cost we can count.

The first drop is not due until March. That gives January and February to build the parts that make it, so this week's work is only the shop page, the payment and the certificate.

**Is there a cap on keepsakes or storage today? No.** No limit exists anywhere in the code on how many keepsakes a family keeps, how many bytes, how many children or how many members. The limits that do exist are small and practical:

- 25 MB per web upload and 20 MB per upload from the Draw app
- 120 uploads an hour per signed-in account
- a monthly budget on the self-hosted magic edits

Kept keepsakes stay until the parent deletes them (`src/server/retention.ts`, `src/storage/quarantine.ts`, `src/server/rateLimit.ts`, `src/server/magic.ts`).

**Do not charge for storage.** It would bring in a limit that doesn't exist today. It would break what our FAQ and terms already promise. And it would repeat the "holding my kids' art hostage" backlash that hit Artkive. Instead, **make "never held hostage" a written promise.** No competitor makes it.

## Today we sell keepsakes one at a time, and nothing recurs

**Storage is free and has no cap.** Each drawing is one original (written once, never changed) plus a few working copies. They sit in a private S3 bucket in London, and originals have their own encryption key (`src/storage/objects.ts`, `src/storage/client.ts`). Unkept uploads are deleted 30 days after upload or after the order is made. A kept keepsake is "never touched" by the clean-up job (`src/server/retention.ts`). Our internal estimate is about 5p per image for screening and storage together, and most of that is the content-safety check, not storage (internal fact sheet, `reports/investor-deck/00-internal-fact-sheet.md`). We have no measured storage per family.

**Products that suit a plan are already on sale, and post is free on all of them.** Every price already includes UK delivery (`DELIVERY_PENCE = 0` in `src/pricing/catalogue.ts`). So "free postage" can't be a member perk: everyone already gets it. These are the products that matter for subscriptions (`src/server/catalogue.ts`):

| Product | Our price | Prodigi SKU | Profit % of ex-VAT price (before allowances) | Status |
|---|---|---|---|---|
| Greetings card 7×5″ | £5.50 | CLASSIC-GRE-FEDR-7X5-BLA | about 55% | live, cheap flat untracked post (lab uk7) |
| Card pack of 5 / of 10 | £12 / £21 | same SKU ×N, one order | about 41% / 39% | live since 21 Oct |
| Calendar 2027, A5 / A4 | £22 / £24 | CALENDAR-A5-L-DATED / A4-L-DATED | about 32% / 33% | live; no Express; dated January to December |
| Fridge magnets, 4 drawings | not sold (brief suggests about £10) | MAG-4-10X10 | n/a | quoted in the sandbox only |
| Storybook, A5 / A4 hardcover | £26 / £29 | BOOK-FE-A5/A4-P-HARD-G | n/a | **paused**: Prodigi refuses a book without its page files, and we can't build multi-page files yet |
| Stickers | not sold | Prodigi has single kiss-cut stickers only | n/a | no sticker *sheet*, no sticky-note pad |

**Discounts are kept to a minimum on purpose.** Since 17 November (D30) there has been one welcome offer: a free card on a signed-in buyer's first paid order (`FIRSTCARD`). The private margin sheet says it is switched off at the moment. Partner codes pay schools and creators **10% of the order before VAT**. The 5% join saving and "give £5, get £5" were retired (`project-office/DECISIONS.md` D30; `src/pricing/promo.ts`). In D24 the founder also chose "honest bundles only, no Black Friday discount". A plan that is mainly a discount would cut against both decisions.

**Stripe takes one-off payments only.** The code uses `mode: 'payment'` Checkout only. There is no Stripe Billing, no saved card, no Stripe Customer and no subscription webhook (`src/payments/stripe.ts`, `src/payments/webhook.ts`). The whole basket's savings travel as one single-use coupon per checkout. Anything that renews automatically means new Stripe work. A prepaid gift reuses what we already have.

**Grandparents can't see new keepsakes by default.** Grandparents, aunts and uncles, and friends join the EXTENDED circle by default. New keepsakes are FAMILY tier by default, and EXTENDED members see only EXTENDED-tier keepsakes (`src/domain/relationships.ts`, `src/db/schema.ts`, `src/authz/tiers.ts`). So a grandparent gift must not need the grandparent to *see* anything in the app. The parent picks the drawings, and the grandparent receives the result in the post. That fits the rule that the parent is in control, and it gives the grandparent something the app deliberately doesn't.

**Children's data stays minimal.** We hold first name only, an optional birthday and a controlling parent (`src/db/schema.ts`). An occasions calendar and a birthday reminder engine already exist, and they need the parent's REMINDERS consent (`src/server/reminders/index.ts`). The Draw app must never handle children's birthdays (D29).

**A storage paywall would contradict copy that is live today:**

- "You only pay for the products you order" (`src/lib/faq.ts`).
- A kept drawing stays "unless you choose to" let it go (`src/lib/faq.ts`).
- docs/05: "kept assets persist until the controller deletes them".
- The family promise: "see everything we hold, download it, or delete it — any time, in one tap" (`src/app/(marketing)/trust/family-promise/page.tsx`).
- "Free to join" on gift links.
- "The app costs nothing … no in-app purchases and no prices" for Draw (`src/app/(marketing)/trust/terms/draw/page.tsx`).

Nothing in the copy says "free forever" or "unlimited", but the plain meaning is clear.

**Paid extras in the Draw app are out.** Our own rules ban prices, "unlock" and "upgrade" anywhere in the app, even in the grown-ups' corner (`snickerdoodle-draw/docs/WEBSITE_ALIGNMENT.md`). Apple's rules add more. Kids-category apps can't offer purchases except behind a parental gate. Any *digital* extra unlocked by a web subscription must also be sold as an in-app purchase, and outside the US the app can't even point to the web offer ([Apple App Review Guidelines 1.3, 3.1.1, 3.1.3(b)](https://developer.apple.com/app-store/review/guidelines/)). Every plan below is sold and managed on the website, by a grown-up, and never mentioned in the app.

**We have no traction numbers yet.** No real order count or average order value is written down anywhere. The site went public on 13 November, and the £35 average order is still an assumption (`reports/investor-deck/00-internal-fact-sheet.md`). Live numbers are in /admin.

## Competitors: storage tiers are common, physical plans are rare, and grandparent gifts don't exist

*Prices are as listed on 26 Nov 2026 unless marked. USD is converted at about £0.75–0.80 per $1, as a rough guide only. UK App Store listings often don't say which price is monthly and which is yearly. Those are marked "period not shown".*

### Kids' art keepsake services

| Service | Price (GBP) | Billing | What's included | Cancelling | Reviews: praise / complaints |
|---|---|---|---|---|---|
| **Artkive** (US) | Organizer ~£25–31; Creator ~£41–44; Book Lover ~£107–114; Box VIP ~£29–31 a year ($33 / $55 / $143 / $39) | yearly only | Unlimited storage; 10–30% off books; a free 25-page or 95-page book on the top two; VIP gets 2 mail-in boxes a year ([plans](https://artkiveapp.com/plans)) | Email or text to cancel. Non-member images can be removed 90 days after notice (FAQ search snippet) ([FAQ](https://faq.artkiveapp.com/hc/en-us/articles/360038276252-All-About-Membership-Plans)) | Praise: "does its very tight niche well", secure, tagged by age. Complaints: the 2017 switch to paid membership was called "holding my kids art hostage"; a $49 bulk-download fee was later dropped; vague two-step pricing; lost cards ([App Store reviews](https://apps.apple.com/us/app/artkive-save-kids-art/id549980508?see-all=reviews&platform=iphone); [Trustpilot](https://uk.trustpilot.com/review/artkiveapp.com)) |
| **Keepy** | £7.49 a month; other "Unlimited" prices £8.99–£42.99 (period not shown); **lifetime £99.99**; free tier 20 keepies a month in the UK | monthly, yearly or lifetime, through the App Store | Unlimited uploads ([UK App Store](https://apps.apple.com/gb/app/keepy-artwork-schoolwork/id647088205)) | Apple settings, at least 24 h before renewal | Praise: declutters, grandparents comment. Complaints: drawings vanished after a paid year (2018); freezes; 5 images per upload |
| **Plum Print** (US) | books ~£75–165 for 20 pieces ($99–$210), then $2.25–$3 a piece | one-off | Digitising, gallery, return of the art for $24.99 ([pricing](https://www.plumprint.com/pricing)) | n/a | not gathered |
| **UK art-book makers** | Doodle Nest box £39, books from £195 (snippet); Silk Giraffe from £89 for 30 pieces; Cards to Books from £99 for 30; Point101 scans from £49; Inkifi DIY book £19.19 plus delivery | **all one-off; no membership found** | Mail-in or DIY books ([Doodle Nest](https://doodlenest.co.uk/); [Silk Giraffe](https://silkgiraffe.com/product/artwork-book/); [Cards to Books](https://cardstobooks.co.uk/artworkbook/); [Point101](https://www.point101.com/kids_artwork/); [Inkifi](https://inkifi.com/photo-books/kids-artwork-book.html)) | n/a | not gathered |

### Family memory apps (storage tiers)

| Service | Price (GBP) | Billing | What's included | Cancelling | Reviews |
|---|---|---|---|---|---|
| **Tinybeans** | £7.99 and £69.99 (period not shown; officially $7.99 a month / $74.99 a year) | monthly / yearly; 2-week trial | Free: 20 uploads a month, 5 GB, ads. Paid: unlimited, no ads, export, **free photo-book shipping** ([UK App Store](https://apps.apple.com/gb/app/id521633042); [help](https://tinybeans.helpscoutdocs.com/article/22-how-much-is-a-tinybeans-premium-subscription)) | In the app or on the web. "We'll never delete your memories just because you cancel." 12 months of inactivity may lead to deletion ([help](https://tinybeans.helpscoutdocs.com/article/87-will-my-memories-be-deleted-if-i-cancel-my-subscription-or-downgrade)) | 4.8 from 6.6k UK ratings; one called £7.99 "fairly pricy" (2018) |
| **FamilyAlbum** | £5.49 a month / £54.99 a year; Pro £10.49 / £104.99 | monthly / yearly | **One subscriber unlocks Premium for everyone in the album**; free photo-book shipping; the free tier has ads ([UK App Store](https://apps.apple.com/gb/app/id935672069); [help](https://help.family-album.com/hc/en-us/articles/360038264494-What-is-FamilyAlbum-Premium)) | App Store only | 4.8 from 59k UK ratings |
| **23snaps** (UK) | £3.99 / £6.99; **gift terms of 1, 3, 6 and 12 months at £7.49 / £16.99 / £29.99 / £52.99** | monthly or prepaid gift | Unlimited HD storage ([UK App Store](https://apps.apple.com/gb/app/id526481189)) | App Store | 4.7 from 1.4k |
| **BackThen** (took in Lifecake's users) | free with 1 GB, then £4.99 a month | monthly | Storage ([UK App Store](https://apps.apple.com/gb/app/id1505173822)) | App Store | Complaints: a failed migration, and Lifecake's paid storage was not refunded |

### Photo, print and card memberships, and cloud storage

| Service | Price (GBP) | Billing | What's included | Cancelling | Reviews |
|---|---|---|---|---|---|
| **Moonpig Plus** | **£10.99 a year** (older pages say £9.99, so it probably rose by £1; date not found) | renews every year | At least 30% off every card; a free first card plus First Class post; a free postcard every month (pay postage); 50% off 100 cards ([FAQs](https://help.moonpig.com/en/articles/318297-moonpig-plus-faqs); [terms](https://www.moonpig.com/uk/terms-and-conditions/moonpig-plus)) | In My Account. 14-day cooling-off at sign-up and at renewal, refunded minus benefits used. Reminders 14 and 3 days before renewal (search summary) | **1 million members, up 36%** ([Moonpig H1 FY26](https://www.moonpig.group/media/z24pxi24/moonpig-group-plc-fy26-half-year-results-presentation-script-final.pdf)). One complaint: "charged again after cancelling" (May 2026, unverified) ([Trustpilot](https://es.trustpilot.com/review/moonpig.ie)) |
| **XTRAthortful** | £9.99 a year | renews every year | 33% off A5 and A4 cards ([terms](https://www.thortful.com/info/xtrathortful/terms-of-use)) | Auto-renews unless cancelled | not gathered |
| **FreePrints / Photobox app / Snapfish app** | no fee; postage £1.49–£4.49 per order | none | 45–50 free 6×4 prints a month; credits expire each month ([MoneySavingExpert](https://www.moneysavingexpert.com/deals/free-photo-prints)) | n/a | FreePrints has ~179k Trustpilot reviews, a sign of scale |
| **Photobox / Shutterfly storage** | free | none | Photos are deleted after **18 months without a purchase** ([Photobox](https://photobox.co.uk/retention-periods); [Shutterfly](https://support.shutterfly.com/s/article/shutterflys-unlimited-photo-storage-for-active-customers)) | n/a | Shutterfly's 2023 change caused press backlash and an extended deadline ([PetaPixel](https://petapixel.com/2023/01/10/shutterfly-is-closing-down-share-sites-and-putting-limits-on-cloud-storage)) |
| **Chatbooks Monthly Minis** (US) | ~£7.50–8 a month ($10) | monthly | A mini photo book every month; **not sold in the UK**; credits expire after 13 months; pause only on iOS ([help](https://help.chatbooks.com/en/articles/7906070-how-does-billing-work-for-monthbook-chatbooks-subscriptions)) | Unused credits expire when you cancel | not gathered |
| **iCloud+ / Google One / Amazon Prime** | £0.99 (50 GB), £2.99 (200 GB), £8.99 (2 TB); Google £1.59 (100 GB), £7.99 (2 TB); Prime £8.99 a month / £95 a year with unlimited photos | monthly / yearly | Family sharing ([Apple](https://support.apple.com/en-gb/108047); [Google](https://one.google.com/about/plans?hl=en-GB); [Which?](https://www.which.co.uk/news/article/amazon-prime-subscription-price-to-rise-in-september-how-to-save-aHpFu8Q4G2b0)) | Self-serve | These are the cheap anchors any "storage" fee would be compared with |

### Monthly kids' boxes

| Service | Price (GBP) | Billing | What's included | Cancelling | Reviews |
|---|---|---|---|---|---|
| **toucanBox** | £8.95 + £2.95 P&P (about 2019; old figure) | rolling monthly, or 3, 6 or 12 months | A craft box with the child's name ([MadeForMums](https://madeformums.com/reviews/best-subscription-boxes-for-families)) | Complaints of cancellations that "failed", two more charges, and being held to a 12-month term | 4.6 from 4,343 reviews, **none in the last 12 months**; customers say it **stopped after May 2025** (no official statement) ([Trustpilot](https://uk.trustpilot.com/review/toucanbox.com)) |
| **KiwiCo** (US, ships to the UK) | from ~£18–19 ($24) plus $5.95 post plus VAT | monthly, 3 or 12 months prepaid, or yearly billed monthly | STEM crates ([support](https://support.kiwico.com/en_us/how-much-do-subscriptions-cost-SkeKovxfw.md)) | Pause or cancel | not gathered |
| **Bookabees** | £9.99 / £19.99 / £29.99 for 1, 3 or 5 books, delivery free (snippet) | monthly | Books ([Day Out With The Kids](https://www.dayoutwiththekids.co.uk/hub/parenting/best-subscription-boxes-for-kids)) | Skip a month or set a holiday | Praised for skipping; "less hands-on" |
| **Others** | Mud & Bloom from £10.95 a box on 12 months; Willow & Wild from £7.25; Our Little Globe about £5 with post; Banjo Robinson £5.35–£13.95 (inconsistent, old) | mostly monthly | Nature, craft and letter boxes ([Mumsnet](https://www.mumsnet.com/swearsby/best-subscription-boxes); [LatestDeals](https://www.latestdeals.co.uk/freebies/kids-travel-world-pen-pal-letters-first-pack-free-ourlittleglobe)) | Willow & Wild: 2 days before dispatch; Mud & Bloom: monthly plans can stop any time | — |
| **Stickers** | Pipsticks (US) $11.95–17.95 a month | monthly | **No UK kids' sticker club with sterling prices found** ([MSA](https://www.mysubscriptionaddiction.com/2021/02/pipsticks-kids-club-classic-review-jan-2021.html)) | — | — |

### Yearly products

| Product | Price (GBP) | Billing | Notes |
|---|---|---|---|
| Photobox A4/A3 wall calendar | £19.99–£24.99 plus delivery | one-off | ([Photobox](https://www.photobox.co.uk/shop/calendars-and-diaries/a3-and-a4-wall-calendars)); deep-discount sellers go as low as a few pounds ([Groupon](https://www.groupon.co.uk/deals/personalised-a4-wall-mount-calendar)) |
| **Our calendar** | A5 £22, A4 £24, post included | one-off | Made from a child's own drawings; nobody else in the UK does this from drawings (our earlier competitor report) |
| Wonderbly personalised book | £24.99–£34.98 | one-off | ([NOTHS](https://Notonthehighstreet.Com/wonderbly)) |
| Notabli "Book subscriptions" (US) | — | recurring | The only auto-printed yearly-style books found, and from photos, not art ([App Store](https://apps.apple.com/us/app/notabli/id580644870)) |

Calendar and photo-gift sales run from **November to mid-January, peaking mid-December** ([Printbox](https://getprintbox.com/blog/seasonality-in-business-how-to-prepare-for-the-peak-season/)).

### Gift subscriptions (the grandparent channel)

| Service | Price (GBP) | How the gift works | Renewal |
|---|---|---|---|
| **Bloom & Wild** | from £22 a box, delivery free | Prepaid 3, 6 or 12 months, **saving over 20%, 25% or 30%**; **every subscription comes with a digital gift certificate** ([Bloom & Wild](https://www.bloomandwild.com/subscriptions)) | Prepaid terms end; ongoing plans can pause or cancel any time |
| Little Passports (US) | $25 a month, $21 on 6 months, $18 on 12 | Gift message in the first box, plus an emailed or printed gift card ([pricing](https://littlepassports.com/pricing)) | — |
| 23snaps | **12 months £52.99** | A prepaid digital gift ([App Store](https://apps.apple.com/gb/app/id526481189)) | ends |
| Skylight Plus (photo frame) | **£29 a year**, cancel any time; frame £149 ([Skylight UK](https://myskylight.com/en-gb/products/skylight-plus/)) | — | renews |
| Nixplay Plus | $29.99 a year, also sold "1 year prepaid, non-recurring" with a frame ([Nixplay](https://nixplay.com/products/8-hd-screen-1-year-plus-membership)) | — | none on the bundle |
| Aura frames | no subscription; frames ~£120–222 ([Costco UK](https://www.costco.co.uk/Furniture-Mattresses/Home-Furnishings-Accessories/Aura-Parker-Frame-Reeded-Slate/p/674045)) | Wins on "no subscription" | — |

### Kids' creative apps

| App | Price (GBP) | Billing | Notes |
|---|---|---|---|
| Sago Mini World / Piknik | £6.99–£59.99 (period not shown); holiday yearly £27.99 | monthly / yearly | Cancel in Apple settings; no family sharing across Apple IDs; one complaint objects to "£36 a year" ([UK App Store](https://apps.apple.com/gb/app/sago-mini-world-kids-games/id874425722); [Amazon UK](https://www.amazon.co.uk/Sago-Mini-Subscription/dp/B08V4RGB7P)) |
| Pok Pok | £6.99–£12.99 a month; £45.99–£79.99 a year; **lifetime £89.99** | monthly / yearly / lifetime | ([UK App Store](https://apps.apple.com/gb/app/id1550204730)) |
| LEGO DUPLO World | £6.99 a month, £39.99 a year | monthly / yearly | The switch from buying worlds to a subscription upset a parent who had bought 16 ([UK App Store](https://apps.apple.com/gb/app/lego-duplo-world/id1458749093)) |

### What works, what failed, and the gaps nobody fills

**Cheap yearly memberships tied to something people already buy work.** Moonpig Plus grew **36% to one million members** at £10.99 a year. Moonpig says its subscription members help drive "over 90% of our revenue from existing customers", with "strong renewal behaviour". Its active customers buy about **2.95 times a year** ([Moonpig Group H1 FY26](https://www.moonpig.group/media/z24pxi24/moonpig-group-plc-fy26-half-year-results-presentation-script-final.pdf)). The fee itself is small (about £11m a year by our own sum). The value is that members buy more often.

That is the catch for us. Our planning assumption is **1.2–1.3 orders per customer in year one** (`reports/UK marketing costs reality check.md`). A Moonpig-style club has much less to multiply until people buy from us more often.

**Low-price automatic print and book subscriptions keep closing:**

- **Groovebook** ($2.99 a month for a monthly photo book) closed in April 2022, eight years after Shutterfly bought it ([TechCrunch](https://techcrunch.com/?p=1084104)).
- **Google's** monthly print subscription closed after **four months** in 2020 before relaunching ([SlashGear](https://www.slashgear.com/google-photos-printing-subscription-is-closing-after-just-four-months-19625517)).
- **Lifecake**, a London family-photo app owned by Canon, shut "with little warning". Users were moved to BackThen with reported refund failures ([BackThen App Store](https://apps.apple.com/gb/app/id1505173822)).
- **toucanBox**, the best-known UK kids' craft box, appears to have stopped after May 2025 **despite a 4.6 Trustpilot score** ([Trustpilot](https://uk.trustpilot.com/review/toucanbox.com)).

Monthly physical subscriptions lose roughly **10% of subscribers a month**, against ~7% for digital. These Recurly figures were seen only in search snippets, so treat them with care ([Recurly](https://recurly.com/research/benchmarks-for-subscription-ecommerce); [eightx](https://eightx.co/blog/dtc-subscription-churn-index-2026)). At that rate a cohort is about 70% gone within a year. McKinsey found nearly 40% of e-commerce subscribers had already cancelled ([McKinsey](https://www.mckinsey.com/industries/retail/our-insights/thinking-inside-the-subscription-box-new-research-on-ecommerce-consumers)).

**Turning something free into something paid causes the worst backlash.** Artkive's 2017 move to compulsory membership produced "holding my kids art hostage" reviews and a bulk-download fee it had to drop ([App Store reviews](https://apps.apple.com/us/app/artkive-save-kids-art/id549980508?see-all=reviews&platform=iphone)). Shutterfly's 2023 storage limits caused press stories and a deadline extension ([NBC Boston](https://www.nbcconnecticut.com/news/national-international/shutterfly-extends-access-to-photos-after-shocked-user-reaches-out-to-nbc10-boston/3018214/)). Amazon ended unlimited storage in 2016 ([Imaging Resource](https://old.imaging-resource.com/news/2016/09/24/less-photo-storage-more-prints-amazon-kills-unlimited-photos-plan)).

**Storage subscriptions earn little.** Tinybeans, the only listed company in this space, made **US$3.32m** of subscription revenue in FY25 ([ASX announcement](https://announcements.asx.com.au/asxpdf/20250821/pdf/06n4h84f2x4yl9.pdf)), from roughly 90–95k paid subscribers ([StockAnalysis](https://stockanalysis.com/quote/asx/TNY/transcripts/)). That works out at about **US$35–37 per subscriber per year**, half its list price. This is our inference from secondary figures. Storage is a thin line of revenue in this category, even for the leader.

**Gift buyers want prepaid and no renewal.** On Cratejoy, **59% of holiday gift sales were prepaid**, and only **25% of givers wanted the gift to renew** ([Cratejoy](https://sell.cratejoy.com/?p=104230)). Christmas Eve is the busiest day of the year there ([Cratejoy Gifting 3.0](https://sell.cratejoy.com/blog/cratejoy-product-update-gifting-3-0/)). Gift subscriptions spike on 24 and 25 December ([PYMNTS](https://www.pymnts.com/?p=1644277)). Yearly plans keep far more people than monthly ones: about **28% versus 11% after a year** in RevenueCat's app data ([RevenueCat](https://revenuecat.com/blog/growth/one-year-retention-rates-insights/)).

**UK parents' own habit is to choose a few favourites.** Mumsnet threads describe photographing art, recycling it, keeping "a top-10 a year" and perhaps making a photo book ([Mumsnet](https://www.mumsnet.com/talk/_chat/4370848-What-do-you-do-with-your-kids-school-artwork)). A plan built around *choosing* a few drawings fits that better than "store everything".

**Gaps nobody fills, based on what this research found:**

- No grandparent-bought membership that sends **physical keepsakes made from the grandchild's own art**. The gifts that do exist are digital (23snaps, Tinybeans, Sago) or flowers.
- No **parent-approved "year in drawings" book** made from the year's kept art. Notabli auto-prints photo books in the US only.
- No **seasonal post of magnets or cards from this season's drawings**.
- No art archive that is **UK-held, free and promised never to be held hostage**.
- No UK kids' art service sells a membership at all. The UK art-book makers are all one-off.

## Five plans, worked out, and a verdict on storage

*How the margins are worked out (same convention as the shop's private margin sheet):*

- Price ÷ 1.2 (VAT), minus Prodigi's product and post (with the Prodigi Pro discount, written here only as ranges), minus Stripe.
- Then "allowances": 3% for reprints, 55p running cost per Prodigi order (the figure in `src/pricing/multibuy.ts`), and 50p for a branded A6 note where the lab accepts one (Prodigi Pro's public insert price, [Prodigi](https://www.prodigi.com/branded-packaging-inserts/)).
- Stripe charges **1.5% + 20p** on UK cards. **Stripe Billing adds 0.7%** on anything that recurs. A one-off prepaid payment pays no Billing fee ([Stripe UK pricing](https://stripe.com/gb/pricing)).

*VAT note:* if Snickerdoodle is **not VAT-registered** (taxable turnover under the **£90,000** threshold, [gov.uk](https://www.gov.uk/how-vat-works/vat-thresholds)), you keep the whole price but can't reclaim the VAT on Prodigi's bill. For every plan here that leaves a few pounds *more* than the figures shown. Either way, Stripe Tax isn't needed. Check which applies with your accountant.

*If the Prodigi account is not on Pro* (the plan is about £30–40 a month), product costs are about 15% higher. The gift below would then keep about £3–4 less.

### Plan 1 — "a year of little drawings": the grandparent gift (recommended first)

**Price:** £55, paid once, post included, **never renews**. Sold as a gift certificate that is emailed and printable, so it can be bought up to 24 December and handed over on Christmas Day.

**What's in it:**

- **Three seasonal drops** (spring, summer and autumn). Each time the parent picks drawings and chooses between **four fridge magnets** and **five cards**.
- One drop can be timed for the child's birthday month if the parent has added a birthday.
- In **November**, a **calendar for the next year made from twelve of the year's drawings**.
- The Keepsake Home stays free, as it is for everyone.

**Who does what:**

- The grandparent buys as a guest, with no account wall, and chooses whose letterbox the post goes to: their own (the default, because "granny's fridge" is the point) or the family's.
- The parent redeems the certificate with a free account and picks the child (first name only).
- Before anything ships, the parent sees: "these four drawings will go to Granny Sue's letterbox". Each drop is a share the parent starts, and it is logged as one.
- The grandparent gets **no new visibility** in the Keepsake Home. They get post.

**Is it good value?** Bought one at a time, the same things cost about **£58**: three £12 packs (or a magnet set at about the same shelf price) plus a £22 calendar. So £55 is an honest bundle, not a deep discount, in line with D24. The real value is a gift that keeps arriving, with a certificate to unwrap.

Compare: 23snaps charges **£52.99 for a digital-only year**. Bloom & Wild flowers cost **£22 a box**. A Skylight frame plan costs **£29 a year**.

**Fulfilment:**

| Item | Route | Cost and risks |
|---|---|---|
| Card drop | CLASSIC-GRE-FEDR-7X5-BLA ×5 in one order, using the live card-pack code path (lab uk7, flat untracked letter post) | Prodigi landed cost **£5–6** |
| Magnet drop | MAG-4-10X10, four drawings, made in Great Britain, untracked Royal Mail 24 | **New SKU**, quoted in the sandbox only, so it needs a sample and wiring. Landed **£5–6** |
| Calendar | 2028 dated A5 calendar (CALENDAR-A5-L-DATED, when Prodigi lists the 2028 version) or CALENDAR-A5-L-UNDATED with our own dates | Landed **£11–13**. Tracked; no Express. The undated route needs a full-PDF template build |

**Margin, with the working:**

| Line | Amount |
|---|---|
| Price | £55.00 |
| Price before VAT | £45.83 |
| Stripe, one-off (1.5% × £55 + 20p) | about £1.03 |
| Prodigi, 3 drops at £5–6 plus a calendar at £11–13 | **£27–31** |
| **Profit before allowances** | **£14–18 (30–39%); about £15–16 at today's quoted costs** |
| Reprints at 3% | about £1.40 |
| Running cost, 4 orders × 55p | £2.20 |
| Branded notes, up to 4 × 50p | up to £2 |
| **Profit after allowances** | **£8–12 across the cost range; about £10–11 per gift (21–23%) at today's quoted costs, so about 80–90p per family per month** |

For comparison, a typical £35 order keeps about £5 (`reports/UK marketing costs reality check.md`).

**If a partner code applies:** under today's rule a partner gets 10% of the order before VAT. On this gift that is about £4.60, nearly half the profit. **Decide now: either no codes or commission on the gift, or a flat £2 to the partner.**

**Cancelling and churn:**

- There is **no churn**, because it is prepaid.
- **Risk 1: the parent never redeems.** Promise "if it hasn't started within 12 months, we refund the giver in full".
- **Risk 2: the parent misses a pick.** Send a warm reminder; the drop waits rather than being skipped. Nothing is ever picked *for* the parent, because choosing for them from the child's drawings is exactly what we must not automate.
- **Risk 3: untracked post goes missing.** The 3% reprint allowance covers it.
- **Refund promise, more generous than the law:** a full refund any time before the first drop's drawings are picked. After that, a refund for drops not yet made.

**What it takes to build:**

| Part | What it involves |
|---|---|
| Payment | **One-off Stripe Checkout**, the current `mode: 'payment'`, reusing the gift fields we already store (`gift_from_name`, `gift_note`). No Billing. |
| New tables | `plans` (key, price, term, drop schedule); `plan_purchases` (giver email and name, note, ship-to choice and address snapshot, Stripe session, a hashed unguessable redeem code, redeemed family / account / child, status PAID / REDEEMED / ACTIVE / COMPLETE / REFUNDED, refund-by date); `plan_entitlements` (one row per drop: kind, window opens, pick deadline, status WAITING / PICKED / ORDERED / SHIPPED / REFUNDED, linked order id); `plan_notices` (every email sent, kept as evidence) |
| Scheduling | A daily job turns PICKED entitlements into ordinary zero-price `orders`, using the existing Prodigi submit path with an idempotency key. Prodigi has no recurring-order feature of its own ([fulfilment notes](https://www.prodigi.com/print-api/docs/reference)). |
| Screens | Gift product page; certificate on the thank-you page; `/gift/redeem` (sign in, choose the child, accept); a "your gift from …" card in the Keepsake Home with the drop timeline; a drop picker reusing the card-pack picker; an admin list of gifts and drops due |
| Emails (Resend) | Receipt and certificate to the giver; an optional "send it on Christmas morning" email to the parent; pick reminders to the parent (service messages); "on its way"; a final "that's the year" note to the giver, where "give it again" is a fresh purchase, never a renewal |
| Tests | Pricing (server-side price, no code stacking); authz (only the child's controlling parent can redeem and pick, and can pick only keepsakes they can see); the redeem code can't be guessed or used twice; content-safety gate still applies before print; surname refused in the first-name field |
| **Effort** | **About 5 days to sell it** (page, payment, certificate, redeem, tests). **About 5–7 more days in January** for the picker, scheduler, magnet SKU and the 2028 calendar route. **About 10–12 days in all.** |

### Plan 2 — "the year in drawings": a book of the year, approved by the parent

**Price:** £32 for an A5 or 21 cm square hardcover of 24 pages, paid once when the parent approves the proof. An optional "reserve your 2027 book" can be prepaid. Neither renews.

**How it works:**

- Through the year the parent hearts drawings onto a "this year's book" shelf, using the existing keep and heart.
- At the end of the school year or in November, we lay those picks out in date order.
- **The parent edits and approves.** Nothing prints without that.
- No automated "best of" picking from the child's art, which would come close to profiling.

**Fulfilment:** BOOK-FE-A5-P-HARD-G or BOOK-FE-8_3-SQ-HARD-G, made in Great Britain, tracked. Prodigi landed cost is **£13–15 before page costs**. The price sheet has no per-page price, and its postage is labelled in EUR, so get a sandbox quote at 24 and 28 pages first.

**Margin:** £32 ÷ 1.2 = £26.67. Minus Stripe (about 70p), minus £13–15, gives **about £11–13 before page costs**. Minus allowances (reprints plus running, about £1.35) gives **about £10–11 before page costs**. The real figure depends on the quote.

**Build:** The blocker is the **multi-page file renderer**. Building it also unpauses the storybook. That is about 4–6 days, plus 2–3 days for the shelf and approval screen. **About 7–9 days.**

**Risks:** Page cost is unknown. Production takes 96–120 hours, so it needs early cut-off dates.

**Not done by competitors in the UK.**

### Plan 3 — "birthday keepsake": an opt-in reminder, not a subscription

**What it is:** a free, opt-in feature built on the existing optional birthday and the REMINDERS-consent engine. About four weeks before the birthday, the parent gets: "make Ava's birthday keepsake?". They pick drawings and a product (a card pack for party thank-yous, a birthday-to-birthday calendar on the undated SKU, magnets, or later the book). Then they approve and pay once.

**Pricing and margin:** normal shop prices and normal margins (a card pack is about 39–41% before allowances). **No billing, no DMCC.**

**Rules it must follow:**

- The birthday prompt is a new use of the birthday, so it needs a **DPIA addendum note**.
- It must sit inside the parent's REMINDERS consent (PECR).
- It never shows the birth year.
- It never touches the Draw app (D29).

**Build:** about 2–3 days. It also gives Plan 1's "birthday drop" its timing.

### Plan 4 — "the keepsake club": a Moonpig-style yearly membership (later, not now)

**Price:** £12 a year (that's £1 a month), renews every year, cancel in one tap. **Storage stays free for everyone.** The club adds perks; it never gates the Keepsake Home.

**What's in it:**

- 20% off cards and card packs (where our margin is highest).
- A free card on each child's birthday and one at Christmas, tucked into any order or posted on its own.
- An early proof of next year's calendar in October.
- No discount on other products: their margins (27–42% before allowances) can't carry one.

**Margin, with the working:**

| Line | Amount |
|---|---|
| Fee before VAT | £10 |
| Stripe plus Billing (18p + 20p + 8p) | about 46p |
| Two free cards: about £1 each if tucked into a paid order, or £1.50–2 each plus running cost if posted alone | £2–5 |
| **Left from the fee** | **about £4.50–7.50 a year (40–65p a month)** |

The 20% off costs us about £2 per discounted 5-pack. So the club only pays if members buy **one or two more card packs a year** than they would anyway. That is Moonpig's whole case, and Moonpig's customers already buy almost three times a year.

**Rules:** it renews automatically, so from **1 January 2027** it falls fully under the DMCC subscription rules (see below).

**Build:**

- Stripe Billing, Customer objects and new webhooks (`invoice.upcoming`, `invoice.paid`, `customer.subscription.*`).
- Our own Resend notices: reminders, a separate cooling-off email, and an end confirmation within 24 hours.
- An account "stop my membership" button.
- A member-price rule in the pricing module, with tests.
- **About 8–10 days.**

**Risks:** "charged again" complaints (Moonpig has them), low order frequency, and partner commission on every renewal under today's PTA rule.

**Revisit when there are a few hundred repeat card buyers.**

### Plan 5 — "this month's masterpiece": a monthly letterbox drop (not recommended)

**Price:** £6.99 a month, rolling, for two cards from this month's drawings in one envelope.

**Margin, with the working:**

| Line | Amount |
|---|---|
| Price before VAT | £5.83 |
| Prodigi, two cards (uk7 letter post) | £2.50–3 |
| Stripe plus Billing | about 35p |
| Running cost | 55p |
| Branded note | 50p |
| Reprints | about 17p |
| **Profit** | **about £1.50 a month (about 26%)** |

At about 10% churn a month, the average subscriber lasts around 10 months. That is **roughly £15 per subscriber over their whole time with us**.

A magnet version doesn't work at a sensible price. Four magnets cost £5–6 landed, which leaves nothing at £8.99.

**Why not:** the parent has to pick every month, skipped months create support work, and DMCC applies. The category's track record is poor (toucanBox, Groovebook, Google). Also, **Prodigi has no sticker sheet** (single kiss-cut stickers only, [Prodigi](https://www.prodigi.com/products/stickers/kiss-cut-stickers/)) and **no sticky-note pad** ([Prodigi stationery](https://www.prodigi.com/products/cards-and-stationery/)). The alternatives are weak:

- Printful's 5-design sticker sheet may be printed in the US or Australia, which goes against our UK/EU-first rule for children's images.
- Sticker it (Bristol) has an API, but its sheet formats aren't public ([Sticker it](https://stickerit.co/pages/api)).
- No UK print-on-demand service does personalised sticky notes.

The "monthly pad" idea would mean a trade printer and stock, not print-on-demand.

### Verdict on a storage tier: don't charge, promise instead

A "Keepsake Home plus" at £2–3 a month would compete with iCloud's £0.99 for 50 GB. It would need us to **invent a cap that doesn't exist**. It would break five pieces of live copy. And it would bring back the Artkive and Shutterfly backlash. All that for a cost that our own estimate puts at pennies per image, mostly screening rather than storage.

**Instead, add one line to the family promise:** "your keepsake home is free. nothing you've kept will ever be locked, deleted or charged for because of a plan — and you can download all of it, any time, in one tap." **No competitor found makes that promise.** Tinybeans comes closest, but it charges for bulk export and deletes after 12 months of inactivity.

### The five plans side by side

| Plan | Price | Renews? | Profit per member (after allowances) | Build | DMCC? | Competitors do it? |
|---|---|---|---|---|---|---|
| **a year of little drawings** | £55 once | no | ~£10–11 a year | ~5 days to sell, ~10–12 in all | no | **no** |
| the year in drawings | £32 once | no | ~£10–11 before page costs | ~7–9 days | no | **no** (UK) |
| birthday keepsake | shop prices | no | normal product margin | ~2–3 days | no | **no** (from own art) |
| the keepsake club | £12 a year | yes | ~£4.50–7.50 a year before the discount cost | ~8–10 days | **yes** | yes (Moonpig, thortful) |
| this month's masterpiece | £6.99 a month | yes | ~£1.50 a month; ~£15 over a subscriber's lifetime | ~8–10 days | **yes** | yes (boxes) |
| storage tier | — | — | — | — | yes | yes; **don't** |

## Launch the gift by 3 December, then read the numbers on 4 January

**The recommendation is Plan 1, "a year of little drawings", on sale by Thursday 3 December** (Monday 7 December at the latest). Physical keepsakes stop at the last posting dates of **10 December for cards and 11 December for calendars and magnets** (`src/lib/season.ts`). From then on, the certificate becomes the only thing we sell that still "arrives" in time. That makes it the natural hero for the last fortnight, right up to Christmas Eve.

**What to test, with pass marks agreed before launch:**

| Hypothesis | Measure | Pass | Fail, and what to do |
|---|---|---|---|
| Christmas shoppers will buy it | gifts sold 3–24 Dec, and the share of orders that include one | **≥15 gifts and ≥5% of orders** | under 5 gifts: stop selling after Christmas, deliver what was sold, build nothing more |
| Grandparents arriving through gift links are the buyers | share of gifts bought by people who came via a gift link or are EXTENDED members | ≥40% | if lower, the audience is parents buying for themselves, so rethink the "granny's fridge" wording |
| Parents accept it | redeemed within 30 days (by 25 January) | **≥70%** | under 50%: improve the certificate and the Christmas-morning email |
| It brings new families | redeeming parents who had no account before | ≥30% | — |
| Parents will pick | first-drop drawings picked by the deadline (late February) | ≥80% | under 60%: make the pick a single tap from the email |
| It doesn't confuse or upset | refund requests; privacy worries ("who sees what?") | **≤5% refunds; zero privacy complaints** | any privacy complaint: stop and review the wording |
| It leads to more orders | redeeming families who place their own paid order within 90 days | ≥10% | — |

If the gift passes on 4 January, keep it on sale all year. Mothering Sunday and grandparents' birthdays are the next moments. Build Plan 3 next (it feeds the birthday drop), then Plan 2 when the book renderer is done. Leave the club until 2027 brings repeat buyers.

**Four weeks, starting Friday 27 November:**

| Week | Your turn (Simon) | I'll do (Claude build sessions) |
|---|---|---|
| **1: Fri 27 Nov – Thu 3 Dec** | Approve the name, the £55 price and the contents (3 drops, magnets or cards, then the calendar). Decide the partner-code rule (no commission, or a flat £2). Search MAG-4-10X10 in the Prodigi dashboard and order one sample: [dashboard.prodigi.com](https://dashboard.prodigi.com). Check the account is on Prodigi Pro. Ask your accountant about VAT registration. Approve the refund promise and the "never held hostage" line. Review on your phone and say go. | Build the gift on a branch: the `plans`, `plan_purchases`, `plan_entitlements` and `plan_notices` tables; a one-off Checkout line; the product page in scrapbook style; a printable certificate (reusing the gift-note renderer); receipt and certificate emails via Resend; a terms section; pricing, authz and code tests; mobile and desktop visual checks. |
| **2: Fri 4 – Thu 10 Dec** | Go live. Email past buyers who opted in to marketing. Post on socials. Tell partner schools and creators. Answer questions. | Build `/gift/redeem` (sign in, choose the child, accept); the "your gift from …" card in the Keepsake Home; the optional Christmas-morning email to the parent; an admin list; add gift numbers to /admin/week. Fix anything found. |
| **3: Fri 11 – Thu 17 Dec** | After 11 Dec, make the gift the homepage hero ("still in time: a year of little drawings"). Keep it warm: no countdowns. | Add one small, tasteful mention on gift-link pages and order thank-you pages, which is where grandparents already are. Check certificate emails arrive reliably. Fix bugs. |
| **4: Fri 18 – Thu 24 Dec** | Final push on 21–24 Dec. Read the numbers on Christmas Eve. | Watch purchases and email delivery, queue the Christmas-morning sends, and write the January build list: drop picker, scheduler, magnet SKU, 2028 calendar route, pick-reminder emails. |
| **After: January – February** | Approve the magnet sample. Choose the first-drop pick window (1–21 February). | Build the picker and scheduler. Wire MAG-4-10X10. Test the first drop in the sandbox. The first drops ship in March. |

## UK rules: the prepaid gift avoids the new subscription law

**The DMCC Act 2024, Part 4 Chapter 2 (the new subscription rules), is not in force today.** It applies to subscription contracts **entered into on or after 1 January 2027**. The Prime Minister brought it forward from spring 2027 on 9 August 2026 ([gov.uk](https://www.gov.uk/government/news/pm-starts-roll-out-of-everyday-fixes-on-the-cost-of-living-ending-rip-off-discounts-and-subscription-traps); [DBT draft guidance](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)). The regulations were laid on 19 or 20 October 2026 for approval by both Houses. **Whether they have been approved is unconfirmed as of 26 November** ([legislation.gov.uk draft SI](https://www.legislation.gov.uk/ukdsi/2026/9780348287912)). Check before any renewing plan goes live.

The rules only catch contracts that **renew and charge automatically unless the customer acts**. A prepaid term that simply ends is outside them. The draft says nothing specific about gifts. The CMA can fine up to £300,000 or 10% of turnover, whichever is higher.

**How each rule applies to each plan:**

| Rule | Gift (Plan 1) | Book / birthday (Plans 2–3) | Club / monthly (Plans 4–5) |
|---|---|---|---|
| DMCC subscription regime | **Out of scope** (no renewal). "Give it again" must be a fresh purchase | out of scope (one-off) | **In scope** from 1 Jan 2027 |
| Key information shown in the purchase journey, without clicking a link | good practice | — | required: that it carries on and you keep paying; the price; the monthly equivalent ("£12 a year — £1 a month"); the least you'll pay; how to stop; **when we'll remind you**; a cooling-off summary |
| Reminders before renewal | — | — | yearly plans: before **every** renewal, plus an **extra earlier reminder** for 12-month renewals. Monthly plans: about once every 6 months. Sent by email (a "durable medium"), with the required information more prominent than any marketing |
| Separate cooling-off notice | — | — | the day a renewal onto 12 months is paid: **its own email, with nothing else in it** |
| Online exit | refund on request | — | a one-tap "stop" button. **An email address alone doesn't count.** Feedback optional; no offer that slows the exit |
| End confirmation | — | — | **within 24 hours** of cancelling online, stating the end date |
| Consumer Contracts Regulations, personalised goods | prints of a child's drawing are exempt from the 14-day return right once made ([CCR reg 28](https://www.legislation.gov.uk/uksi/2013/3134/regulation/28)). We offer more: a refund before the first pick | same | DMCC narrows cooling-off for bespoke goods to 14 days from sign-up, but only if we say so clearly in the information |
| Drip pricing, CMA209 | headline price **includes delivery**. **We already do this** ([CMA209](https://assets.publishing.service.gov.uk/media/691b10065a253e2c40d705d9/Price_transparency_-_CMA209_.pdf)) | same | same |
| ASA "free" rules | don't call anything a "free trial" | — | **no free trial at launch.** Any "free card" claim shows its conditions right beside it ([ASA](https://www.asa.org.uk/advice-online/promotional-marketing-subscription-traps.html)) |
| Children's Code | **sold to an adult only.** The parent picks the drawings. No profiling; no nudges ([ICO standard 13](https://ico.org.uk/for-organisations/guide-to-data-protection/ico-codes-of-practice/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques)) | birthday prompts need REMINDERS consent and a DPIA note | same, and never shown to a child |

**Stripe's own emails don't meet the DMCC rules.** Its renewal reminder doesn't show the previous payment, the least you'll pay or the deadline. Its trial reminder is fixed at 7 days. It sends no separate cooling-off notice, and it doesn't promise a 24-hour end confirmation ([Stripe customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)). For any renewing plan, **we send our own notices through Resend**, triggered by Stripe webhooks, and log each one.

Avoid Stripe "subscription schedules" on consumer plans: they block cancelling in the customer portal ([Stripe portal](https://docs.stripe.com/customer-management)).

**Compliance checklist:**

| # | Check | Gift | Club / monthly |
|---|---|:-:|:-:|
| 1 | Headline price includes post ("£55, post included") | ✓ | ✓ |
| 2 | Terms say plainly: prepaid, ends after 12 months, never renews | ✓ | — |
| 3 | Refund rule shown before payment (full refund before the first pick, then for drops not yet made) | ✓ | — |
| 4 | Bespoke-goods statement in the key information and the full terms | ✓ | ✓ |
| 5 | Key information inline, with the monthly equivalent and the least you'll pay | — | ✓ |
| 6 | Final button names the payment ("start my membership — pay £12 a year") | — | ✓ |
| 7 | Full information emailed after sign-up, before anything is sent | ✓ (receipt) | ✓ |
| 8 | Reminder window stated, and our own Resend reminders sent within it | — | ✓ |
| 9 | Separate cooling-off email after each 12-month renewal | — | ✓ |
| 10 | One-tap online stop; emailed end confirmation within 24 h | refund route | ✓ |
| 11 | Notices logged (type, time, recipient, message id); a snapshot of what was shown at sign-up | ✓ | ✓ |
| 12 | No countdowns, scarcity or "your child would love…" wording; nothing in the Draw app | ✓ | ✓ |
| 13 | Child's first name only, screened by the word list; surnames refused | ✓ | ✓ |
| 14 | Before 1 Jan 2027: confirm the regulations were approved, and have a solicitor check the bespoke-goods wording | — | ✓ |

## Trust rules that bind every plan

Every plan here sits under the non-negotiables in `CLAUDE.md`. Seven rules apply to subscriptions in particular:

1. **No profiling of children and no behavioural ads.** The family's celebrations data stays "never used for marketing or segmentation" (`src/db/schema.ts`). No plan picks drawings *for* a parent by analysing a child's art. Date order and the parent's own hearts are the only sorting.
2. **Nothing is public,** and a gift never widens anyone's circle. The grandparent who pays gets post, not visibility. The parent is still the controller: they accept the gift, choose each drawing, see where it is going, and the share is logged.
3. **Magic edits stay magic edits.** No plan copy mentions "AI".
4. **Leaving is as easy as joining.** One tap, an emailed confirmation, and clear reminders before any renewal.
5. **No dark patterns.** No pre-ticked boxes, no countdown timers, no free-trial traps, no surprise renewals.
6. **Nothing is sold in the Draw app,** in line with our own rules and Apple's.
7. **Data is never held hostage.** What a family has kept stays theirs, free, and downloadable in one tap, whatever happens to any plan. If Snickerdoodle ever closes, families get warning and a full download before anything is deleted.

That last promise is the cheapest one to make, and it is the one Lifecake's and Artkive's customers wish they had been given.

## Conclusion

The research points to one clear lesson. In this category the person who pays for a subscription is the grandparent, not the parent, and the thing they want is post, not storage. Parents can already store photos cheaply. What they lack is an easy way to send the grandparents a little of the child's growing-up. What grandparents lack is a way in that doesn't need an app or an account. Our privacy design deliberately keeps grandparents out of new keepsakes by default. Here that becomes a strength: the gift gives them the one thing the app won't, physical drawings the parent chose for them.

The second lesson is timing. Storage subscriptions earn the leader only about US$35 per subscriber per year. Monthly boxes lose most of their customers within a year. So a subscription's real job for Snickerdoodle is not income on its own. Its job is to turn one Christmas purchase into four reasons to come back, and one grandparent into one new family account. A prepaid gift does both without new payment systems or the new subscription rules, and it can be on sale before the last posting date.

Build the renewing club later, once 2027's repeat buyers show us that people will buy from us often enough for a membership to multiply.
