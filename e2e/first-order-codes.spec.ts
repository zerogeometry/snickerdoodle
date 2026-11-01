import { test, expect, type Page } from './test';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { gbp, quietCookies, uploadAndOpenRange } from './helpers';
import { deliverPaid, payOnStripe, stripe, stripeTest } from './stripe-pay';

/**
 * C10 — a FIRST order with each kind of first-order code, in the real pages, paid in Stripe TEST mode:
 *  - a creator code (10% off for the follower, 5% to the creator): the saving shows at checkout, Stripe
 *    charges exactly the server's total, and once paid the order carries the creator's commission —
 *    then the same parent's next basket is told the code is for a first order;
 *  - a free-card code: one greetings card's price comes off (delivery unchanged), Stripe charges the rest.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database)');
test.skip(!stripeTest, 'needs STRIPE_SECRET_KEY=sk_test_… and STRIPE_WEBHOOK_SECRET');
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const SHOTS = 'reports/c10-first-order-codes';

/** Add the shopper's drawing on `product` to the basket from the range (uploading once if needed). */
async function addToBasket(page: Page, product: 'mug' | 'greetings card', key: string) {
  const tile = page.getByRole('button', { name: `customize ${product}`, exact: true });
  // a returning shopper's drawing comes back with its range (once it's made); a new one uploads first
  const upload = page.getByRole('button', { name: /upload a drawing/i });
  await expect(tile.or(upload).first()).toBeVisible({ timeout: 45_000 });
  if (!(await tile.isVisible())) await uploadAndOpenRange(page);
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/customize/${key}`));
  await page.getByRole('button', { name: /add to basket/i }).click();
  await expect(page).toHaveURL(/\/start-creating/);
}

/** The e2e server holds every upload for review (no IWF) — stand in for the reviewer, then open checkout. */
async function toCheckout(page: Page, parent: string) {
  const ids: string[] = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.map((i: { artwork?: { assetId: string } }) => i.artwork?.assetId).filter(Boolean),
  );
  await sql()`update assets set moderation_status = 'CLEAR' where id = any(${ids}::uuid[])`;
  await clearForTest(parent);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
}

async function applyCode(page: Page, code: string) {
  const box = page.getByLabel('got a code?').locator('visible=true').first();
  await box.fill(code);
  await box.press('Enter');
}

const priceOf = async (sku: string) => Number((await sql()`select price_pence from product_variants where sku = ${sku}`)[0]!.price_pence);
const basketSkus = (page: Page): Promise<string[]> =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.map((i: { sku?: string; product: string }) => i.sku ?? i.product));
const lastOrderOf = async (email: string) => (await sql()`select o.* from orders o join accounts a on a.id = o.account_id where a.email = ${email.toLowerCase()} order by o.created_at desc limit 1`)[0]!;

/** Pay the checkout on Stripe, come back to the confirmation, and have the webhook mark it paid. */
async function checkoutAndPay(page: Page, parent: string) {
  await page.getByRole('button', { name: /^checkout$/ }).locator('visible=true').first().click();
  await payOnStripe(page);
  await page.waitForURL(/\/checkout\/confirmation\?ref=SNK-\d{6}/, { timeout: 90_000 });
  const pending = await lastOrderOf(parent);
  const session = await stripe().checkout.sessions.retrieve(pending.stripe_session_id);
  expect(session.livemode).toBe(false);
  expect(session.payment_status).toBe('paid');
  expect(session.amount_total).toBe(pending.total_pence); // Stripe charged exactly the server's total
  expect(await deliverPaid(page, pending.stripe_session_id)).toBe(200);
  const paid = await lastOrderOf(parent);
  expect(paid.status).toBe('PAID');
  return paid;
}

test('a creator code on a first order: 10% off at checkout, charged exactly, the creator earns once — and not on the next order', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const code = `C10MAKES${Date.now().toString(36).toUpperCase().slice(-5)}`;
  await sql()`insert into promo_codes (code, kind, value, commission_bps, partner_type, partner_name, partner_email)
              values (${code}, 'PERCENT', 1000, 500, 'INFLUENCER', 'a test creator', ${`creator-${code.toLowerCase()}@example.test`})`;
  try {
    const parent = testEmail('c10follower');
    await quietCookies(page);
    await signInByEmailLink(page, parent, '/start-creating');
    await addToBasket(page, 'mug', 'mug');
    await toCheckout(page, parent);
    const price = await priceOf((await basketSkus(page))[0]!);
    await applyCode(page, code);
    const aside = page.locator('aside');
    await expect(aside.getByRole('status')).toHaveText(`${code} applied ✦`);
    const off = Math.round(price / 10);
    await expect(aside.getByText(`Code ${code}`)).toBeVisible();
    await expect(aside.getByText(`−${gbp(off)}`)).toBeVisible();
    await expect(aside.locator('dl > div').last()).toContainText(gbp(price - off));
    await page.screenshot({ path: `${SHOTS}/creator-code-applied.png` });

    const paid = await checkoutAndPay(page, parent);
    expect(paid.promo_saving_pence).toBe(off);
    expect(paid.total_pence).toBe(price - off);
    // the creator's 5% of the discounted ex-VAT goods, settled when it was paid
    expect(paid.partner_commission_pence).toBe(Math.round(((price - off) / 1.2) * 0.05));

    // the same parent, a second basket: the code is for a first order — full price, nothing to the creator
    await page.goto('/start-creating');
    await addToBasket(page, 'mug', 'mug');
    await toCheckout(page, parent);
    await applyCode(page, code);
    await expect(aside.getByRole('status')).toHaveText(/that code is for a first order/);
    await expect(aside.getByText(`Code ${code}`)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/creator-code-second-order.png` });
  } finally {
    await sql()`delete from promo_codes where code = ${code}`;
  }
});

test('a free-card code on a first order: one greetings card comes off, delivery unchanged, Stripe charges the rest', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const code = `C10CARD${Date.now().toString(36).toUpperCase().slice(-5)}`;
  await sql()`insert into promo_codes (code, kind, value) values (${code}, 'FREE_CARD', 0)`;
  // A test database's stand-in costs post every item at £4.49, which makes a £5.50 card dearer than its
  // price — so no basket could carry it free. Give the card a real-world landed cost for this test.
  const [before] = await sql()`select unit_cost_pence from product_variants where sku = 'card'`;
  await sql()`update product_variants set unit_cost_pence = 236 where sku = 'card'`;
  try {
    const parent = testEmail('c10card');
    await quietCookies(page);
    await signInByEmailLink(page, parent, '/start-creating');
    await addToBasket(page, 'greetings card', 'card');
    await addToBasket(page, 'mug', 'mug');
    await toCheckout(page, parent);
    const skus = await basketSkus(page);
    const card = await priceOf(skus.find((s) => s.startsWith('card'))!);
    const mug = await priceOf(skus.find((s) => s.startsWith('mug'))!);
    await applyCode(page, code);
    await expect(page.getByRole('status').filter({ hasText: code }).first()).toHaveText(`${code} applied — one greetings card is on us ✦`);
    const line = page.getByText(`Free card (${code})`).locator('visible=true').first();
    await expect(line).toBeVisible();
    await expect(page.getByText(`−${gbp(card)}`).locator('visible=true').first()).toBeVisible();
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/free-card-applied-390.png` });

    const paid = await checkoutAndPay(page, parent);
    expect(paid.promo_saving_pence).toBe(card);
    expect(paid.delivery_pence).toBe(0); // delivery rules unchanged (free delivery)
    expect(paid.total_pence).toBe(mug);
    expect(paid.partner_commission_pence).toBe(0);
  } finally {
    await sql()`update product_variants set unit_cost_pence = ${before?.unit_cost_pence ?? null} where sku = 'card'`;
    await sql()`delete from promo_codes where code = ${code}`;
  }
});
