# Test sweep 29 Oct 2026 — 05: basket, prices, checkout and orders

Tester 05 · branch `claude/sweep-5-checkout-8eb5f8` (cut from `feat/christmas-season` at d6f890b) ·
own database `snickerdoodle_t5` · e2e server on :3205 (production build, console mail, local MinIO KMS).

**Safety checks done before any payment:** `STRIPE_SECRET_KEY` starts `sk_test_` (checked without printing it);
`PRODIGI_BASE_URL` = `https://api.sandbox.prodigi.com/v4.0`; mail = console. Every Stripe session my tests made
came back `livemode: false`. Nothing touched the live site, the AWS box or the shared `snickerdoodle` database
(one read-only `count(*)` early on, before I switched to loading costs into my own DB).

**Set-up notes for whoever repeats this:**
- A fresh database has no Prodigi unit costs, so multi-buy and codes do nothing and two `launchLoop` tests fail.
  Load them with `scripts/discount-headroom.mjs --write-costs` — but that script also writes a report INTO
  `.prodigi-assets` (shared, read-only for testers). I ran a scratch copy that wrote its report to my scratchpad.
- The site's own upload limit (60 an hour per address) trips after ~60 test uploads; every e2e then fails at the
  range page with "whoa — that's a lot in a row". I cleared my own DB's `rate_limits` rows (`upload:%`, `mockup%`).

## Summary

| checklist rows (54) | count |
|---|---|
| PASS | 47 |
| FAIL | 7 (bugs B1–B7) |
| BLOCKED | 0 |
| NOT TESTABLE LOCALLY / NOT TESTED | 5 (section c) |
| bugs | 9 (B8, B9 come from passing rows) |

**P0 — 05-B1:** a drawing that's **reported after payment** is still rendered and **sent to Prodigi** — nothing after
order placement looks at moderation.
**P1 — none.** Every charge I made matched the order record to the penny.

## Evidence files

- `src/server/__tests__/sweep05-checkout.int.test.ts` — 16 pass, 3 skipped (the skipped ones are bugs B1, B2, B4,
  written to assert the RIGHT behaviour; un-skip when fixed). Run: `node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/__tests__/sweep05-checkout.int.test.ts`
- `e2e/checkout-sweep.spec.ts` — 13 tests + 3 `fixme` (bugs B3, B6, B7). Last full run: 12 passed, 3-D Secure failed inside the batch and passed when re-run (row 40). Run: `E2E_PORT=3205 npx playwright test e2e/checkout-sweep.spec.ts`
- Screenshots: `reports/test-sweep-2026-10-29/shots/05/`.
- Existing suites re-run on my DB: pricing + payments + addOns + lib unit tests **509/509 pass**; orders, christmasBundle,
  multiBuy, launchLoop, moderation, submit, worker integration **76/76 pass** (after loading costs — see set-up);
  Prodigi sandbox live smoke (`PRODIGI_LIVE_CHECK=1 … sandbox-live.int.test.ts`) **pass** — real sandbox `ord_…` back.
- Existing e2e re-run: storefront-smoke, wow-flow, basket-per-drawing, gift-loop ×2, calendar **pass**;
  family-set and card-pack **fail — stale tests, not money bugs** (notes N1, N5).

## (a) Coverage checklist

### Prices — "every price shown equals the server's price"
| # | item | result | evidence |
|---|---|---|---|
| 1 | catalogue tiles → add → basket total = server | PASS | `storefront-smoke` "every live product renders, adds, and prices to the server total" |
| 2 | checkout line price + total = server (desktop) | PASS | e2e "desktop: a line shows the server price…"; `checkout-desktop-1280.png` (mug £18 = `product_variants.price_pence`) |
| 3 | checkout total in the phone sticky bar = server | PASS | e2e "phone 390…"; `checkout-phone-390.png` |
| 4 | bundle builder size buttons, summary, add button, basket line, checkout = £78 / £145 / £279 | PASS | e2e "christmas family bundle for 2/4/8…" ×3; `bundle-for4-checkout.png` |
| 5 | bundle sizes in the DB catalogue = £78 / £145 / £279 | PASS | int "the christmas family bundle is £78 / £145 / £279…" |
| 6 | Stripe charges exactly the order total — 2 mugs (multi-buy + parcel), family set, £10 code, bundle-for-4 + sack, joined member's 5% | PASS | int "Stripe Checkout (TEST mode) charges exactly the order total" ×5 (`session.amount_total === orders.total_pence`, bundle = one Stripe line at 14500) |
| 7 | real card payment: charge = order total | PASS | e2e 4242 (`session.amount_total === total_pence === price`, PaymentIntent `succeeded`) |
| 8 | confirmation email, simple order | PASS | server log: `[order-confirmed] … SNK-829617 · mug — £18 · Total £18`, sent once despite a webhook replay |
| 9 | confirmation email / `/orders` lines for a bundle, variant SKUs, discounts | **FAIL → 05-B5** | captured email below |
| 10 | `/orders` shows the paid order at its charged total | PASS | e2e 4242; `orders-after-paid.png` |
| 11 | `quoteBasket` with forged prices, `catalogue`, join context/provenance, promo object, credit | PASS | e2e "desktop…": forged body → `totalPence` = real price, join/promo/credit 0, no `partnerCommissionPence` in the response |
| 12 | `placeOrderAction` with forged price, line total, promo OBJECT, join provenance, credit, another account id, `visibility: 'PUBLIC'` | PASS | e2e "forged place-order…": order total = real price, all savings 0, `promo_code_id` null, not PAID, Stripe session = real price, asset stays `FAMILY` |
| 13 | `checkBundleAction` / bundle order with smuggled price, qty 3, add-ons | PASS | existing `christmasBundle.int` ("a set for 8 (£279)… a smuggled qty buys one set") + `bundle.test` — both ran green |

### Discounts
| # | item | result | evidence |
|---|---|---|---|
| 14 | multi-buy tiers on EVERY live variant: only 0/5/10/15 %, never decreasing, ≥15 % net at every qty 2…12, unknown cost ⇒ no offer | PASS | int "multi-buy on every live variant…" (>100 variants with costs) |
| 15 | multi-buy in the page: dropdown shows the tier, struck line price, "Buy more & save" + "Same-parcel saving", total = server quote | PASS | e2e "buy more & save: 2 mugs…"; `multibuy-dropdown.png`, `multibuy-two-mugs.png` (£36 − £3 − £5.40 = £27.60) |
| 16 | £3 same-parcel saving per extra item in one group | PASS | int (2 mugs → 300), e2e add-on (mug + same-parcel add-on → £3 off), existing `parcels.test` |
| 17 | £5 off £40 / £10 off £60: below minimum → not used; at it → applied, persisted on the order | PASS | int "£5 off £40 / £10 off £60…" |
| 18 | influencer 10 % + commission; margin guard keeps ≥10 % on EVERY live variant even for 50 % / £50 codes | PASS | int "margin guard on every live variant…"; existing `launchLoop` codes test (commission persisted) |
| 19 | a code never stacks with multi-buy (2 mugs + 10 % code → code not used) | PASS | int "a code never stacks with buy-more-&-save…" |
| 20 | a code never discounts the bundle | PASS | int "a code on a basket WITH the family bundle…" — see note N2 for how it behaves with other items |
| 21 | unknown / junk / not-started / expired / switched-off / used-up codes refused | PASS | int "invalid, not-started, expired…" |
| 22 | code messages in the box (unknown, finished, under minimum, applied) + the "Code X −£" line | PASS | e2e "codes in the box…"; `promo-applied.png` |
| 23 | a max-use code can't be over-used | **FAIL → 05-B4** | |
| 24 | 5 % join saving: none for guest, owner, removed member, spent saving, other invite, unverified, expired, cross-family | PASS | int "the 5% join saving…"; existing `pricing.test` |
| 25 | 5 % join saving for a genuine invite join, priced by the server | PASS | existing e2e `gift-loop` "invite → verify … 5% off" ran green; int Stripe test (joined member's 5 % reaches Stripe) |
| 26 | forged join flag from the browser | PASS | items 11, 12 |
| 27 | family-set 5 % (3+ garments) | PASS (rules) / stale e2e | `pricing.test` green; e2e `family-set` fails because multi-buy now wins — note N1 |

### Checkout page
| # | item | result | evidence |
|---|---|---|---|
| 28 | layout at 390×844: no sideways scroll, total + checkout pinned in the thumb zone, button ≥44 px | PASS | e2e "phone 390…"; `checkout-phone-390.png` |
| 29 | layout at 1280×800 (grid a–e, summary aside) | PASS | `checkout-desktop-1280.png` |
| 30 | the line shows THIS drawing on the product | PASS | e2e waits for `img[alt="your drawing on a mug"]` with real pixels |
| 31 | add-ons: the shopper's own drawing, never a product already in the basket, "+" visible without hover, adds at server price | PASS | e2e "add-ons…" (phone); `addon-added-phone.png`; existing `addOns.test` (bundle → sack + mug, never what's inside it) |
| 32 | guest checkout: personalised basket → magic-link sign-up, no charge | PASS | existing e2e `wow-flow` green (see N7 on the "one tap" promise) |
| 33 | guest checkout from a gift link: no account | PASS | existing e2e `gift-loop` "a guest buys from a gift link" green |
| 34 | the copy under checkout matches what will happen | **FAIL → 05-B7** | |
| 35 | gift toggle hides line prices ("gift") | PASS | e2e 05-B6 run (asserted before the failing step) |
| 36 | gift note + "email for your receipt" reach the order | **FAIL → 05-B6** | |
| 37 | Stripe address: GB only, captured onto the order before it's PAID | PASS | int (`shipping_address_collection.allowed_countries = ['GB']`); e2e 4242 (`shipping_address` = 1 Test Street / SW1A 1AA / GB) |
| 38 | Stripe 4242 4242 4242 4242 | PASS | e2e 4242; `confirmation-4242.png` |
| 39 | Stripe declined 4000 0000 0000 0002: "card declined", session unpaid, order PENDING | PASS | e2e "declined card…"; `stripe-declined.png` |
| 40 | Stripe 3-D Secure 4000 0027 6000 3184: challenge completed, session paid, amount = order | PASS (flaky 1 in 5) | e2e "3-D Secure…"; `stripe-3ds-challenge.png`. Passed 4 of 5 runs; the one failure was inside a 3-minute batch run (Stripe's hosted challenge page) |
| 41 | back from Stripe keeps the basket | **FAIL → 05-B3** | `back-from-stripe.png` |
| 42 | confirmation page: order ref, keep-it card, no private data | PASS | `confirmation-4242.png` |

### Webhook `/api/webhooks/stripe`
| # | item | result | evidence |
|---|---|---|---|
| 43 | wrong-secret signature → 400; no signature → 400; signed-then-tampered body → 400; order untouched | PASS | e2e 4242 (real HTTP, events signed with the `stripe` library) |
| 44 | valid signed `checkout.session.completed` → PAID, address + email captured | PASS | e2e 4242 + int webhook test |
| 45 | replayed event → 200, one `webhook_events` row, `paid_at` unchanged, email not re-sent | PASS | e2e 4242 + int; server log shows one `[order-confirmed]` for SNK-829617 |
| 46 | event for a session we never made → recorded, nothing changes | PASS | int |
| 47 | a completed-but-UNPAID session is not treated as paid | **FAIL → 05-B2** | |

### Orders + fulfilment
| # | item | result | evidence |
|---|---|---|---|
| 48 | order record: lines, unit/line prices, savings, promo id, frozen spec | PASS | int Stripe tests + existing `orders.int` (green) |
| 49 | the bundle split into Prodigi lines sums to the bundle price exactly (2 / 4 / 8) | PASS | int bundle-for-4 (lines sum 14500); existing `christmasBundle.int` for 2/4/8 green |
| 50 | a held / un-cleared drawing (IWF not connected) can't be ordered: refused BEFORE any order row or charge; basket kept | PASS | int "an un-cleared drawing … refused BEFORE an order"; e2e "a drawing still held for review…" (no new order row, basket still 1 item); `held-drawing-checkout.png`. See 05-B8 for the message |
| 51 | a drawing reported AFTER payment is held back from print | **FAIL → 05-B1 (P0)** | |
| 52 | shipping method: Standard, Express when a phone case is in the order | PASS | existing `submit.int` green |
| 53 | one Prodigi order per our order, every line in it (packs, bundle pieces) | PASS | existing `submit.int` ("a 10-PACK … in ONE Prodigi order") green |
| 54 | a real Prodigi SANDBOX order is accepted | PASS | `sandbox-live.int.test.ts` with `PRODIGI_LIVE_CHECK=1` → `ord_…` |

## (b) Bugs

### 05-B1 · P0 · a drawing reported after payment is still printed
- **Steps:** a parent pays for a mug with a cleared drawing → a family member reports that keepsake
  (`reportKeepsake`, reason "inappropriate") → the asset becomes `FLAGGED` with an open report ("held … so nothing
  prints", `src/server/contentReports.ts` doc comment) → the fulfilment tick runs.
- **Expected:** the line is held (not rendered, not submitted) until a reviewer clears it.
- **Actual:** it renders, passes the egress gate and is submitted. Captured from the test (un-skipped):
  `{"status":"FULFILLING","moderation":{"s":"FLAGGED","d":{"labels":["reported by someone in the family",…],"reports":[{"reason":"inappropriate",…}]}},"payloadSkus":[["H-MUG-11OZ-WBL"]]}`
- **Where:** moderation is only checked in `placeOrder` (`src/server/orders.ts:175`). The worker
  (`src/fulfillment/worker.ts:153-196` `processItem`) and the submitter's gate re-assert
  (`src/fulfillment/submit.ts:314-340`) read `childSubjectId/kind/isBrandSafeFixture` only, never `moderationStatus`.
  The controller can still view a held asset, so the render's authz check passes too.
- **Today's exposure:** POD_MODE=SANDBOX blocks every child image anyway, so nothing real is sent yet. It bites the
  moment LG3 + LG6 go green and POD_MODE=LIVE. The same gap covers a `BLOCKED` decision made after payment
  (render would refuse BLOCKED via `assertViewableRow`, but a line already READY would still be submitted).
- **Test:** `it.skip('05-B1: …')` in `sweep05-checkout.int.test.ts`.

### 05-B2 · P2 (becomes P1 if a delayed payment method is switched on) · "completed" is treated as "paid"
- **Steps:** send a signed `checkout.session.completed` whose `payment_status` is `unpaid` (what Stripe sends for
  delayed methods such as Bacs / bank transfer).
- **Expected:** the order stays PENDING until `checkout.session.async_payment_succeeded`.
- **Actual:** the order is marked PAID (= queued for print). Test output: `expected 'PAID' to be 'PENDING'`.
- **Where:** `src/payments/webhook.ts:28-59` — no `payment_status === 'paid'` check; `async_payment_succeeded` /
  `async_payment_failed` aren't handled.
- **Today:** the test Stripe account offers card, Apple Pay, Klarna, Revolut Pay, Amazon Pay and Link — all settle
  at once, so this is latent. `it.skip('05-B2: …')`.

### 05-B3 · P2 · going back from Stripe empties the basket
- **Steps:** basket with a drawing on a mug → checkout → on Stripe's page tap "Back to …".
- **Expected:** back at /checkout with the basket as it was.
- **Actual:** "Your basket's empty" (`back-from-stripe.png`). The drawing-on-a-mug has to be rebuilt, and a PENDING
  order is left behind that shows on `/orders` as "awaiting payment" with no way to pay or cancel it.
- **Where:** `src/app/checkout/page.tsx:198` — `clear()` runs before `window.location.href = res.checkoutUrl`.
- **Test:** `test.fixme('05-B3: …')`.

### 05-B4 · P2 (money, bounded) · a limited code can be used more times than its limit
- **Steps:** a code with `max_redemptions = 1`; two shoppers reach checkout before either pays.
- **Expected:** only one paid order gets the discount.
- **Actual:** both do — `expected [ {…}, {…} ] to have a length of 1 but got 2`.
- **Where:** `src/server/promos.ts:31-37` counts PAID orders at quote/placement time only; nothing re-checks at
  payment (`markOrderPaid`). Affects every capped campaign code (e.g. "first 100 customers").
- **Test:** `it.skip('05-B4: …')`.

### 05-B5 · P2 · confirmation email and /orders list the bundle as its internal pieces, with odd prices and raw SKUs
- **Steps:** order a christmas bundle for 4 + 2 mugs + a 4-pack of coasters.
- **Expected:** "christmas family bundle · a set for 4 — £145", readable names, the savings shown so lines add up.
- **Actual (captured email):**
  ```
  · placemats — £63.26
  · coaster-packof4 — £19.46
  · ceramic christmas ornament × 4 — £62.28
  · mug × 2 — £36
  · coaster-packof4 — £26
  Total £192.60, delivery included
  ```
  The lines add to £207 with no saving lines (multi-buy £5.40 + same-parcel £9 are missing); placemats show £63.26
  though placemats sell for £60; variant SKUs show raw (`coaster-packof4`).
- **Where:** `src/server/orderEmails.ts:22,41` (`labelOf` + per-`order_items` lines); `/orders` uses the same lines and
  labels (`src/app/orders/page.tsx:66`) — I verified the data and the code; I did not render `/orders` with a bundle.

### 05-B6 · P2 · the gift note and the receipt email are thrown away
- **Steps:** checkout → "Sending this as a gift?" on → type a note → (desktop) type an email under "email for your
  receipt" → checkout.
- **Expected:** the note travels with the order (or the box isn't offered).
- **Actual:** the request carries `"gift":true` but neither the note nor the email
  (`[{"items":[…],"gift":true,"subject":"$undefined","promoCode":"$undefined"}]`).
- **Where:** `src/app/checkout/page.tsx:442` (`<textarea>` with no state) and `:471` (`email-d`, state never sent);
  `placeOrderAction` (`src/app/actions/order.ts:29-47`) has no field for either.
- **Test:** `test.fixme('05-B6: …')`; `gift-note.png`.

### 05-B7 · P3 · "No account needed" for a basket that needs an account
- **Steps:** as a guest, upload → bundle tile → add the set for 2 → /checkout.
- **Expected:** the magic-link sign-up line (the server will ask for it).
- **Actual:** "No account needed. Checkout as a guest"; tapping checkout then sends them to /login.
- **Where:** `src/app/checkout/page.tsx:46` — `hasPersonalised` counts only `artwork` / `cards`, not bundle or
  calendar lines. `test.fixme('05-B7: …')`.

### 05-B8 · P3 (launch question) · a held drawing just says "hmm, that didn't go through — try again"
- **Steps:** on a server with no IWF (production holds every upload for review) → basket → checkout.
- **Actual:** generic toast (`held-drawing-checkout.png`); trying again can never work until a reviewer clears it.
- **Where:** `src/app/actions/order.ts:129` swallows the "not cleared for printing" error into `{ ok: false }`.
- **Founder question:** unless IWF is onboarded or someone clears each upload in the review queue, every
  personalised checkout on the live site will end in this message. Worth confirming before the Christmas push.

### 05-B9 · P3 · a forged basket line with no drawing becomes a paid "blank" order
- A hand-crafted `placeOrderAction` with `{productKey:'mug', qty:1}` and no `artwork` is accepted for a guest and
  priced (existing `orders.int` "guest order" places exactly this). Fulfilment then parks it as "manual only".
  Not reachable from the UI. `src/server/orders.ts:313-314` (`if (!art) continue;`).

## Notes (not bugs — decisions or stale tests)
- **N1 — family set vs multi-buy.** 2 kids tees + an adult tee: checkout now gives "Buy more & save −£7.50" (15 % on
  the tees) instead of "Family set saving −£4.10", per the best-single-saving rule — the customer pays less (£74.50).
  The existing `e2e/family-set.spec.ts` still expects £4.10 and fails; the builder sheet still promises "add 1 more
  piece and 5% comes off". Copy and test need updating, not the money.
- **N2 — a code in a bundle basket.** `£10 off £60` + bundle (£78) + mug: the bundle's £78 counts toward the £60
  minimum, the code comes off the mug only, capped by the margin guard to £4.55, and replaces the £3 same-parcel
  saving (total £91.45 instead of £93). Bundle alone: code not used. Bundle + framed print: £10 off.
  Intended per `bundle.test` ("the code still works on the rest of the basket") — founder to confirm the minimum
  spend should count the bundle.
- **N3 — FIVEOFF minimum.** The brief says £5 off £40; `project-office/briefs/DISCOUNTS.md` says £5 off £30+.
  Codes are DB rows, so this is just which value to create.
- **N4 — guest referral reuse.** `resolvePromo` checks first-order-only only for a known buyer
  (`src/server/promos.ts:37`); a guest is anonymous at checkout. Already listed as "Not yet" in DISCOUNTS.md.
- **N5 — card-pack e2e is stale.** Card 1 is now pre-filled with the current drawing; the spec expects 5 empty
  slots. UI change, no price impact (tester 02's area).
- **N6 — Stripe shows "Back to Snicker" / "Pay securely at Snicker".** Check the Stripe account's public business
  name (test mode at least).
- **N7 — "guest checkout one tap away".** Every shop product is personalised, so a guest always meets the magic-link
  sign-up at checkout (by design: the parent must control the keepsake). Only gift-link purchases are true guest
  checkouts. Mentioning it because CLAUDE.md promises guest checkout one tap away.
- **N8 — confirmation page** says "Thank you — it's being made" for any well-formed ref, including before the webhook
  lands. No private data is shown, so cosmetic.

## (c) Not tested, and why
- **Stripe's own address validation** (bad postcodes etc.) — that's Stripe's form; I only checked GB-only and that
  the address reaches the order.
- **Prodigi actually downloading the print file** — local files sit on localhost MinIO, which Prodigi can't reach;
  the sandbox smoke checks the order shape only.
- **Live webhook delivery from Stripe** — Stripe can't reach localhost and the CLI is off-limits, so I signed real
  events myself with `STRIPE_WEBHOOK_SECRET` (same check the route runs).
- **Mouse-hover fade on the add-on "+"** — checked it's visible without hover; no hover-only behaviour asserted.
- **`/orders` rendering a bundle order** — data and code verified (B5); not rendered in a browser.
- **Seen, not chased (other testers' areas):** the server log repeats
  `[mockup] compose failed, serving fallback: authz denied: no active membership in the asset family` during these
  runs; opening `/customize/christmasBundle` by URL (instead of from the range tile) loses the drawing in progress.
