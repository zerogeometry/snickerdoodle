import { createHmac } from 'node:crypto';
import { test, expect, type Page } from './test';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { gbp, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * SAMPLE ORDERS AT COST (founder, 25 Nov 2026; src/server/samples.ts): in the real checkout page,
 *  - a customer never sees "order as a sample", and asking the server for one anyway gets the shelf price;
 *  - an admin without two-step login doesn't see it either; with two-step login done, the switch appears, the
 *    basket is re-priced at cost by the server (a card fee line, no code box) and the order is marked a sample.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database)');

// screenshots stay local (gitignored): they show prices worked out from the real costs, which never go in the repo
const SHOTS = 'test-results/admin-samples';
const SWITCH = 'Order as a sample, at cost';

// RFC 6238 (HMAC-SHA1, 30 s, 6 digits) — what an authenticator app computes from the shown key.
function totp(b32: string, at = Date.now()): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of b32.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, '0');
}

/** Signed in as `email`, one drawing on a mug in the basket (cleared for printing), at /checkout. */
async function mugInBasket(page: Page, email: string) {
  await quietCookies(page);
  await signInByEmailLink(page, email, '/start-creating');
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: 'customize doodle mug', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/mug/);
  await page.getByRole('button', { name: /add to basket/i }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const ids: string[] = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.map((i: { artwork?: { assetId: string } }) => i.artwork?.assetId).filter(Boolean));
  await sql()`update assets set moderation_status = 'CLEAR' where id = any(${ids}::uuid[])`;
  await clearForTest(email);
}

async function mugPrice(page: Page): Promise<number> {
  const sku = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items[0].sku ?? 'mug');
  const [row] = await sql()`select price_pence from product_variants where sku = ${sku}`;
  return Number(row!.price_pence);
}

/** Record the next-action ids the page uses, so a test can call the same server action with its own body. */
function recordActions(page: Page) {
  const seen: { id: string; body: string }[] = [];
  page.on('request', (r) => {
    const id = r.headers()['next-action'];
    if (id && r.method() === 'POST') seen.push({ id, body: r.postData() ?? '' });
  });
  return seen;
}

const callAction = (page: Page, actionId: string, args: unknown[]) =>
  page.evaluate(
    async ({ actionId, body }) => (await fetch('/checkout', { method: 'POST', headers: { 'next-action': actionId, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' }, body })).text(),
    { actionId, body: JSON.stringify(args) },
  );

test.describe('sample orders at cost', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a customer never sees the switch, and asking the server for a sample anyway gets the shelf price', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const actions = recordActions(page);
    await mugInBasket(page, testEmail('samplecustomer'));
    await page.goto('/checkout');
    const price = await mugPrice(page);
    const aside = page.locator('aside');
    await expect(aside.locator('dl > div').last()).toContainText(gbp(price));
    await expect(page.getByRole('switch', { name: SWITCH })).toHaveCount(0);

    const quoteCall = actions.find((a) => a.body.includes('"items"') && !a.body.includes('artwork'));
    expect(quoteCall, 'the page asked the server for a quote').toBeTruthy();
    const forged = { ...JSON.parse(quoteCall!.body)[0], sample: true, isAdmin: true, mfaVerified: true };
    const text = await callAction(page, quoteCall!.id, [forged]);
    expect(text).toContain(`"totalPence":${price}`);
    expect(text).not.toContain('"sample":{');
    expect(text).not.toContain('sampleAvailable');
  });

  test('an admin with two-step login done orders at cost: the switch, the server’s cost price, and a sample order', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const email = testEmail('sampleadmin');
    await mugInBasket(page, email);
    await sql()`update accounts set is_admin = true where email = ${email}`;
    const price = await mugPrice(page);

    // an admin WITHOUT two-step login: no switch
    await page.goto('/checkout');
    await expect(page.locator('aside dl > div').last()).toContainText(gbp(price));
    await expect(page.getByRole('switch', { name: SWITCH })).toHaveCount(0);

    // two-step login (enrol, as the admin app asks)
    await page.goto('/admin/review');
    await page.getByRole('button', { name: 'start set-up' }).click();
    const key = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.getByLabel('six-digit code from your authenticator app').fill(totp(key));
    await page.getByRole('button', { name: 'continue' }).click();
    await expect(page.getByRole('list', { name: 'held back for review' })).toBeVisible();

    await page.goto('/checkout');
    const toggle = page.getByRole('switch', { name: SWITCH });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false'); // off until asked
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const aside = page.locator('aside');
    await expect(aside.getByText('Card fee', { exact: true })).toBeVisible();
    await expect(aside.getByLabel('got a code?')).toHaveCount(0); // codes never ride on a sample
    const totalText = (await aside.locator('dl > div').last().innerText()).replace(/[^0-9.]/g, '');
    const total = Math.round(Number(totalText) * 100);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(price);
    await page.screenshot({ path: `${SHOTS}/checkout-sample-desktop-1280.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('switch', { name: SWITCH })).toBeVisible();
    await page.getByRole('switch', { name: SWITCH }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/checkout-sample-phone-390.png`, fullPage: true });

    // place it: the order the server writes is a sample at that total (Stripe test mode, or the dev mark-paid path)
    const me = (await sql()`select id from accounts where email = ${email}`)[0]!.id as string;
    const since = new Date(Date.now() - 1000);
    await page.getByRole('region', { name: 'your total' }).getByRole('button', { name: /^checkout$/ }).click();
    await expect
      .poll(async () => (await sql()`select is_sample, total_pence from orders where account_id = ${me} and created_at >= ${since}`).map((r) => [r.is_sample, Number(r.total_pence)]), { timeout: 30_000 })
      .toEqual([[true, total]]);
  });
});
