# Test sweep 2026-10-29 — 06 · Gifts & sharing

Tester 06 · branch `claude/sweep-6-gifts-55fd0c` (cut from `feat/christmas-season` @ d6f890b) · own DB `snickerdoodle_t6` · own production build on :3206.

## How this was run

- **Server:** `next build` into `.next-e2e`, then `next start -p 3206` with `MAIL_PROVIDER=console`, local MinIO KMS key, `APP_URL/AUTH_URL=http://localhost:3206`. The catalogue and mockups were seeded through the real job endpoints (`/api/jobs/seed-catalogue` → 32 products / 480 variants; `/api/jobs/seed-mockups` → 365 authored).
- **Stripe:** `.env` has a test key (`sk_test_…`, checked). On **my** server I blanked `STRIPE_SECRET_KEY`, so orders take the app's local "mark paid" path. I did this on purpose: with orders PAID I could test tick-off, "already bought", the parent's "from Granny ✓" and the one-time 5%. **The Stripe-hosted page itself was not exercised here** (the checkout tester covers it).
- **Prodigi:** sandbox URL is set in `.env`. No order was sent to Prodigi from these tests (fulfilment isn't part of this area).
- **Mail:** console mailer. I read the emails from the server log.
- **People:** signed in through the real email-link callback (`e2e/harness.ts`). The only stand-in is the content reviewer: the test marks its own test drawing CLEAR, as `gift-loop.spec.ts` already does.
- **Images:** only shapes drawn by the tests (`e2e/helpers.ts`). No real child's art.
- **Evidence:**
  - New spec `e2e/sweep-06-gifts.spec.ts`: **12 tests, all passing**, run twice in full (last run: 14/14 together with `e2e/gift-loop.spec.ts`, 1.1 min).
  - Screenshots in `shots/06/`.
  - Vitest: gift / wish / authz / pricing / status → **104/104 pass**; deletion / keepsakeReport / review / invites → **15/15 pass** (all against my DB, after seeding).

```
E2E_PORT=3206 npx playwright test e2e/sweep-06-gifts.spec.ts e2e/gift-loop.spec.ts   → 14 passed (1.1m)
node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/__tests__/giftLinks.int.test.ts src/server/__tests__/wish.int.test.ts src/authz/__tests__/giftLinkPurchase.test.ts "src/app/g/[token]/status.test.ts" src/pricing/__tests__/pricing.test.ts   → 104 passed
node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/__tests__/deletion.int.test.ts src/server/__tests__/keepsakeReport.int.test.ts src/server/__tests__/review.int.test.ts src/server/__tests__/invites.int.test.ts   → 15 passed
```

(Before seeding, `giftLinks.int` and `wish.int` failed with "that product can't be shared on a gift link". The catalogue was simply empty. Not a bug.)

---

## (a) Coverage checklist

`S` = test in `e2e/sweep-06-gifts.spec.ts` (quoted by its title start); `GL` = `e2e/gift-loop.spec.ts`; `V` = Vitest.

### Gift links — creating and opening

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Parent makes a gift request on /home (keepsake → framed print) and gets a `/g/<token>` link | PASS | S "a stranger sees ONLY…", GL |
| 2 | "Share a ready-to-buy link" from a **saved design** (mug "+ keepsake" on /customize) — designs come pre-ticked; the link carries the exact variant (`mug · 11oz · blue`, £18) | PASS | S "a saved design…"; `shots/06/gift-design-mug-phone.png` |
| 3 | Only the chosen keepsake is snapshotted; a second kept keepsake that wasn't picked is not on the link | PASS | S "a stranger sees ONLY…" (`items == [sharedAssetId]`) |
| 4 | Link lifetime is 14 days (`expires_at − created_at`) | PASS | S "a stranger sees ONLY…" |
| 5 | Token is random (24 bytes, base64url) | PASS (code) | `src/server/giftLinks.ts` `randomBytes(24)` |
| 6 | Signed-out stranger in a fresh browser at **390×844** and **1280×800** sees the list, the price and checkout | PASS | `shots/06/gift-link-stranger-phone.png`, `…-desktop.png` |
| 7 | The stranger's HTML holds no other keepsake id, no family id and no parent email; every `<img>` is this link's own preview | PASS | S "a stranger sees ONLY…" |
| 8 | Page is `noindex` (meta robots + `x-robots-tag: noindex, nofollow`, `cache-control: private, no-store`) | PASS | S + `curl -D -` of `/g/…`, `/join/…`, `/share-wish` |
| 9 | "Report this gift list" is on every live gift page (one tap, in the footer) | PASS | S "a stranger sees ONLY…" + screenshots |
| 10 | Brand look (D12 Scrapbook) on /g | FAIL (P3) | 06-B6 |

### Gift links — preview route `/api/gift/[token]/preview/[assetId]`

| # | Item | Result | Evidence |
|---|---|---|---|
| 11 | Own keepsake: 200, `image/webp`, ≤720 px, no EXIF, `x-robots-tag: noindex` | PASS | S "a stranger sees ONLY…" |
| 12 | Same family, kept and cleared, **not on the link** → bare 404 | PASS | same |
| 13 | **Another family's** keepsake through this token → bare 404 | PASS | same |
| 14 | Unknown uuid / not-a-uuid → bare 404 | PASS | same |
| 15 | One-character-off token / made-up token + a real asset id → bare 404 | PASS | same |
| 16 | Same answers with the parent's own signed-in cookies (the token is the only key) | PASS | same (run with both clients) |
| 17 | 404 bodies are empty (nothing to tell "link exists" from "keepsake exists") | PASS | same |
| 18 | Revoked / expired / deleted / reported / "only me" → preview 404 | PASS | S revoke, expired, deleted, report, "Only me" tests |
| 19 | Rate limit (600 / 10 min per IP → 429) | NOT TESTED | I didn't want to lock my own IP bucket mid-run; covered only by code read |

### Gift links — guessed or tampered tokens

| # | Item | Result | Evidence |
|---|---|---|---|
| 20 | One-char-off, made-up and case-flipped tokens → HTTP 404 and the same "This gift link isn't valid" card, word for word | PASS | S "a stranger sees ONLY…"; `shots/06/gift-link-tampered-phone.png` |
| 21 | Revoked/expired/gone links answer 410 with their own wording (only someone holding the real token can see that a link existed) | PASS (by design) | S revoke / expired / deleted |

### Gift links — life-cycle

| # | Item | Result | Evidence |
|---|---|---|---|
| 22 | **Revoke** from /home ("switch this link off" → "switch off"): link REVOKED, `GIFT_LINK_REVOKED` audited | PASS | S "revoke switches…" |
| 23 | A stranger's **already-open tab** can't buy after revoke ("changed by the family"); no order created | PASS | same |
| 24 | Reload → 410 "This gift list was turned off"; preview 404 | PASS | same; `shots/06/gift-link-revoked-phone.png` |
| 25 | **Expiry** → 410 "This gift list has expired"; preview 404 | PASS | S "an expired link…" (clock moved via `expires_at`) |
| 26 | **Deleted source**: parent deletes the keepsake in the UI (two taps) → asset row gone → link 410 "no longer available"; preview 404 | PASS | S "the parent deletes…" |
| 27 | Parent pulls the keepsake back to **Only me** → drops off the list (410 when it was the only item); preview 404; id absent from the HTML | PASS | S "a keepsake the parent pulls back…" |
| 28 | Uncleared / BLOCKED art can't be shared, and a link whose art becomes uncleared goes "gone" | PASS | V `giftLinks.int` |
| 29 | Parent's list after the link is reported/gone | FAIL (P3) | 06-B5 |

### Buying from a link

| # | Item | Result | Evidence |
|---|---|---|---|
| 30 | **Guest checkout at phone size**: button visible in the thumb zone, "who's it from?" → confirmation | PASS | S "a guest buys at phone size…"; `shots/06/gift-guest-confirmation-phone.png` |
| 31 | Guest order has no account and no family saving; `gift_from_name = Granny` | PASS | S + DB row `PAID|Granny|0|6500|0|6500|t` |
| 32 | List ticks itself off for the next relative ("already bought ✓", no checkout) **without saying who** | PASS | S; `shots/06/gift-all-bought-desktop.png` |
| 33 | Parent alone sees "from Granny ✓" / "1 of 1 bought"; parent gets the "Granny just bought…" email | PASS | S; server log `[gift-list] … Granny just bought a framed print` |
| 34 | **Gift price-hiding** | NOT APPLICABLE today | The buyer (payer) rightly sees prices. `recipientLineLabel()` (prices → "gift") is unit-tested (V pricing) but **nothing in the app calls it**: no recipient-facing slip or email exists to hide prices on. Prodigi packs no prices. Note for the founder rather than a bug. |
| 35 | **Join & checkout** (invite on the link) → verify by email link → ACTIVE membership at EXTENDED / VIEW_BUY → "welcome to the family — your 5% is applied" → order `join_saving = 5% of subtotal` (server-priced) | PASS (desktop GL; **phone** S) | S "invitee joins… at phone size"; `shots/06/gift-joined-5pc-phone.png`; DB row `325` off `6500` |
| 36 | Invite is spent after joining: a forwarded copy of the link no longer offers "join the family" | PASS | same |
| 37 | The 5% is **one-time**: a second link from the same family shows no Family saving | PASS | same |
| 38 | Button label for a signed-in member with no saving | FAIL (P3) | 06-B4 |
| 39 | A stranger signed in as someone else can't take the invite ("This invite is for someone else"), gets no membership and no saving | PASS | S "the join loop from a forwarded link…" |
| 40 | What a forwarded-link holder sees on /join | FAIL (P0 by the brief's rule) | 06-B1 |
| 41 | Saving earned in another family isn't honoured on this link | PASS (unit) | V pricing / `placeGiftLinkOrder` family check |

### Snapshot immutability

| # | Item | Result | Evidence |
|---|---|---|---|
| 42 | Saved design **edited** (placement moved) **and then removed from saved** after sharing → the link still sells the original variant and placement (`rotationDeg ≠ 33`, `scale ≠ 0.37` in `order_item_artwork`) | PASS | S "a saved design…" |
| 43 | `gift_links.items` never changes (after a reprice, edit or purchase) | PASS | S "snapshot — the shop reprices…" + V |
| 44 | Shop reprices after sharing → the line shows the frozen price, the total and the charge use the new price | FAIL (P2) | 06-B3 |
| 45 | A shared design's **cut-out** can be regenerated in place after sharing | SUSPECTED (P2, not reproduced) | 06-B7 |
| 46 | Preview for a design item shows the plain drawing, not the design | FAIL (P3) | 06-B8 |

### Report / takedown → the real deletion job

| # | Item | Result | Evidence |
|---|---|---|---|
| 47 | Signed-out stranger (desktop) reports: pick reason → "send report" → "Thank you for telling us" → "done" reloads to "no longer available" | PASS | S "report from a gift link…"; `shots/06/report-sent-desktop.png` |
| 48 | Takes effect **at once**: asset FLAGGED, first label "reported via a gift link"; `/g` 410; preview 404 | PASS | same (DB + HTTP) |
| 49 | Audited `CONTENT_FLAGGED`, actor `ANON` | PASS | same |
| 50 | Support inbox email (console): reason, "1 keepsake … now held", review link, runbook line, **no picture** | PASS | server log `[content-report] to support@snickerdoodle.co.uk` |
| 51 | Parent's home shows the keepsake as "being checked after a report" | PASS | same |
| 52 | Admin: `/admin/review` needs two-step login. Set up through the real UI (key shown → TOTP code → continue) | PASS | same |
| 53 | Queue: newest first, labelled "reported via a gift link, I don't know who sent this…", picture **hidden** until "look" | PASS | `shots/06/admin-review-reported-desktop.png` |
| 54 | "remove" → "yes, remove it" → "removed for good" → the **real cascading erase**: asset row gone, all `storage_objects` rows gone, `CONTENT_REVIEWED {decision: remove}` audited; link stays 410 | PASS | same |
| 55 | Honeypot / rate limit (10 per hour per IP) / invalid token | PASS (code + V `support.int`) | not driven by e2e |
| 56 | Report path where a **creation** is viewed inside the family (`reportKeepsakeAction`) | NOT MINE | family tester (04); V `keepsakeReport.int` passes |

### Share a Wish (`/share-wish`, `src/app/actions/wish.ts`)

| # | Item | Result | Evidence |
|---|---|---|---|
| 57 | Basket (socks) → "share a wish" → "Who's this for?" (Mia) → /share-wish asks a signed-out parent to sign up ("Let's save Mia's wish") | PASS | S "Share a Wish…"; `shots/06/wish-needs-auth-phone.png` |
| 58 | Magic-link round trip back to /share-wish; basket survives; "Mia's wish is ready ✦" with the link | PASS | `shots/06/wish-ready-phone.png` |
| 59 | Drawing kept into the home (FAMILY, filed under child "Mia"); link titled "Mia's wishlist" | PASS | S (DB) |
| 60 | Recipient (fresh desktop browser) opens it and buys as a guest | PASS | `shots/06/wish-recipient-desktop.png` |
| 61 | **Product on the wish link matches the basket** | FAIL (P1) | 06-B2 |
| 62 | Surname / abusive child name refused; BLOCKED/FLAGGED never shared; claims enforced | PASS | V `wish.int` (15 cases) |

### Gift-request email (step 2 of the modal)

| # | Item | Result | Evidence |
|---|---|---|---|
| 63 | Send to a typed address → "sent to 1 person"; email carries only the link (no picture), "it's private, and ticks itself off" | PASS | S "a saved design…"; server log `[gift-list] to e2e-auntie@example.test` |

**Totals (63 rows):** PASS 52 · FAIL 7 (06-B1, B2, B3, B4, B5, B6, B8) · SUSPECTED 1 (06-B7) · NOT TESTED 1 · NOT APPLICABLE 1 · NOT MINE 1.

Of the 52 PASS rows, 5 rest on code reading or unit/integration tests rather than this e2e (rows 5, 28, 41, 55, 62); each says so in its row.

---

## (b) Bugs

### 06-B1 · P0 (by the brief's rule; see note) — a forwarded gift link shows the invitee's email address to whoever holds it
- **Steps**
  1. Parent makes a gift request with "Also invite them to join the family" → granny@….
  2. Anyone the link was forwarded to opens `/g/<token>` signed out and taps **join the family · 5% off**.
- **Expected:** a neutral "this invite was sent to someone else — ask the family" (or a masked address, e.g. `gr•••@example.test`). Nothing about the invitee.
- **Actual:**
  - `/join/<token>` prints the invitee's **full email address** twice ("We'll send a one-tap link to **granny@…**", and the button "email granny@…").
  - Tapping that button sends a sign-in email to the invitee on the stranger's say-so.
  - If the stranger signs in as themselves, "This invite is for someone else" again names `granny@…`.
- **Evidence:** S "the join loop from a forwarded link…" (annotation `06-B1: invitee email shown to a signed-out link holder: true`); `shots/06/join-from-forwarded-link-phone.png`.
- **Suspected:** `src/app/join/[token]/JoinLogin.tsx:43,46` and `src/app/join/[token]/page.tsx` ("for someone else" card). The invite token is handed to every gift-link viewer by `getGiftLink` → `GiftCheckout` (`src/server/giftLinks.ts` `inviteToken`).
- **Note:** this is an adult relative's email, not a child's data, and it needs the link to be forwarded. The brief asks for "any place a stranger can see more than the one gift" to be P0, so it's filed P0. The founder may reasonably grade it P1/P2.
- Membership is safe: verification really does confirm identity, and no membership or saving is granted (row 39).

### 06-B2 · P1 — Share a Wish sells a framed print whatever was in the basket
- **Steps**
  1. Upload a drawing, customise **socks**, add to basket.
  2. Tap **share a wish**, name "Mia", sign up.
  3. Open the link.
- **Expected:** the wish offers what the child put in the basket (socks, at the socks price and their placement).
- **Actual:**
  - The link sells **`framedPrint` (framed print) at £65**. Annotation: `basket held socks; the wish link sells: framedPrint (framed print)`.
  - Every basket product, variant, placement and cut-out is dropped; only asset ids are sent.
  - A relative who buys gets a different product from the one the child chose, at a different price.
- **Evidence:** S "Share a Wish…"; `shots/06/wish-recipient-desktop.png`.
- **Suspected:**
  - `src/app/share-wish/page.tsx:53` sends only `assetIds`.
  - `src/server/wish.ts:76` calls `createGiftLink(…)` with no `productKey`/`designIds`, so the default `framedPrint` applies (`src/server/giftLinks.ts` `DEFAULT_GIFT_PRODUCT`).
  - `wish.int.test.ts` doesn't check the product, so it stays green.

### 06-B3 · P2 — after a price change, the gift page's line price and its total disagree
- **Steps**
  1. Share a link (framed print, £65).
  2. The variant's `price_pence` changes (seasonal price, catalogue sync). In the test: +£5.
  3. Open the link.
- **Expected:** one price everywhere. Either the frozen £65 is honoured or the line shows £70.
- **Actual:** the line says **£65**; "1 gift £70 · Total £70". Checkout charges the new price, because `placeGiftLinkOrder` → `placeOrder` re-prices from the live catalogue. The frozen `unitPricePence` is display-only.
- **Evidence:** S "snapshot — the shop reprices…" (annotation `line shows £65; summary: 1 gift £70 Delivery Free Total £70`); `shots/06/gift-repriced-phone.png`.
- **Suspected:** `src/app/g/[token]/GiftCheckout.tsx:92` renders `item.unitPricePence`, while `src/app/g/[token]/page.tsx:69` totals with the live `quote(...)`.
- Founder decision: should a gift link honour the shared price, or show the current one?

### 06-B4 · P3 — a signed-in family member is told "checkout as guest"
- **Steps**
  1. Granny joins via a link and uses her 5%.
  2. The parent shares a second link; granny opens it while signed in.
- **Expected:** "checkout".
- **Actual:** "checkout as guest". The order still attaches to her account, so only the label is wrong.
- **Evidence:** S "invitee joins… at phone size…"; `shots/06/gift-second-link-member-phone.png`.
- **Suspected:** `src/app/g/[token]/GiftCheckout.tsx:170`. The label keys on `joined` (saving > 0), not on being signed in.
- **Related:** "who's it from?" pre-fills with the email's local part (`e2e-granny-mvu3…`) when the account has no name (`src/app/g/[token]/page.tsx:75`). The parent's email and sticker then read "from jane.smith1957 ✓". Cosmetic.

### 06-B5 · P3 — the parent's list looks live after a report or a deleted keepsake
- **Steps:** report a link (or delete / make "only me" its keepsake), then open /home as the parent.
- **Expected:** the list says it's offline (being checked / no longer available).
- **Actual:** "gift request · 29 Oct · **0 of 1 bought** · framed print · switch this link off", as if it still works.
- **Evidence:** S "report from a gift link…" (annotation `06-B-owner-list-after-report`); `shots/06/parent-home-after-report-phone.png`.
- **Suspected:** `src/server/giftLinks.ts:436`. Owner status is only REVOKED / EXPIRED / ACTIVE and ignores the "gone" rules `getGiftLink` applies.

### 06-B6 · P3 — /g gift pages aren't in the Scrapbook look
- **Actual:**
  - Header is a plain text "snickerdoodle" wordmark (`src/app/g/[token]/page.tsx:26`), not the logo / `FlowHeader` that /join and /share-wish use.
  - Cards are flat `bg-white rounded-xl border-line`. No taped paper, ink outline or sticker.
  - The rest of the flow (/join, /share-wish) is in D12.
- **Evidence:** compare `shots/06/gift-link-stranger-phone.png` with `shots/06/join-from-forwarded-link-phone.png` / `wish-ready-phone.png`.
- **Note:** the /g mockup wasn't diffed here. If the mockup is the plain one, this is a D12 restyle task rather than a bug.

### 06-B7 · P2 (suspected — code reading, not reproduced) — a shared design's cut-out can change after sharing
- **What the code does:**
  - A saved design that uses a lifted cut-out freezes `sourceObjectId` into the link.
  - `removeBackgroundForAsset` → `storeCutout` (`src/server/magic.ts`) **overwrites the same storage object** (same key, same id) every time "lift it off the paper" runs on that drawing.
  - It has no "kept" check: `putBackgroundBack` refuses kept drawings, but lifting doesn't. The customise page runs it with `keepEnclosedPaper: true`, and the Studio may use other settings.
- **Effect:** re-lifting a kept drawing after sharing would silently change what the gift link prints.
- **Not reproduced** in the browser in this sweep. Worth one integration test: lift with `keepEnclosedPaper` false → save design → share → lift with true → compare `storage_objects.sha256` behind the link's `sourceObjectId`.

### 06-B8 · P3 — gift previews show the bare drawing, not the product as designed
- **Actual:** for a saved-design item ("mug · 11oz · blue") the thumbnail is the plain original drawing. The buyer never sees the mug, the placement or the cut-out (`src/server/giftLinks.ts:263` reads the ORIGINAL).
- **Evidence:** `shots/06/gift-design-mug-phone.png`.
- **Related:** `/join/<bad-token>` answers HTTP **200** with its "isn't valid" card (`/g` answers 404). Harmless; noted for consistency.

---

## (c) Not tested, and why

- **Stripe-hosted checkout** (`checkout.stripe.com`) and the paid webhook for gift orders. My server ran without the Stripe key so orders were marked paid locally. The checkout tester owns the Stripe leg.
- **Prodigi submission** of gift orders: no fulfilment run here.
- **Preview-route rate limit (429)**: not driven, to avoid locking my own IP bucket mid-run.
- **06-B7** (cut-out overwrite): code reading only.
- **Visual diff against /mockups** for /g, /join, /share-wish: not done. 06-B6 is from eye and brand-rule comparison only.
- **Invite left PENDING after its gift link is revoked.** By code reading, `revokeGiftLink` doesn't touch the embedded invite, so the invitee can still join from it. That's arguably right (the parent did invite them), but the parent may not expect it. Tester 04 should confirm the parent can see and cancel that invite on the family page.

## Files added

- `e2e/sweep-06-gifts.spec.ts` — 12 tests (all pass on :3206)
- `reports/test-sweep-2026-10-29/06-gifts-sharing.md` — this report
- `reports/test-sweep-2026-10-29/shots/06/*.png` — screenshots
