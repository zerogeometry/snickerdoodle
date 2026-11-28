# Snickerdoodle's own product as built today (26 Nov 2026), for the subscriptions report

Scope: a read of the website repo (worktree `claude/subscriptions-research-cc7821`, based on `feat/christmas-season`,
HEAD 93e9819), the two Snickerdoodle Draw repos, the unmerged report branches `docs/product-margins` and
`docs/sourcing-costs`, the uncommitted reports in the main checkout's `reports/`, side-session notes, and the private
`.prodigi-assets/` cost sheets. Sources are repo file paths with line numbers (paths are relative to the repo root
unless marked). **No exact Prodigi cost is written here**: costs appear only as ranges or gross-margin %. The exact
figures for subscription-relevant items are in the private, gitignored file `.prodigi-assets/SUBSCRIPTIONS-COSTS-2026-11-26.md`.

Margin % below = "profit % of ex-VAT price" as defined in the private margins sheet: price ÷ 1.2, minus Prodigi
product (with Prodigi Pro), minus first-item post, minus Stripe 1.5% + 20p. It leaves out reprints, codes, running
costs and marketing. "After allowances" figures (3% reprints, 5% code allowance, 55p running) are lower.

---

## 1. Keepsake Home storage: what, where, and is there a cap?

### Takeaway
**No. There is no cap** on the number of keepsakes, total storage bytes, children per family or members per family.
The only limits are per-file size (25 MB web, 20 MB from the app), hourly upload rate limits (120 an hour per
signed-in account), and a monthly budget on the self-hosted magic edits. Kept keepsakes are stored indefinitely,
until the parent deletes them. Unkept uploads are deleted 30 days after upload, or 30 days after fulfilment.

### Cited Findings
- **What is stored.** Each `assets` row is one drawing or photo (`DRAWING`/`PHOTO`). Its bytes are `storage_objects`
  rows of class `ORIGINAL` (exactly one, write-once), `DERIVATIVE` or `CREATION_LAYER`, each with `byte_size` and
  `sha256` — [src/db/schema.ts:54-59, 336-366](src/db/schema.ts). Keys: `assets/{id}/original` and
  `assets/{id}/derivatives/{kind}` — [src/storage/objects.ts:34-55](src/storage/objects.ts). Derivative kinds in use
  include `design` (the Studio's non-destructive render), `cutout` (background removal), `trimmed`, `printfile`,
  `picker-thumb`, `look-thumb-*` and mockup renders (grep of `derivativeKey(` across `src/`;
  [src/server/keepsakeThumbs.ts:29](src/server/keepsakeThumbs.ts)). The Studio's edit "recipe" lives as JSON on the
  asset (`studio_doc`) and the original is never changed — [src/db/schema.ts:310-312](src/db/schema.ts).
- **Where.** A private S3 bucket, region defaulting to `eu-west-2` (London) —
  [src/storage/client.ts:20](src/storage/client.ts); originals are encrypted with their own KMS key, everything else
  with a general key — [src/storage/objects.ts:71-81](src/storage/objects.ts). D2 / D18: "S3 eu-west-2, private +
  SSE-KMS, separate originals key"; hosting is Lightsail London — [project-office/DECISIONS.md:12-13](project-office/DECISIONS.md).
  Bucket lifecycle: deleted versions gone in 7 days, unchecked quarantine uploads in 1 day — [infra/s3-lifecycle.json](infra/s3-lifecycle.json).
- **Limits that exist (none is a storage cap):**
  - File size: 25 MB per web upload — [src/storage/quarantine.ts:16](src/storage/quarantine.ts),
    [src/app/actions/keep.ts:29](src/app/actions/keep.ts); 20 MB per Draw-app upload — [src/server/app/api.ts:170](src/server/app/api.ts);
    15 MB profile image — [src/server/profile.ts:22](src/server/profile.ts); 50 MP decode guard — [src/storage/exif.ts:33](src/storage/exif.ts).
  - Upload rate: 120 an hour per signed-in account ("keep"), 60 an hour per IP for guests — [src/server/rateLimit.ts:131-132](src/server/rateLimit.ts),
    used at [src/app/actions/keep.ts:25](src/app/actions/keep.ts). The table is described as "generous for real families" — [rateLimit.ts:120](src/server/rateLimit.ts).
  - Guest (no account) uploads: the browser cookie holds the newest 140 upload claims ("140 uploads in 30 days without signing in") — [src/server/uploadClaims.ts:33-38](src/server/uploadClaims.ts).
  - Invites: 20 an hour per account; gift links 30 an hour — [rateLimit.ts:138-139](src/server/rateLimit.ts). Up to 20 gift recipients at once — [src/server/giftLinks.ts:800](src/server/giftLinks.ts).
  - Magic-edit budget (self-hosted background removal / upscale): 20 per creation and 500 per account per 30 days,
    env-tunable — [src/server/magic.ts:12-28](src/server/magic.ts).
  - Studio: 120 objects, 200-character text per design — [src/lib/studio-objects.ts:106-107](src/lib/studio-objects.ts).
  - **No count limit** anywhere on keepsakes, children (`createChild` checks owner/surname/birthday only —
    [src/server/children.ts:53-79](src/server/children.ts)) or members (`createInvite` checks owner, relationship,
    circle and duplicate email only — [src/server/invites.ts:88-117](src/server/invites.ts)). Grep for
    `MAX_|quota|limit|cap` across `src/server`, `src/lib`, `src/app`, `src/db/schema.ts` found nothing else.
- **Retention.** Constant `RETENTION_DAYS = 30` — [src/server/retention.ts:41](src/server/retention.ts). At upload a
  kept asset gets `purgeAfter = null`; an unkept one gets now + 30 days — [src/server/ingest.ts:114-129](src/server/ingest.ts).
  On fulfilment an unkept source is stamped `fulfilledAt` and its purge moved to now + 30 days (the reprint window) —
  [retention.ts:136-151](src/server/retention.ts). Assets still needed by a PAID/FULFILLING order are never purged
  — [retention.ts:8-11, 67-80](src/server/retention.ts). "A kept keepsake (keptInHome=true, purgeAfter=null) is never
  touched — Postgres is the source of truth for 'kept'" — [retention.ts:56-57](src/server/retention.ts).
- **What "kept" means:** `assets.kept_in_home = true` — [src/db/schema.ts:304-305](src/db/schema.ts); set by keeping
  from the keepsake box / "+ keepsake" / heart — [src/server/keepsakes.ts:92](src/server/keepsakes.ts),
  [src/server/keepChoice.ts:59](src/server/keepChoice.ts). A parent can decline keeping a purchased drawing
  (`keep_declined_at`), which then follows the order's 30-day window — [schema.ts:306-309](src/db/schema.ts).
  Draw-app uploads arrive kept — [project-office/briefs/DRAW-APP-LINK-website-side.md](project-office/briefs/DRAW-APP-LINK-website-side.md) ("FAMILY visibility, kept").
- Trust copy says the same: "Kept assets persist until the controller deletes them" —
  [docs/05-trust-data-and-compliance-requirements.md:24-28](docs/05-trust-data-and-compliance-requirements.md);
  FAQ "How long does Snickerdoodle keep my child's pictures?" — [src/lib/faq.ts:320-321](src/lib/faq.ts).
- Running-cost assumption in pricing code: £0.55 per order covers "hosting, email, storage…" —
  [src/pricing/multibuy.ts:36-37](src/pricing/multibuy.ts); the internal fact sheet gives ~£100/month over ~200
  orders, "~5p of per-image moderation and storage" (estimate) — `C:/Users/Simon/dev/Snickerdoodle/reports/investor-deck/00-internal-fact-sheet.md:413`.

### Inferences
- A paid storage tier would have to **introduce** a limit that does not exist today; every family that already
  keeps drawings has unlimited, free storage in practice.
- The real marginal cost per keepsake is small (one original up to 25 MB plus a few derivatives, S3 London); the
  costlier per-image item is the Rekognition screening on upload, not storage.

### Gaps
- No measured storage per family or per keepsake (no bucket metrics in the repo). The "~5p per image" is an estimate.

---

## 2. Live products and prices

### Takeaway
About 30 products are on show, priced £5.50 (one card) to £279 (Christmas bundle for 8), all VAT-inclusive with **free
UK delivery baked into every price** (no shipping line, no free-delivery threshold). We already sell cards, card
packs (5 / 10), a 2027 calendar (A5 / A4), framed prints, multi-photo frames, jigsaws and playing cards. We do
**not** sell stickers, postcards, photo books (the storybook is paused), notebooks or unframed small prints.

### Cited Findings
- Server-trusted price list; delivery `DELIVERY_PENCE = 0` ("tracked shipping cost is baked into each product's
  retail price, founder-approved 2026-07-01") — [src/pricing/catalogue.ts:11-13](src/pricing/catalogue.ts). Per-variant
  prices + Prodigi SKUs live in [src/server/catalogue.ts:82-735](src/server/catalogue.ts); `visibleInShop` decides
  what shows, `paused` = not on sale — [catalogue.ts:64-72](src/server/catalogue.ts).
- **On show (visibleInShop: true)**, price, Prodigi SKU (line refs in `src/server/catalogue.ts`):

| Product | Variants · price | Prodigi SKU | Ref |
|---|---|---|---|
| Framed print | 11×14″ £65 · 12×16″ £70 · 18×24″ £90 · 24×32″ £105; 8 frame colours (gold default) | GLOBAL-CFP-11X14 / 12X16 / 18X24 / 24X32 | 82-96, 375 |
| Mug 11oz two-tone | 7 colours · £18 | H-MUG-11OZ-WBL/WB/WG/WO/WP/WR/WY | 173-183, 381 |
| Cushion | 11″ heart £22 · 18″ round £30 · 12″ sq £30 / double-sided £35 · 22″ sq £40 / £45 | GLOBAL-CUSH-SH-SCSSS, -18R-SCSSS, -12X12-LIN(-DUAL), -22X22-LIN(-DUAL) | 387-408 |
| Kids tee | white £25 · colours £27 | TEE-SS-STTK909 | 186-196, 424 |
| Adult tee | £32 | TEE-SS-STTM559 | 209-210, 521 |
| Jigsaw (tin) | 30 pc £26 · 110 pc £30 · 252 pc £35 | JIGSAW-PUZZLE-30/110/252 | 124-127, 430 |
| Blanket | medium £60 · large £75 | H-BLA-PBMWHITE / PBLWHITE | 240-242, 436 |
| Greetings card 7×5″ | £5.50 (Fedrigoni 330gsm, printed message optional, envelope) | CLASSIC-GRE-FEDR-7X5-BLA | 452-459 |
| Card pack | pack of 5 £12 · pack of 10 £21 (blank inside, a different drawing per card allowed) | CLASSIC-GRE-FEDR-7X5-BLA ×N | 468-474 |
| Calendar 2027 (dated, landscape wall, cover + 12 months) | A5 £22 · A4 £24 | CALENDAR-A5-L-DATED / A4-L-DATED | 484-494 |
| Multi photo frame | 12×12″ (9 drawings) £62 · 16×24″ (24) £87 · 24×36″ (60) £125 | GLOBAL-MPF-12X12/16X24/24X36 | 89, 505-517; [src/lib/multi-photo-frame.ts:79-81](src/lib/multi-photo-frame.ts) |
| Ceramic ornament 7.5 cm | £21 | XMAS-PORC-BAUB | 541-547 |
| Plastic bauble 8 cm | £19 | XMAS-PLAS-BAUB | 551-556 |
| Placemats | 1 £16 · 2 £32 · 4 £60 · 6 £96 | H-PLACE-1PK/2PK/4PK/6PK | 578-589 |
| Coasters | 1 £5.50 · 2 £18 · 4 £26 · 6 £34 | H-COAST-1PK/2PK/4PK/6PK | 594-605 |
| Christmas family bundle | for 2 £78 · for 4 £145 · for 8 £279 (placemats + coasters + ornaments, one parcel) | the packs above | 611-618; [src/lib/christmas-bundle.ts:1-32](src/lib/christmas-bundle.ts) |
| Phone case | snap £25 · tough £30 | per model (prodigiCaseSku) | 626-634; [src/lib/phone-cases.ts:71](src/lib/phone-cases.ts) |
| Apple Watch strap | £45 | GLOBAL-TECH-AP-WS-FL-38MM / 42MM | 636-641 |
| Socks | ankle / tube £20 | GLOBAL-ANKLE-SOCKS / GLOBAL-TUBE-SOCKS | 334-337, 650-654 |
| Height chart (canvas on hanger) | 20×120 £31 · 30×120 £34 · 20×150 £34 · 30×150 £36 | POSTER-HANGER-*-CAN-ROL-SC-* | 342-346, 656-661 |
| Wrapping paper (white or kraft) | 2 m £23 · 3 m £28 · 5 m £38 | WRAP-ROL-70X200/300/500, WRAP-KFT-ROL-* | 353-356, 680-688 |
| Tea towel | £27 | H-TEATOWEL-SUB | 691-697 |
| Playing cards (54) | £24 | PLAY-CARD | 721-728 |

- **Defined but hidden (not visibleInShop):** baby bodysuit £22 (GLOBAL-BB-RS-4411), apron child £25 / adult £29
  (H-APR-CA/AA-BTIE), kids hoodie £43, adult hoodie £42, kids jumper £38, christmas jumper £32, pet bandana £18–19 —
  [catalogue.ts:442-449, 527-535, 664-719](src/server/catalogue.ts). **Paused (cannot be ordered):** storybook A5 £26 /
  A4 £29 (BOOK-FE-A5-P-HARD-G / A4) — [catalogue.ts:414-421](src/server/catalogue.ts); christmas sack £35; christmas-eve
  bundle (retired); gift wrap add-on £3 — [catalogue.ts:562-568, 620-624, 730-734](src/server/catalogue.ts). The 28×40″ frame was withdrawn (made in NL) — [catalogue.ts:95-96](src/server/catalogue.ts).
- **Not sold at all:** stickers (the `src/lib/stickers` folder is Studio decoration stickers, not a product), postcards
  (the only "postcard" is an optional printed gift-note insert, off by default — [src/fulfillment/giftNoteInsert.ts:11-17](src/fulfillment/giftNoteInsert.ts)),
  photo books (storybook paused), notebooks / notepads, unframed prints, fridge magnets.
- **Postage / tracking:** free on every order. Cards, card packs, wrapping paper, playing cards, plastic bauble and
  the AWDis jumper go by **untracked** Standard post — [src/lib/delivery.ts:4-12](src/lib/delivery.ts). Phone cases force
  Express (tracked); calendars have no Express — [delivery.ts:14-25](src/lib/delivery.ts). A Standard-untracked phone
  case now ships as its own Express Prodigi order (26 Nov) — [src/db/schema.ts:524-527](src/db/schema.ts).
- **Built-in savings (no codes):** same-parcel saving £3 off each extra item in a Prodigi parcel group (D24) —
  [src/pricing/parcels.ts:1-25](src/pricing/parcels.ts); multi-buy 0/5/10/15% for 2/3/4/5+ of the same product, derived
  from cost so the order keeps ≥15% net after all allowances — [src/pricing/multibuy.ts:1-38](src/pricing/multibuy.ts);
  family-set 5% off garments when 3+ garments — [src/pricing/catalogue.ts:15-24](src/pricing/catalogue.ts). A code
  never stacks with these: the customer gets the biggest single saving — [src/pricing/promo.ts:4-12](src/pricing/promo.ts).
- **Card packs (D22):** one basket line carries N cards, split at order time into one Prodigi order — [project-office/DECISIONS.md:39](project-office/DECISIONS.md),
  [src/lib/card-packs.ts:1-10](src/lib/card-packs.ts). Max 20 cards per pack order line — [src/app/actions/order.ts:17](src/app/actions/order.ts).
- **Sample orders at cost** for a two-step-verified admin (D32) — [project-office/DECISIONS.md:50](project-office/DECISIONS.md).

### Inferences
- The cheap, light, low-post items that suit a monthly drop already exist and are wired: the 7×5 card and the card
  pack (one Prodigi order, flat cheap post). Stickers and magnets would be new SKUs (Prodigi sells them in GB; see §8).
- Everything posts free, so a subscription can't use "free delivery" as a member perk; it is already universal.

### Gaps
- Live DB prices could differ from code if re-seeded/edited; the code is the seed and fallback (`getCatalogue()` loads per-variant prices from the DB — [src/pricing/catalogue.ts:36-39](src/pricing/catalogue.ts)).

---

## 3. Current promotions (D30) and discount machinery

### Takeaway
One welcome only: a **free greetings card on a signed-in buyer's first paid order** (the shop's own `FIRSTCARD`
code, margin-guarded). Partner codes (creators, school PTAs, campaign codes) carry the same free card and pay the
partner **10% of the order before VAT**. The 5% join saving and parents' "give £5, get £5" referral codes were
retired on 17 Nov 2026. Discounts are our own code (a `promo_codes` table + pure pricing module); Stripe only
receives a one-off coupon per checkout so its total matches ours. There is no subscription or loyalty scheme.

### Cited Findings
- D30 text: welcome = one free card on a signed-in first paid order, "and nothing else"; `FIRSTCARD` via migration
  0059, switchable on /admin/codes; card only comes off if the rest of the order keeps the 10% margin floor; partner
  codes pay "10% commission of the order before VAT"; a school's code keeps earning on a family's later orders, a
  creator's on the first order only; retired: the 5% join saving and referral codes —
  [project-office/DECISIONS.md:48](project-office/DECISIONS.md). Founder quotes there: "5% join saving can go. Free card is better."
- Code: FREE_CARD logic and "THE FREE CARD IS THE ONE WELCOME" — [src/pricing/promo.ts:14-26](src/pricing/promo.ts);
  `codeTerms` (first-order rules, PTA commission on every order) — [promo.ts:33-48](src/pricing/promo.ts);
  `WELCOME_CARD_CODE = 'FIRSTCARD'` — [src/server/promos.ts:24-31](src/server/promos.ts); migration inserts FIRSTCARD and
  switches off REFERRAL codes — [src/db/migrations/0059_welcome_free_card.sql](src/db/migrations/0059_welcome_free_card.sql).
- `promo_codes` table: kinds PERCENT / FIXED / FREE_CARD; partner types INFLUENCER / PTA / REFERRAL / CAMPAIGN;
  min spend, commission bps, first-order-only, start/end dates, max redemptions — [src/db/schema.ts:1083-1121](src/db/schema.ts).
  `account_credits` ledger (referral rewards; earned credit still spends) — [schema.ts:1149-1171](src/db/schema.ts).
  Orders record join/family-set/parcel/multi-buy/promo savings, partner commission and credit applied —
  [schema.ts:479-519](src/db/schema.ts). Membership keeps `join_saving_consumed_at` "for history" — [schema.ts:236-237](src/db/schema.ts).
- Stripe: all savings carried as ONE Stripe coupon created per checkout (`amount_off`, `duration: 'once'`) —
  [src/payments/stripe.ts:76-91](src/payments/stripe.ts).
- The private margins sheet (26 Nov) states "The free first card (FIRSTCARD) is switched off" at the moment — `.prodigi-assets/PRODUCT-MARGINS-2026-11-26.md` §3 (admin switch state, not code).
- Creator-code screenshots exist for C10 first-order codes (free card applied, second-order behaviour) —
  `C:/Users/Simon/dev/Snickerdoodle/reports/c10-first-order-codes/` (images only).
- Earlier code names used in plans: C10 creator codes, PTA codes, DRAWIT, FOUNDING10 — `reports/investor-deck/04-revenue-model.md` (main checkout), "What to replace first".

### Inferences
- The founder has twice cut discounts back to the minimum (D24 "honest bundles only, no Black Friday discount" —
  [src/pricing/parcels.ts:2](src/pricing/parcels.ts); D30). A subscription that is mainly a discount would cut against that stance.
- Partner commission is 10% of ex-VAT goods: a subscription sold through a PTA code would owe that on every renewal
  under today's PTA rule ("a share of every order"), unless a new rule is written.

### Gaps
- Whether FIRSTCARD is on in production today is an admin setting, not visible in code (the private sheet says off).

---

## 4. Payments, accounts and family roles

### Takeaway
Stripe is used **only for one-off Checkout Sessions** (`mode: 'payment'`), with server-priced line items, a one-off
coupon, GB-only shipping collection and `customer_email`. There is **no Stripe Billing, no subscription, no saved
card, no Stripe Customer object, and no subscription webhook** anywhere. Accounts are passwordless (email magic
link / code + passkeys "Face ID"). Grandparents default to the EXTENDED circle, which by default **cannot see** new
keepsakes (they default to FAMILY tier) unless the parent widens the keepsake or puts the grandparent in FAMILY.

### Cited Findings
- `stripe.checkout.sessions.create({ mode: 'payment', … shipping_address_collection: { allowed_countries: ['GB'] }, customer_email })`
  — [src/payments/stripe.ts:93-107](src/payments/stripe.ts). Session lasts Stripe's default 24h — [src/server/retention.ts:13-19](src/server/retention.ts).
- Webhook handles only `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.expired`, `charge.refunded`, `charge.dispute.*`, with an idempotency table —
  [src/payments/webhook.ts:21, 46-109](src/payments/webhook.ts); `webhook_events` — [src/db/schema.ts:601-606](src/db/schema.ts).
- Orders store `stripe_session_id`, `stripe_payment_intent`, refunds and disputes; card data never stored —
  [src/db/schema.ts:521-554](src/db/schema.ts). Grep of `src/` for `subscriptions.`, `customers.`, `billing`,
  `setup_future_usage`, `invoice` found nothing. Package: `stripe ^22.3.0` — [package.json:76](package.json).
- Auth: Auth.js / `next-auth ^5.0.0-beta.32` with one Email (magic link + typed code) provider, rate-limited —
  [src/auth/index.ts:19-57](src/auth/index.ts), [package.json:67](package.json); passkeys via SimpleWebAuthn 13
  ([package.json:74-75](package.json); `passkeys` table — [schema.ts:952](src/db/schema.ts)); sessions last up to 365 days —
  [src/auth/sessionPolicy.ts:10](src/auth/sessionPolicy.ts).
- `accounts` (adults only; "Children are NEVER accounts"), `families` (owner = leader), `memberships`
  (relationship, circle, access, status ACTIVE/REMOVED/LEFT, isOwner, invite id, join consent) —
  [src/db/schema.ts:150-253](src/db/schema.ts). Relationships: CHILD, PARENT, GRANDPARENT, AUNT_UNCLE, CLOSE_FRIEND,
  OTHER, ADULT_CHILD; circles HOME/FAMILY/EXTENDED; access VIEW/VIEW_BUY/CONTRIBUTE — [schema.ts:31-47](src/db/schema.ts).
- Default circle: parent / grown-up child → HOME; **grandparent, aunt/uncle, close friend, other → EXTENDED**; the
  leader may choose FAMILY instead for a grandparent, never HOME — [src/domain/relationships.ts:3-36](src/domain/relationships.ts).
  Only the family owner can invite; children are never invitable — [src/server/invites.ts:77-112](src/server/invites.ts).
- New keepsakes default to FAMILY tier — [src/db/schema.ts:295-296](src/db/schema.ts), [src/server/ingest.ts:126](src/server/ingest.ts);
  EXTENDED members see only EXTENDED-tier keepsakes (CLAUDE.md "Authorization"; ladder in [src/authz/tiers.ts:20-48](src/authz/tiers.ts)).
- Grandparents can buy without joining via a per-person gift link ("share a ready-to-buy link", guest checkout) —
  [docs/04-domain-model-and-business-rules.md:43](docs/04-domain-model-and-business-rules.md); gift orders record `gift_link_id`, `gift_from_name`, `gift_note` — [schema.ts:489-499](src/db/schema.ts).
- A family calendar exists: `occasions` table; reminder emails need explicit REMINDERS consent (PECR log) —
  [src/server/reminders/index.ts:9-38](src/server/reminders/index.ts); members see it only if the parent ticks "share the family calendar" (default off) — [schema.ts:203-204, 220-223](src/db/schema.ts).

### Inferences
- A subscription would need new Stripe work: Customer objects, Billing (or Payment Links for subscriptions), new
  webhook events (`invoice.*`, `customer.subscription.*`), a saved card, and a cancel/manage path (Stripe's customer
  portal). None of that is in the code today.
- A grandparent gift subscription fits the model only if the gift does not need the grandparent to *see* the child's
  art (e.g. the parent picks drawings), or the parent widens visibility; the default EXTENDED circle plus FAMILY
  default tier means a grandparent sees nothing new by default.

### Gaps
- Stripe Billing fees and the Stripe account's current settings are not in the repo.

---

## 5. Schema: tables relevant to a subscription, and what is stored about children

### Takeaway
Children are keepsake subjects with **first name only, an optional birthday (full date, incl. year) and an optional
lunar-calendar flag**, an avatar and a controlling parent. The birthday is shown without the year. An occasions
calendar and an opt-in reminder engine already exist, so a "birthday keepsake" could hang off existing data — but
the Draw app is barred from children's birthdays (D29).

### Cited Findings
- `children`: `first_name` ("no surname collected (minimisation)"), `birthday date` (nullable), `birthday_lunar`
  (CHINESE/KOREAN), `avatar_asset_id`, `controller_account_id` — [src/db/schema.ts:255-268](src/db/schema.ts). Surname
  attempts are refused (`reason: 'surname'`) and first names capped at 24 characters —
  [src/server/children.ts:53-79](src/server/children.ts), [src/server/textSafety.ts:110](src/server/textSafety.ts).
- Birthday display never shows the year ("Children's Code standard 8, A-59": "turns 6 on 14 March") —
  [src/lib/birthdayView.ts:1-20](src/lib/birthdayView.ts). docs/05 treats "a child's images/art/DOB as sensitive data" —
  [docs/05-trust-data-and-compliance-requirements.md:18](docs/05-trust-data-and-compliance-requirements.md).
- `occasions` (kinds BIRTHDAY / ANNIVERSARY / MILESTONE / OTHER; whose day OURS / SOMEONE_ELSE) — [schema.ts:49-53, 1042](src/db/schema.ts);
  `reminder_sends` — [schema.ts:1001](src/db/schema.ts); family "days we celebrate" kept private, "never used for marketing or segmentation" — [schema.ts:174-178](src/db/schema.ts).
- `assets` carry `child_subject_id`, `made_on` (date the child made it, from Draw), `source` (web / app-screen / app-paper) — [schema.ts:272-334](src/db/schema.ts).
- `orders` / `order_items` (frozen spec snapshot per line, bundle key) — [schema.ts:469-599](src/db/schema.ts);
  `saved_designs` (a drawing on a product, saved for later) — [schema.ts:1123-1146](src/db/schema.ts);
  `saved_baskets` — [schema.ts:1024](src/db/schema.ts); `gift_links` — [schema.ts:902](src/db/schema.ts).
- Draw-app tables: `app_tokens`, `app_artist_progress` (drawing days, rest weeks, best run, lesson ids — "behavioural
  data about a child"), `app_checkout_grants` (single-use 15-minute pass for one keepsake × one product) — [schema.ts:1249-1355](src/db/schema.ts).
- No subscription, plan, entitlement or recurring-order table exists (full table list: [schema.ts](src/db/schema.ts) `pgTable(` lines 151–1366).

### Inferences
- A birthday auto-keepsake could read `children.birthday` (day + month) and the parent's own kept drawings; it must
  not profile the child or use the year beyond computing age. Using the birthday for a paid auto-order is a new
  purpose and would need a DPIA note.

### Gaps
- How many families have entered a child's birthday is not documented.

---

## 6. Snickerdoodle Draw companion app

### Takeaway
A free kids' drawing app (ages 3–12, 366 lessons, works offline, paper mode) with **no ads, no in-app purchases and
no prices anywhere**, built for the Apple Kids category and Google Play Families. Linking to the website (built 9
Nov; D29 signed 12 Nov) lets a grown-up sync none / the "proud pile" / all drawings into the keepsake box. An old
"Snickerdoodle Club ~£4.99/mo" idea (all lesson packs, one free print a month, birthday auto-gift) exists only in the
superseded v2 strategy; the current rules forbid prices, "unlock" and "upgrade" in the app.

### Cited Findings
- STRATEGY v2 business model: "Free app, which funnels into Snickerdoodle orders… No ads, ever" and "Later:
  Snickerdoodle Club (~£4.99/mo): all lesson packs, one free print a month, birthday auto-gift"; roadmap "Family:
  … Club subscription" — `C:/Users/Simon/dev/snickerdoodle-draw/STRATEGY.md:79-80, 100`. Its header says where it
  conflicts with the alignment doc, "the alignment wins" — `STRATEGY.md:3`. The internal fact sheet calls the Club
  "superseded" — `C:/Users/Simon/dev/Snickerdoodle/reports/investor-deck/00-internal-fact-sheet.md:266, 522`.
- Alignment rules (founder, 20–21 Oct): "No prices anywhere in the app. Not in the child's view, not in the
  grown-ups' corner" — `snickerdoodle-draw/docs/WEBSITE_ALIGNMENT.md:40-41`; everything past the preview needs a
  parent behind the grown-up gate (phone unlock + PIN) — `WEBSITE_ALIGNMENT.md:16-21, 37-39`; "Never: prices,
  countdowns, scarcity, 'limited', 'unlock', 'upgrade', 'your child wants…', product mentions in push notifications,
  discount codes shown to children" — `WEBSITE_ALIGNMENT.md:255-256`; streaks never tied to products or purchases — `WEBSITE_ALIGNMENT.md:116`.
- Milestones are in-app only (crayon, stickers, printable certificates); "no posted gifts, no order condition, no
  discounts" (decided 2 Nov) — `snickerdoodle-draw/docs/LAUNCH_CHECKLIST.md:16`.
- Store posture: "No ads. No in-app purchases. No chat, no social feed, no sign-up" —
  `snickerdoodle-draw-ios/docs/store/listings/en-GB.md:36`; digital-goods purchases "No" — `docs/store/content-rating.md:17`;
  target ages 5-and-under / 6–8 / 9–12; links, purchases and settings behind a parental gate; "No in-app purchases aimed
  at children" — `docs/store/families-policy.md:7, 21-22`; iPhone submits to the Kids category — `docs/LAUNCH_CHECKLIST.md:48`.
- Website copy repeats it: "Snickerdoodle Draw is free. There are no adverts and nothing to buy inside it" and "The
  app costs nothing. It has no adverts, no in-app purchases and no prices" — [src/app/(marketing)/trust/terms/draw/page.tsx:30, 58](src/app/(marketing)/trust/terms/draw/page.tsx);
  FAQ — [src/lib/faq.ts:388](src/lib/faq.ts). FAQ still says linking is "coming soon" — [faq.ts:357, 423](src/lib/faq.ts).
- Website side of the link: only the family owner links; a key covers one family and ticked children; "No prices
  cross to the app"; "make it real" opens the website maker with a single-use 15-minute pass; uploads OFF unless
  `DRAW_APP_UPLOADS=on`; progress backup deliberately not built at first — [project-office/briefs/DRAW-APP-LINK-website-side.md](project-office/briefs/DRAW-APP-LINK-website-side.md).
- D29 (12 Nov): founder signed the DPIA addendum + Children's Code assessment for sync; sync choice none / proud / all,
  nothing pre-selected; widening only on the website; "no children's birthdays in the app" —
  [project-office/DECISIONS.md:47](project-office/DECISIONS.md); `app_sync_keepsakes` enum — [schema.ts:143](src/db/schema.ts).
- App API `GET /products` returns `{key, label, blurb}` only, no prices — `snickerdoodle-draw/docs/API_CONTRACT.md:23`.
- Running cost of the app at launch: Expo free + Sentry free ≈ £100 a year (≈£850 at 10k monthly users) — `snickerdoodle-draw/docs/LAUNCH_CHECKLIST.md:52-54`.
- The website now has a /draw page and a "get the app" bubble; store links still placeholders — side note `draw-app-promo.md` (side-session-notes folder).

### Inferences
- Any paid plan must be bought and managed on the website by a grown-up; nothing can be sold, priced or "unlocked"
  in the app (Kids-category and our own rules). App-side perks of a website plan (e.g. more lesson packs) would still
  need to show no price or upgrade language in the app — possibly impossible to signpost at all.
- The old Club's "birthday auto-gift" clashes with D29's "no children's birthdays in the app".

### Gaps
- App Store review status and any download numbers are not in the repos.

---

## 7. Existing pricing, margin and competitor work; prior subscription mentions

### Takeaway
Single-item gross margins run **~27–55% of ex-VAT price** (most products 30–42%); the card is highest (~55%), card
packs ~39–41%, calendars ~32–33%, jigsaws and the plastic bauble lowest (~27–30%). The marketing reality check puts
the true net on a £35 order at **about £5 (~17%)** after every cost but marketing. Competitor work shows our prices sit
with small "drawing makers", above discounters. Subscriptions were mentioned only three times before: the Draw
"Club" (superseded), the "a card a month" idea, and competitors' subscriptions (Keepy, FamilyAlbum, Tinybeans).

### Cited Findings
- **Margins per product (Prodigi Pro costs; profit % of ex-VAT, before allowances)** — `.prodigi-assets/PRODUCT-MARGINS-2026-11-26.md` §1
  (private sheet; % only here): framed prints 30–38% · mug 40% · cushions 31–42% · kids tee 42% · adult tee 31–41% ·
  jigsaw 27–36% · blanket 35–38% · **greetings card 55%** · **card pack of 5 41%, of 10 39%** · **calendar A5 32%, A4 33%** ·
  multi photo frame 36–37% · ceramic ornament 34% · plastic bauble 29% · placemats 34% · coasters 37–38% · Christmas
  bundle 37–38% · phone case 30–34% · watch strap 37% · socks 31% · height chart 32–33% · wrapping paper 32–34% ·
  tea towel 33% · playing cards 31%. "After allowances" (3% reprints, 5% codes, 55p running) roughly halves the £ profit
  on low-price items (e.g. a single card keeps about £1–2 after allowances).
- Landed Prodigi cost bands (product + first post, ex VAT, ranges only): single card under £2; card pack of 5 £5–6;
  of 10 about £10; calendar £12–13; mug £8–9; ornament / bauble about £11; 11×14″ frame £33–34. Exact figures: private file.
- Partner commission at 10% of ex-VAT order takes ~10 points off each margin % — PRODUCT-MARGINS §3.
- Multi-buy target: ≥15% net after all allowances — [src/pricing/multibuy.ts:5-11](src/pricing/multibuy.ts). Christmas
  bundle "≈ 20% net after every cost" — [src/lib/christmas-bundle.ts:6](src/lib/christmas-bundle.ts). D22 card packs "~19% net" — [DECISIONS.md:39](project-office/DECISIONS.md).
- **Net margin reality:** "A £35 order is £29.17 before VAT, and about £5 of that is left after product, printing,
  postage and running costs, or about 17%"; creator code orders keep ~62p; school deals at 10% keep £1.50–£2;
  realistic 12-month repeat 11–20%, ~1.2–1.3 orders per customer in year 1 — `C:/Users/Simon/dev/Snickerdoodle/reports/UK marketing costs reality check.md:1-20`.
  The investor model: net 15–20% of ex-VAT; "a customer pays back after about 5 orders" at £24 CAC — `reports/investor-deck/04-revenue-model.md` (main checkout), "Sense checks".
- **Competitors (public report on `origin/docs/product-margins`, `reports/Product prices costs and competitors.md`):**
  "We are priced like a small drawing maker, not like a photo-gift site"; dear: baubles/ornament, blankets, placemats,
  watch strap, A5 calendar; cheap: cushions, big frames; nobody else does height charts, calendars or watch straps from a
  child's drawing (lines 11-21). Cards: single card bands delivered Etsy £3–6, Moonpig £5.54–6.98, Dinky Artist £8;
  pack of 10 Etsy £11–23, Moonpig ~£30 with code; school card schemes ~£9 for 12 (lines 384-403). Calendars: mass A4
  everyday £21–28, Black-Friday £11–16; A5 £22 "above" (lines 405-423). "buy more & save is rare among rivals" (line 562).
- **Sourcing report** (`origin/docs/sourcing-costs`, `reports/Sourcing and shipping cost savings.md`; private workings in
  `.prodigi-assets/SOURCING-SAVINGS-2026-11-26.md`): check the account is on Prodigi Pro (15% off products, 10% clothing;
  roughly £35/month plan); Gelato is ~30–40% cheaper on frames but has no gold frame and is a new processor; Prodigi is
  already cheapest on mugs/tees; Printful/Printify ruled out (licence to use uploads for promotion) — side note `sourcing-costs.md`.
- **Prior subscription mentions:**
  - Draw "Snickerdoodle Club ~£4.99/mo" (superseded) — §6 above.
  - Product idea #12 "Birthday-card multipack / 'a card a month'": "The wedge with a subscription shape; feeds the
    reminder engine; thin margin by design"; #6 "Year in Doodles" annual book, "naturally recurring", a "top pick" —
    [project-office/briefs/PRODUCT-IDEAS.md:24, 30, 37](project-office/briefs/PRODUCT-IDEAS.md).
  - Competitors: Keepy (US) "Free for 7 memories/month; paid 'Unlimited' subscription" —
    `reports/investor-deck/01-market-and-seasonality.md:63` (main checkout); FamilyAlbum 25m users, Premium $5.99/$10.99;
    Tinybeans FY25 subscription revenue US$3.32m, 93% retention, 87% margins (secondary sources) — `01-market-and-seasonality.md:230, 259`.
  - Childbook.ai deletes photos "max 14 days after subscription ends" and keeps AI illustrations indefinitely — [project-office/briefs/PERSONALISED-BOOKS-market-scan.md:41-43](project-office/briefs/PERSONALISED-BOOKS-market-scan.md).
  - Gelato+ is itself a subscription plan (relevant only as a supplier) — sourcing report line 364.
  - No decision (D1–D32) concerns subscriptions, memberships or storage tiers — [project-office/DECISIONS.md](project-office/DECISIONS.md) (grep).
- School art apps research: Artsonia (US) turns school art into keepsakes, pays schools 20%, US/Canada only; no UK tool
  does it — side note `school-art-apps-research.md`; full report `C:/Users/Simon/dev/Snickerdoodle/reports/School and academy art apps for ages 3-12.md`.

### Inferences
- A card-led subscription has the healthiest per-unit margin in the range (cards ~55%, packs ~40%), and the cheapest
  post; but in absolute £ a single card leaves only £1–2 after allowances, so a low-price plan has little room for a
  "free extra" or partner commission.

### Gaps
- The margin sheet uses July price sheets and sandbox quotes, not invoices; live DB costs may differ (adult tee
  colour costing and watch-strap cost flagged as possibly wrong in the live DB — PRODUCT-MARGINS §4).

---

## 8. Real Prodigi costs (summary, ranges only)

### Takeaway
Prodigi already makes in GB every cheap, light item a subscription might use. Landed cost (product + first post,
ex VAT, with the Pro discount estimated) is roughly: single card £1–2; card pack of 5 £5–6; mug £8–9; calendar £12–13;
small kiss-cut sticker ~£3; medium sticker £4–5; small fridge magnet £2–4; A5/A4 hardcover photo book from about
£13–15 before page costs. Exact figures are in the private file.

### Cited Findings
- Products we sell: see §7 bands; exact numbers in `.prodigi-assets/PRODUCT-MARGINS-2026-11-26.md` §1.
- Products we don't sell (Prodigi July GB sheets in `.prodigi-assets/pricing/`): stickers — 4 single kiss-cut matt vinyl
  sizes 3×4″ to 14×14″, made in GB, Standard post untracked (`prodigi-stickers-stickers-gb.csv`); fridge magnets — 3×2″,
  6×4″, acrylic, and 1/4/6/9-image 10 cm / 15 cm, made in GB (`prodigi-magnets-magnets-gb.csv`); hardcover photo books
  (BOOK-FE A5/A4/square, gloss or premium Mohawk), made in GB, tracked; the sheet gives a base price but no page
  pricing (`prodigi-books-&-magazines-hardcover-books-gb.csv`); undated A5/A4 calendars exist alongside the dated 2027 ones
  (`prodigi-calendars-calendars-gb.csv`).
- No postcard, notebook/notepad or unframed small-print sheet is in the folder.
- Exact per-item cost + shipping for cards, packs, calendars, mugs, ornaments, coasters, stickers, magnets, books:
  written to `.prodigi-assets/SUBSCRIPTIONS-COSTS-2026-11-26.md` (private, gitignored).

### Inferences
- A "sticker sheet of the month" would need a multi-sticker layout on one kiss-cut SKU (Prodigi's sheet lists single
  stickers only); the 5.5″ size has the cheapest post in that range.

### Gaps
- Photo-book per-page costs, postcards, notebooks and unframed prints need a Prodigi quote or API lookup.
- Some sheet rows label book/calendar shipping in EUR; worth confirming in a sandbox quote.

---

## 9. Brand and trust rules that constrain a subscription; any promise a paid storage tier would break

### Takeaway
The binding rules are: nothing public, no profiling of children, no behavioural ads, no nudges toward weaker privacy,
AI invisible, retention enforced in code, warm voice and **no pushy or dark-pattern upsell**. On storage, the site
promises that a kept keepsake stays until the parent deletes it and that Snickerdoodle is "free to try" with "you only
pay for the products you order". There is **no explicit "free forever" or "unlimited" storage promise**, but a paid
storage tier (or a cap) would contradict the plain-meaning of today's FAQ and terms and the docs/05 rule "kept
assets persist until the controller deletes them".

### Cited Findings
- Non-negotiables: child safety first; privacy by default, "Nothing is EVER public"; parent is controller; AI invisible;
  brand voice "No corporate tone, no pushy upsell"; originals sacred and deletable on demand — CLAUDE.md "The 9
  non-negotiables"; [START-HERE.md:19-20](START-HERE.md).
- "No dark-pattern upsell — add-ons stay small and tasteful; guest checkout stays one tap away"; "No public profiles /
  social feed" — [docs/01-product-requirements.md:52-55](docs/01-product-requirements.md). Retention is the Keepsake Home
  ("an 18-year relationship"), the occasion engine and the family graph — [docs/01:13-19](docs/01-product-requirements.md).
- Children's Code (voluntary conformance): "high-privacy defaults, data minimisation, no nudges toward weaker privacy,
  clear parent controls, no profiling of children, and treating a child's images/art/DOB as sensitive data"; consent
  for marketing and reminder nudges under PECR, "with frequency caps" — [docs/05-trust-data-and-compliance-requirements.md:18-22](docs/05-trust-data-and-compliance-requirements.md).
  CLAUDE.md "Children's-data rules": "no profiling of children; no behavioural ads to/about children"; retention
  "delete the source upload after fulfilment + 30d UNLESS kept in the Keepsake Home"; "One-tap see/download/delete in the account".
- Family celebrations data is "never used for marketing or segmentation (it can reveal religion / ethnicity)" — [src/db/schema.ts:174-178](src/db/schema.ts).
- Draw app: "Never: prices, countdowns, scarcity, 'limited', 'unlock', 'upgrade'" — `snickerdoodle-draw/docs/WEBSITE_ALIGNMENT.md:255-256`.
- **User-facing promises found (grep of src/app, src/lib/faq.ts, src/ui for free / forever / storage / unlimited):**
  - "Yes, Snickerdoodle is free to try: uploading, previewing and editing your child's drawing costs nothing. You only
    pay for the products you order" — [src/lib/faq.ts:97-99](src/lib/faq.ts).
  - "Snickerdoodle keeps an uploaded drawing or photo only as long as it takes to make and send your order, plus 30 days
    … unless you choose to keep it in your Keepsake Home" — [src/lib/faq.ts:320-321](src/lib/faq.ts).
  - "snap a photo of each drawing and keep it in your private Family Keepsake Home, so the paper can go without losing
    the memory" — [src/lib/faq.ts:102-104](src/lib/faq.ts). D31 positions the box as "a place to keep every drawing, not
    only a shop" — [project-office/DECISIONS.md:49](project-office/DECISIONS.md).
  - "You only need a quick sign-up … to order or to keep a drawing in your Keepsake Home" — [src/lib/faq.ts:94](src/lib/faq.ts).
  - Terms §3: a draft is "automatically deleted within 30 days unless you choose to keep it in a Keepsake Home (which
    needs an account)"; §7 "What you keep is private to you by default" — [src/app/(marketing)/trust/terms/page.tsx:46-51, 86-90](src/app/(marketing)/trust/terms/page.tsx).
    The terms have no fee / charges clause for the Keepsake Home (grep for "fee|charge").
  - Family promise: "See everything we hold, download it, or delete it — any time, in one tap"; "No AI is learning from
    your child" — [src/app/(marketing)/trust/family-promise/page.tsx:40-58](src/app/(marketing)/trust/family-promise/page.tsx).
  - Gift-link join pill reads "free to join" (D30) — [src/app/g/[token]/GiftCheckout.tsx:149](src/app/g/[token]/GiftCheckout.tsx).
  - Draw: "Snickerdoodle Draw is free… nothing to buy inside it"; "The app costs nothing … no in-app purchases and no
    prices" — [src/app/(marketing)/trust/terms/draw/page.tsx:30, 58](src/app/(marketing)/trust/terms/draw/page.tsx).
  - "UK delivery is free on every order" — [src/lib/faq.ts:109, 249](src/lib/faq.ts).
- No occurrence of "free forever", "unlimited", "no limit" or "subscription" in user-facing copy (grep).

### Inferences
- A storage paywall or cap would read as breaking "you only pay for the products you order" and "kept … until you
  delete it", and would hit families who have already moved their paper archive in (D31). Any cap would also need a
  humane path for over-cap families (no deletion of originals; Children's Code "no nudges").
- "Free to join" (gift link) and "the app costs nothing" are explicit; a paid family membership for grandparents to
  join, or a paid app tier, would contradict them.
- Subscription copy must avoid urgency/scarcity and must not be shown to children; auto-renew reminders are
  transactional, but any "you'll love this" marketing nudge needs PECR consent.

### Gaps
- Privacy notice text on retention of kept keepsakes was not read line by line beyond the FAQ/terms (privacy page lines 69, 172 mention private UK storage only).

---

## 10. Orders, AOV and traction (only what is documented)

### Takeaway
**No real order count, revenue or measured AOV is documented anywhere** in the repos or reports. The site went
public on 13 Nov 2026; every AOV figure is an assumption (£35, possibly £45 with bundles).

### Cited Findings
- "No measured AOV exists (no public sales yet)"; "no sales, revenue, order count, waitlist size, conversion or repeat
  figures exist" (compiled 13 Nov 2026) — `C:/Users/Simon/dev/Snickerdoodle/reports/investor-deck/00-internal-fact-sheet.md:194, 510-512`.
- Planning assumptions: £35 AOV (bundles could lift to £45); ~200 orders/month for running-cost maths; CAC flag "over
  £15"; Phase 1 exit gate "first 100 orders, CAC < contribution, repeat signal" — `00-internal-fact-sheet.md:193-207`;
  `04-revenue-model.md` inputs (mid case 2027 ≈ 1,600 orders, £64k) — main checkout `reports/investor-deck/`.
- Revised marketing maths: about £42 per first order (range £20–£97); £10k plan ≈ 240 first orders, £20k ≈ 480 —
  `reports/UK marketing costs reality check.md:1-5` (main checkout).
- The sourcing report's "200 orders a month" mix is explicitly "an assumption, not sales data" — `.prodigi-assets/SOURCING-SAVINGS-2026-11-26.md` §3.
- Admin "Monday numbers" and weekly metrics exist in code (`src/app/admin/week`, `project-office/ops/METRICS.md`), but no figures are committed.

### Inferences
- Any subscription sizing must be built on assumptions; real first-fortnight order data sits in the live admin app, not in the repo.

### Gaps
- Live order count, AOV, repeat rate, share of signed-in vs guest buyers, and how many families keep drawings — the founder would need to read these from /admin.
