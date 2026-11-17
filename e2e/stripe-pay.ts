import Stripe from 'stripe';
import { expect, type Frame, type Locator, type Page } from '@playwright/test';

/**
 * Stripe TEST mode, shared by the checkout sweep (checkout-sweep.spec.ts) and the first-order codes: fill the
 * hosted Checkout by its labels and pay, then deliver `checkout.session.completed` to our webhook signed with
 * STRIPE_WEBHOOK_SECRET exactly as Stripe signs it (no Stripe CLI). sk_test_ only.
 */
const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? '';
export const stripeTest = KEY.startsWith('sk_test_') && WHSEC.length > 0;
export const stripe = () => new Stripe(KEY);

/**
 * Stripe moves its hosted form around: once the fields sat on the page itself; since Nov 2026 the whole form
 * is inside an embedded Stripe frame (js.stripe.com "elements-inner-…"), with the card in a frame of its own.
 * So every field is looked for the way a person finds it (its label, else the standard autofill token)
 * in the page AND every frame Stripe has open, never by Stripe's internal ids.
 */
type Root = Page | Frame;
async function visibleIn(page: Page, make: (root: Root) => Locator, timeout: number): Promise<Locator | null> {
  const end = Date.now() + timeout;
  do {
    for (const f of page.frames()) {
      const l = make(f).first();
      if (await l.isVisible().catch(() => false)) return l;
    }
    await page.waitForTimeout(250);
  } while (Date.now() < end);
  return null;
}
const byField = (label: RegExp, autocomplete: string) => (r: Root) => r.getByLabel(label).or(r.locator(`input[autocomplete~="${autocomplete}"]`));
async function must(page: Page, make: (root: Root) => Locator, what: string, timeout = 15_000): Promise<Locator> {
  const l = await visibleIn(page, make, timeout);
  if (!l) throw new Error(`Stripe checkout: no ${what} found on the page or in its frames`);
  return l;
}

/** Is `text` showing anywhere on Stripe's page, its own frames included (e.g. "your card was declined")? */
export async function seenOnStripe(page: Page, text: RegExp, timeout = 60_000): Promise<boolean> {
  return !!(await visibleIn(page, (r) => r.getByText(text), timeout));
}

/** Fill Stripe Checkout (hosted, TEST mode) with a UK address and `card`, and press Pay. */
export async function payOnStripe(page: Page, card = '4242424242424242', email = 'c10-payer@example.test') {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const name = await must(page, byField(/^full name$/i, 'name'), 'name box', 45_000); // the form is up
  // a signed-in parent's email is handed to Stripe, which then shows it as plain text, not a box
  const mail = await visibleIn(page, byField(/^email$/i, 'email'), 1_000);
  if (mail && (await mail.isEditable().catch(() => false))) await mail.fill(email);
  await name.fill('Test Person');
  const manual = await visibleIn(page, (r) => r.getByRole('button', { name: /enter address manually/i }), 1_000);
  if (manual) await manual.click();
  await (await must(page, byField(/^address( line 1)?$/i, 'address-line1'), 'address line 1')).fill('1 Test Street');
  await (await must(page, byField(/^(town or city|city)$/i, 'address-level2'), 'town')).fill('London');
  await (await must(page, byField(/^(postal code|postcode)$/i, 'postal-code'), 'postcode')).fill('SW1A 1AA');
  let cardNumber = await visibleIn(page, byField(/^card number$/i, 'cc-number'), 1_000);
  if (!cardNumber) {
    // card is one of several payment methods: choose it
    const pick = await must(page, (r) => r.getByRole('radio', { name: /^card$/i }).or(r.getByRole('button', { name: /^(pay with )?card$/i })).or(r.getByTestId('card-accordion-item-button')), 'card choice');
    await pick.dispatchEvent('click');
    await pick.click({ force: true }).catch(() => {});
    cardNumber = await must(page, byField(/^card number$/i, 'cc-number'), 'card number box');
  }
  await cardNumber.fill(card);
  await (await must(page, byField(/^(expiration|expiry)/i, 'cc-exp'), 'expiry box')).fill('12 / 34');
  await (await must(page, byField(/cvc/i, 'cc-csc'), 'CVC box')).fill('123');
  const same = await visibleIn(page, (r) => r.getByRole('checkbox', { name: /same as shipping/i }), 500);
  if (same && !(await same.isChecked())) await same.check();
  // never sign up to Stripe's "save my information" (it would ask for a phone number)
  const save = await visibleIn(page, (r) => r.getByRole('checkbox', { name: /save my information/i }), 500);
  if (save && (await save.isChecked())) await save.uncheck();
  await (await must(page, (r) => r.getByRole('button', { name: 'Pay', exact: true }).or(r.getByTestId('hosted-payment-submit-button')), 'Pay button')).click();
}

/** Deliver the paid session to our webhook, signed as Stripe signs it. Returns the HTTP status. */
export async function deliverPaid(page: Page, sessionId: string): Promise<number> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const event = { id: `evt_c10_${Date.now()}`, object: 'event', type: 'checkout.session.completed', api_version: '2025-01-27', created: Math.floor(Date.now() / 1000), data: { object: session } };
  const payload = JSON.stringify(event);
  const header = stripe().webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const res = await page.request.post('/api/webhooks/stripe', { data: payload, headers: { 'stripe-signature': header, 'content-type': 'application/json' } });
  return res.status();
}
