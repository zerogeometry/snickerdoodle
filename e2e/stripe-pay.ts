import Stripe from 'stripe';
import { expect, type Page } from '@playwright/test';

/**
 * Stripe TEST mode, the way the checkout sweep (checkout-sweep.spec.ts) pays: fill the hosted Checkout
 * by its labels and pay, then deliver `checkout.session.completed` to our webhook signed with
 * STRIPE_WEBHOOK_SECRET exactly as Stripe signs it (no Stripe CLI). sk_test_ only.
 */
const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? '';
export const stripeTest = KEY.startsWith('sk_test_') && WHSEC.length > 0;
export const stripe = () => new Stripe(KEY);

export async function payOnStripe(page: Page, card = '4242424242424242') {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const field = (label: RegExp, autocomplete: string) => page.getByLabel(label).or(page.locator(`input[autocomplete~="${autocomplete}"]`)).first();
  const name = field(/^full name$/i, 'name');
  await expect(name).toBeVisible({ timeout: 30_000 });
  // a signed-in parent's email is handed to Stripe, which then shows it as plain text, not a box
  const email = field(/^email$/i, 'email');
  if (await email.count()) await email.fill('c10-payer@example.test');
  await name.fill('Test Person');
  const manual = page.getByRole('button', { name: /enter address manually/i });
  if (await manual.isVisible().catch(() => false)) await manual.click();
  await field(/^address( line 1)?$/i, 'address-line1').fill('1 Test Street');
  await field(/^(town or city|city)$/i, 'address-level2').fill('London');
  await field(/^(postal code|postcode)$/i, 'postal-code').fill('SW1A 1AA');
  const cardNumber = field(/^card number$/i, 'cc-number');
  if (!(await cardNumber.isVisible())) {
    // card is one of several payment methods: open it (the accordion button sits under an overlay)
    await page.getByRole('button', { name: /^pay with card$/i }).or(page.getByTestId('card-accordion-item-button')).first().dispatchEvent('click');
  }
  await cardNumber.fill(card);
  await field(/^(expiration|expiry)/i, 'cc-exp').fill('12 / 34');
  await field(/cvc/i, 'cc-csc').fill('123');
  const same = page.getByRole('checkbox', { name: /same as shipping/i });
  if ((await same.count()) && !(await same.first().isChecked())) await same.first().check();
  // never sign up to Stripe's "save my information" (it would ask for a phone number)
  const save = page.getByRole('checkbox', { name: /save my information/i });
  if ((await save.count()) && (await save.first().isChecked())) await save.first().uncheck();
  await page.getByRole('button', { name: 'Pay', exact: true }).or(page.getByTestId('hosted-payment-submit-button')).first().click();
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
