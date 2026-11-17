# End-to-end sweep, 17 Nov 2026

**What was tested:** the code that went live this morning, build `20261117-0808-97df5b6`. It adds the free first card and partner commission (#74) on top of last night's admin app, the print accuracy work and the sign-in fix.

**Where:** a fresh production build on this PC (`next build` + `next start`), against the local test database and storage. Payments used Stripe TEST mode only. The live site was checked read-only: no uploads, sign-ins or orders.

## Results at a glance

| Check | Result |
| --- | --- |
| Live site after the deploy | Smoke test passed: health, home page, security headers, https redirect, jobs closed to the internet, a mockup render. All 30 public pages checked load. Signed-in pages redirect to sign-in. `/admin` is hidden from the public. |
| Live wording | "5% off" for joining is gone everywhere. The gifts page now says "join the family and never miss a birthday". |
| Browser journeys (Playwright, 248 tests) | First run: 224 passed, 16 failed, 8 skipped. All 16 traced to out-of-date tests or a test-speed race (below). After the fixes, every one of the 16 passes. |
| Unit and integration (Vitest, 2,764 tests) | Full run: 2,732 passed, 13 failed, 19 skipped. 12 of the failures pass when their files run on their own (they clash over the shared local database, or time out under load). The 13th is the tube sock alignment check, which reads the local database's old tube sock photos (see Tube socks). |

## The 16 browser failures, and what was done

1. **Stripe's payment page changed (5 tests).**
   - Stripe now puts its whole checkout form inside its own embedded frame, so the tests couldn't find the name box. Customers can still pay; this is how Stripe draws the page.
   - The shared helper `e2e/stripe-pay.ts` now looks for each field on the page and in every Stripe frame, by its label. It also chooses "Card" from the new payment list, and leaves the email alone when Stripe has locked it for a signed-in parent.
   - The checkout sweep now uses the same helper.
   - Passing now: paid card, declined card, 3-D Secure, a creator code, and a free-card code.
2. **The Christmas sack is off sale (3 tests).** It was taken off sale in the print accuracy work (16 Nov), but three tests still opened it. The views test drops it. The double-tap fit/fill test uses the adults' tee instead (also a tall print panel that fits a square drawing by default).
3. **Sign-in now remembers where you were going (4 tests).** Since 10 Nov, `/account` sends a signed-out visitor to `/login?next=%2Faccount`, so they come back afterwards. The tests expected plain `/login` and now accept both.
4. **Instant previews in season (2 tests).**
   - The tests expected at least 3 of the first six products to be drawn straight away in the browser.
   - With Christmas leading the range, the first six are the bundle, the ceramic ornament, the bauble, the card packs, the wrapping paper and the mug. Only the ornament and the bauble can be drawn in the browser; the rest always wait for the server's photo.
   - The tests now count across the whole range, or expect the two that can be drawn. The "within ~1 second" timing check is unchanged and passes.
5. **Phone case picker (1 test): a real, if tiny, bug, fixed.**
   - When the phone box loses focus, a short timer (0.12 s) closes its list, so a tapped option lands first.
   - If the box was used again before that timer ran, the old timer still closed the fresh list. The test types fast enough to hit this; a person almost never would.
   - `PhoneModelPicker` now cancels that timer when the box is used again. The test passes on a rebuilt server.
6. **Fulfilment job, second tick (1 test): local data, not a bug.**
   - The local database holds 69 old paid test orders, mostly marked "artwork render failed: no source asset (purged?)", 20 held at the image-egress gate, and 7 with a Windows file error.
   - The job takes them a batch at a time, so the second tick picks up the next batch.
   - Every failure path parks the order with backoff (checked in `src/fulfillment/submit.ts`). Nothing for live to act on.

## Tube socks

- The tube sock photo set was resized slightly to Prodigi's new 300 × 520 mm template.
  - The left sock is about 2% narrower and very slightly longer. Nothing was rotated.
  - Preview-to-print mismatch went from 2.1% to 0.4% and 0.5% (the limit is 2%).
- Swapped onto the live server with the founder's OK. The old set is kept as `socks/tube.before-template-2026-11-17` on the server and on this PC.
- The local database still has the old set, which is why the one local alignment check fails.
- **The product page photo is a fixed picture and proves nothing about the print mapping.** It does not count as a pass for either sock.

## Not covered

- Real (live-mode) payments, and anything that would write to the live database.
- The phone apps. The latest store builds (Android 14, iPhone 21, from 13 Nov) are missing Draw #55 (the real build number in "report a problem") and #56 (the desk trimmed off on the phone). #55 adds a native module, so new store builds are needed; an over-the-air update won't do.
- Stripe's refund and chargeback events reach the site only once the founder adds them to the webhook endpoint (`charge.refunded`, `charge.dispute.created/updated/closed`).

## Also noticed

- On a first visit, the cookie banner covers the header (minor).
- The free first card only comes off when the rest of the order still leaves a 10% margin. With real Prodigi costs, a card beside a mug qualifies. A brand-new database still carries old placeholder card costs, under which it wouldn't.
- The Next.js build stops once with a "known security vulnerability" notice before building on a retry. Worth a Next.js upgrade as its own piece of work.
