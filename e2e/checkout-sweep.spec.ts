import { test, expect, type Page } from './test';
import Stripe from 'stripe';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { gbp, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Test sweep 05 (29 Oct 2026) — basket, prices, checkout, orders, in the real pages.
 * Needs the local test database (sign-in) and, for the payment journeys, Stripe in TEST mode
 * (sk_test_ only — the spec refuses anything else). The webhook is driven by signing events with
 * STRIPE_WEBHOOK_SECRET exactly as Stripe does (no Stripe CLI). Mail is the console mailer.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database)');

const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const stripeTest = KEY.startsWith('sk_test_') && WHSEC.length > 0;
const SHOTS = 'reports/test-sweep-2026-10-29/shots/05';

/** A signed-in parent with one drawing on a mug in the basket, at /checkout. */
async function parentWithMug(page: Page, opts: { clear?: boolean } = {}) {
  const parent = testEmail('t5parent');
  await quietCookies(page);
  await signInByEmailLink(page, parent, '/start-creating');
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: 'customize mug', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/mug/);
  await page.getByRole('button', { name: /add to basket/i }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  // the e2e server holds every upload for review (no IWF) — stand in for the reviewer unless told not to
  if (opts.clear !== false) {
    // the basket's drawing is still a drawing-in-progress (filed into the family at order time), so clear it by id
    const ids: string[] = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.map((i: { artwork?: { assetId: string } }) => i.artwork?.assetId).filter(Boolean));
    await sql()`update assets set moderation_status = 'CLEAR' where id = any(${ids}::uuid[])`;
    await clearForTest(parent);
  }
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  return parent;
}

/** The server's own price for the basket's mug variant. */
async function mugPrice(page: Page): Promise<number> {
  const sku = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items[0].sku ?? 'mug');
  const [row] = await sql()`select price_pence from product_variants where sku = ${sku}`;
  return Number(row!.price_pence);
}

/** Record the next-action ids the page uses, so a test can call the same server action with a forged body. */
function recordActions(page: Page) {
  const seen: { id: string; body: string; url: string }[] = [];
  page.on('request', (r) => {
    const id = r.headers()['next-action'];
    if (id && r.method() === 'POST') seen.push({ id, body: r.postData() ?? '', url: r.url() });
  });
  return seen;
}

/** Call a server action exactly as the page does (same cookies, same action id), with OUR body. */
async function callAction(page: Page, actionId: string, args: unknown[]): Promise<string> {
  return page.evaluate(
    async ({ actionId, body }) => {
      const r = await fetch('/checkout', { method: 'POST', headers: { 'next-action': actionId, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' }, body });
      return r.text();
    },
    { actionId, body: JSON.stringify(args) },
  );
}

test.describe('checkout sweep 05', () => {
  // steady screenshots: the motion system is off under reduced motion (globals.css)
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('desktop: a line shows the server price; a forged quote (prices, join flag, saving bps) is ignored', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const actions = recordActions(page);
    await parentWithMug(page);
    const price = await mugPrice(page);
    const aside = page.locator('aside');
    await expect(aside.getByText('Total', { exact: true })).toBeVisible();
    await expect(aside.locator('dl > div').last()).toContainText(gbp(price));
    // the line shows THIS drawing on the mug (the real mockup), and the add-ons are offered
    const thumb = page.locator('main img[alt="your drawing on a mug"]').first();
    await expect(thumb).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => thumb.evaluate((i) => (i as HTMLImageElement).naturalWidth), { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/goes nicely with it/i)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/checkout-desktop-1280.png`, fullPage: true });

    const quoteCall = actions.find((a) => a.body.includes('"items"') && !a.body.includes('artwork'));
    expect(quoteCall, 'the page asked the server for a quote').toBeTruthy();
    const real = JSON.parse(quoteCall!.body)[0];
    const forged = {
      ...real,
      items: real.items.map((i: object) => ({ ...i, qty: 1, pricePence: 1, unitPricePence: 1, linePence: 1 })),
      joinContext: { familyId: 'x', inviteId: 'x', savingBps: 10000 },
      joinProvenance: { invite: { id: 'x', familyId: 'x', verified: true, revoked: false, expiresAt: 9e15 }, membership: { familyId: 'x', status: 'ACTIVE', inviteId: 'x', isOwner: false, savingConsumed: false }, now: 0 },
      joinSavingApplied: true,
      promo: { id: 'x', code: 'FREE', kind: 'FIXED', value: 999999, minSpendPence: 0, commissionBps: 0 },
      catalogue: { mug: { pricePence: 1, label: 'mug' } },
      creditAvailablePence: 999999,
    };
    const text = await callAction(page, quoteCall!.id, [forged]);
    expect(text).toContain(`"totalPence":${price}`);
    expect(text).toContain('"joinSavingPence":0');
    expect(text).toContain('"promoSavingPence":0');
    expect(text).toContain('"creditPence":0');
    expect(text).not.toContain('partnerCommissionPence');
  });

  test('phone 390: the layout fits, the total + checkout sit in the thumb zone', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await parentWithMug(page);
    const price = await mugPrice(page);
    const bar = page.getByRole('region', { name: 'your total' });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(gbp(price));
    const box = await bar.getByRole('button', { name: /^checkout$/ }).boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(844 * 0.75); // thumb zone
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); // no sideways scroll
    await page.screenshot({ path: `${SHOTS}/checkout-phone-390.png`, fullPage: true });
  });

  test('codes in the box: unknown / finished / under the minimum / applied — the saving line is the server’s', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const n = Date.now().toString(36).toUpperCase().slice(-5);
    const [ten, pct, old] = [`T5TEN${n}`, `T5PCT${n}`, `T5OLD${n}`];
    await sql()`insert into promo_codes (code, kind, value, min_spend_pence) values (${ten}, 'FIXED', 1000, 6000), (${pct}, 'PERCENT', 1000, 0)`;
    await sql()`insert into promo_codes (code, kind, value, ends_at) values (${old}, 'PERCENT', 1000, ${new Date(Date.now() - 60_000)})`;
    try {
      await parentWithMug(page);
      const price = await mugPrice(page);
      const aside = page.locator('aside');
      const box = aside.getByLabel('got a code?');
      const apply = async (code: string) => {
        await box.fill(code);
        await aside.getByRole('button', { name: 'apply' }).click();
      };
      await apply('NOPE-NOT-REAL');
      await expect(aside.getByRole('status')).toHaveText(/don’t recognise that code/);
      await apply(old);
      await expect(aside.getByRole('status')).toHaveText(/that code has finished/);
      await apply(ten);
      await expect(aside.getByRole('status')).toHaveText(new RegExp(`works on orders over £60`));
      await expect(aside.locator('dl > div').last()).toContainText(gbp(price));
      await apply(pct);
      await expect(aside.getByRole('status')).toHaveText(/applied/);
      const off = Math.round(price * 0.1);
      await expect(aside.getByText(`Code ${pct}`)).toBeVisible();
      await expect(aside.getByText(`−${gbp(off)}`)).toBeVisible();
      await expect(aside.locator('dl > div').last()).toContainText(gbp(price - off));
      await page.screenshot({ path: `${SHOTS}/promo-applied.png` });
    } finally {
      await sql()`delete from promo_codes where code in (${ten}, ${pct}, ${old})`;
    }
  });

  test('buy more & save: 2 mugs — the dropdown, the struck line price and the total are exactly the server’s quote', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const actions = recordActions(page);
    await parentWithMug(page);
    const price = await mugPrice(page);
    await page.getByRole('button', { name: /how many mug/ }).click();
    const two = page.getByRole('option', { name: /^2/ });
    await expect(two).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/multibuy-dropdown.png` });
    await two.click();
    const aside = page.locator('aside');
    await expect(aside.getByText('Buy more & save')).toBeVisible({ timeout: 30_000 });
    await expect(aside.getByText('Same-parcel saving')).toBeVisible();
    // ask the server for the same quote the page just asked for (same action, same body) — the figures to match
    const asked = actions.filter((a) => a.body.includes('"qty":2') && !a.body.includes('artwork')).at(-1);
    expect(asked, 'the page re-quoted for 2').toBeTruthy();
    const text = await callAction(page, asked!.id, JSON.parse(asked!.body));
    const q = JSON.parse(/\{"lines".*\}/.exec(text)![0]);
    expect(q.subtotalPence).toBe(2 * price);
    expect(q.multiBuySavingPence).toBeGreaterThan(0);
    expect(q.parcelSavingPence).toBe(300);
    await expect(aside.getByText(`−${gbp(q.multiBuySavingPence)}`)).toBeVisible();
    await expect(aside.locator('dl > div').last()).toContainText(gbp(q.totalPence));
    await expect(page.locator('main').getByText(gbp(2 * price - q.multiBuySavingPence), { exact: true })).toBeVisible(); // the line's new price
    await page.screenshot({ path: `${SHOTS}/multibuy-two-mugs.png` });
  });

  test('add-ons: the shopper’s own drawing, never what’s already in the basket, "+" adds it at the server price', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await parentWithMug(page);
    const region = page.getByRole('region', { name: /goes nicely with it/ });
    await expect(region).toBeVisible({ timeout: 30_000 });
    const plus = region.getByRole('button', { name: /^add a .* with your drawing$/ });
    await expect(plus.first()).toBeVisible(); // "+" visible without hover (phone)
    const labels = await plus.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels.some((l) => /\bmug\b/.test(l ?? ''))).toBe(false); // never the mug already in the basket
    await plus.first().click();
    const items = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items);
    expect(items).toHaveLength(2);
    expect(items[1].artwork.assetId).toBe(items[0].artwork.assetId); // the same (own) drawing
    const [row] = await sql()`select price_pence from product_variants where sku = ${items[1].sku ?? items[1].product}`;
    await expect(page.getByRole('region', { name: 'your total' })).toContainText(gbp(items[0].pricePence + Number(row!.price_pence) - 300)); // same parcel → £3 off
    await page.screenshot({ path: `${SHOTS}/addon-added-phone.png`, fullPage: true });
  });

  test('forged place-order: prices, qty, join provenance, a promo OBJECT, credit and visibility in the body are all ignored', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const actions = recordActions(page);
    const parent = await parentWithMug(page);
    const price = await mugPrice(page);
    const basket = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items[0]);
    // one real checkout teaches us the place-order action id (it hands off to Stripe or confirms)
    await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
    await expect.poll(() => actions.some((a) => a.body.includes('"artwork"'))).toBe(true);
    const placeId = actions.find((a) => a.body.includes('"artwork"'))!.id;
    await page.goto('/start-creating');
    const forged = {
      items: [{ productKey: basket.sku ?? 'mug', qty: 1, pricePence: 1, unitPricePence: 1, linePence: 1, artwork: { assetId: basket.artwork.assetId, transform: basket.artwork.transform, visibility: 'PUBLIC' }, visibility: 'PUBLIC' }],
      gift: false,
      promo: { id: '00000000-0000-0000-0000-000000000000', code: 'FREE', kind: 'FIXED', value: 999999, minSpendPence: 0, commissionBps: 0 },
      joinProvenance: { invite: { id: 'x', familyId: 'x', verified: true, revoked: false, expiresAt: 9e15 }, membership: { familyId: 'x', status: 'ACTIVE', inviteId: 'x', isOwner: false, savingConsumed: false }, now: 0 },
      creditAvailablePence: 999999,
      account: { id: '00000000-0000-0000-0000-000000000000' },
      totalPence: 1,
    };
    await page.evaluate(async ({ id, body }) => {
      await fetch('/start-creating', { method: 'POST', headers: { 'next-action': id, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' }, body });
    }, { id: placeId, body: JSON.stringify([forged]) });
    const rows = await sql()`select o.* from orders o join accounts a on a.id = o.account_id where a.email = ${parent.toLowerCase()} order by o.created_at desc`;
    expect(rows.length).toBe(2); // the real one + the forged one
    const o = rows[0]!;
    expect(o.subtotal_pence).toBe(price);
    expect(o.total_pence).toBe(price);
    expect([o.join_saving_pence, o.promo_saving_pence, o.credit_applied_pence]).toEqual([0, 0, 0]);
    expect(o.promo_code_id).toBeNull();
    expect(o.status).not.toBe('PAID');
    const [a] = await sql()`select visibility from assets where id = ${basket.artwork.assetId}`;
    expect(a!.visibility).toBe('FAMILY'); // never public
    if (stripeTest && o.stripe_session_id) {
      const s = await new Stripe(KEY).checkout.sessions.retrieve(o.stripe_session_id);
      expect(s.amount_total).toBe(price);
      await new Stripe(KEY).checkout.sessions.expire(o.stripe_session_id).catch(() => {});
    }
  });

  for (const [n, pence] of [[2, 7800], [4, 14500], [8, 27900]] as const) {
    test(`christmas family bundle for ${n}: the builder, the basket and checkout all say ${gbp(pence)}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      const parent = testEmail('t5bundle');
      await quietCookies(page);
      await signInByEmailLink(page, parent, '/start-creating');
      await uploadAndOpenRange(page);
      // the real way in: the bundle tile on the range (the drawing in progress goes on the table)
      await page.getByRole('button', { name: /customize christmas family bundle/i }).first().click();
      await page.waitForURL(/\/customize\/christmasBundle/);
      const size = page.getByRole('radio', { name: new RegExp(`a set for ${n}`) });
      await size.click();
      await expect(size).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
      await expect(size).toContainText(gbp(pence));
      await expect(page.getByRole('region', { name: 'what’s in your bundle' })).toContainText(gbp(pence));
      const add = page.getByRole('button', { name: new RegExp(`add to basket · ${gbp(pence)}`) });
      await expect(add).toBeEnabled({ timeout: 60_000 });
      await add.click();
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{"state":{"items":[]}}').state.items.length), { timeout: 30_000 }).toBe(1);
      const line = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items[0]);
      expect(line.sku ?? line.product).toBe(n === 2 ? 'christmasBundle' : `christmasBundle-for${n}`);
      expect(line.pricePence).toBe(pence);
      await page.goto('/checkout');
      const aside = page.locator('aside');
      await expect(aside.locator('dl > div').last()).toContainText(gbp(pence), { timeout: 30_000 });
      await expect(page.locator('main').getByText(gbp(pence), { exact: true }).first()).toBeVisible();
      if (n === 4) await page.screenshot({ path: `${SHOTS}/bundle-for4-checkout.png`, fullPage: true });
    });
  }

  // 05-B7: checkout only counts drawn/card-pack lines as "personalised" (page.tsx hasPersonalised), so a
  // basket holding only the christmas bundle (or a calendar) tells a guest "No account needed" — then the
  // server sends them to sign up anyway.
  test.fixme('05-B7: a guest with only a bundle in the basket is told about the sign-up before tapping checkout', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /customize christmas family bundle/i }).first().click();
    await page.getByRole('button', { name: /add to basket · £78/ }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{"state":{"items":[]}}').state.items.length), { timeout: 30_000 }).toBe(1);
    await page.goto('/checkout');
    await expect(page.locator('aside').getByText(/no account needed/i)).toHaveCount(0); // EXPECTED; today it says "No account needed"
    await page.screenshot({ path: `${SHOTS}/guest-bundle-copy.png` });
    await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
    await page.waitForURL(/\/login/, { timeout: 30_000 });
  });

  // 05-B6: the gift note box ("add a little note") and the desktop "email for your receipt" box are
  // never sent to the server — whatever the shopper types is silently dropped.
  test.fixme('05-B6: a gift note typed at checkout reaches the order', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const actions = recordActions(page);
    await parentWithMug(page);
    await page.getByRole('switch', { name: 'Send as a gift' }).click();
    await expect(page.locator('main').getByText('gift', { exact: true })).toBeVisible(); // line price tucked away
    await page.getByPlaceholder('add a little note (optional)').fill('Happy Christmas Nana T5NOTE');
    await page.getByLabel('email for your receipt').fill('t5-receipt@example.test');
    await page.screenshot({ path: `${SHOTS}/gift-note.png` });
    await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
    await expect.poll(() => actions.some((a) => a.body.includes('"artwork"'))).toBe(true);
    const body = actions.find((a) => a.body.includes('"artwork"'))!.body;
    expect(body).toContain('"gift":true');
    expect(body).toContain('T5NOTE'); // EXPECTED; today the note never leaves the page
  });

  test('a drawing still held for review (no IWF) can’t be ordered — no order row, the basket stays', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const parent = await parentWithMug(page, { clear: false });
    const before = (await sql()<{ n: number }[]>`select count(*)::int as n from orders o join accounts a on a.id = o.account_id where a.email = ${parent.toLowerCase()}`)[0]!.n;
    await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
    await expect(page.getByText(/didn.t go through/i)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/held-drawing-checkout.png` });
    await expect(page).toHaveURL(/\/checkout$/);
    const after = (await sql()<{ n: number }[]>`select count(*)::int as n from orders o join accounts a on a.id = o.account_id where a.email = ${parent.toLowerCase()}`)[0]!.n;
    expect(after).toBe(before);
    const items = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.length);
    expect(items).toBe(1);
  });

  test.describe('Stripe TEST payments', () => {
    test.skip(!stripeTest, 'needs STRIPE_SECRET_KEY=sk_test_… and STRIPE_WEBHOOK_SECRET');
    const stripe = () => new Stripe(KEY);

    /**
     * Fill Stripe Checkout (hosted, test mode) and pay. Fields are found the way a person finds them —
     * by their label — falling back to the standard autofill token, never Stripe's internal ids (which
     * Stripe changes).
     */
    async function payOnStripe(page: Page, card: string) {
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      const field = (label: RegExp, autocomplete: string) => page.getByLabel(label).or(page.locator(`input[autocomplete~="${autocomplete}"]`)).first();
      await field(/^email$/i, 'email').fill('t5-payer@example.test');
      await field(/^full name$/i, 'name').fill('Test Person');
      // the address form: line 1, city, postcode (UK only)
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

    async function orderOf(parent: string) {
      const [o] = await sql()`select o.* from orders o join accounts a on a.id = o.account_id where a.email = ${parent.toLowerCase()} order by o.created_at desc limit 1`;
      return o!;
    }

    function signed(event: object) {
      const payload = JSON.stringify(event);
      return { payload, header: stripe().webhooks.generateTestHeaderString({ payload, secret: WHSEC }) };
    }

    test('4242: paid on Stripe, the charge equals the order; the webhook marks it paid once; forged signature refused', async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      const parent = await parentWithMug(page);
      const price = await mugPrice(page);
      await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
      await payOnStripe(page, '4242424242424242');
      await page.waitForURL(/\/checkout\/confirmation\?ref=SNK-\d{6}/, { timeout: 90_000 });
      await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/confirmation-4242.png`, fullPage: true });

      const o = await orderOf(parent);
      expect(o.status).toBe('PENDING'); // money moved on Stripe, but only the webhook says so
      const session = await stripe().checkout.sessions.retrieve(o.stripe_session_id, { expand: ['payment_intent'] });
      expect(session.livemode).toBe(false);
      expect(session.payment_status).toBe('paid');
      expect(session.amount_total).toBe(o.total_pence);
      expect(o.total_pence).toBe(price);
      expect((session.payment_intent as Stripe.PaymentIntent).status).toBe('succeeded');

      const event = { id: `evt_t5_${Date.now()}`, object: 'event', type: 'checkout.session.completed', api_version: '2025-01-27', created: Math.floor(Date.now() / 1000), data: { object: session } };
      const { payload, header } = signed(event);
      // forged: right body, wrong secret → 400, order untouched
      const forged = stripe().webhooks.generateTestHeaderString({ payload, secret: 'whsec_not_ours' });
      const bad = await page.request.post('/api/webhooks/stripe', { data: payload, headers: { 'stripe-signature': forged, 'content-type': 'application/json' } });
      expect(bad.status()).toBe(400);
      const noSig = await page.request.post('/api/webhooks/stripe', { data: payload, headers: { 'content-type': 'application/json' } });
      expect(noSig.status()).toBe(400);
      expect((await orderOf(parent)).status).toBe('PENDING');
      // tampered: signed body, then the amount changed → 400
      const tampered = await page.request.post('/api/webhooks/stripe', { data: payload.replace(`"amount_total":${o.total_pence}`, '"amount_total":1'), headers: { 'stripe-signature': header, 'content-type': 'application/json' } });
      expect(tampered.status()).toBe(400);

      const ok = await page.request.post('/api/webhooks/stripe', { data: payload, headers: { 'stripe-signature': header, 'content-type': 'application/json' } });
      expect(ok.status()).toBe(200);
      const paid = await orderOf(parent);
      expect(paid.status).toBe('PAID');
      expect(paid.shipping_address).toMatchObject({ line1: '1 Test Street', postcode: 'SW1A 1AA', countryCode: 'GB' });
      const paidAt = paid.paid_at;
      // a replay (Stripe retries) is a no-op
      const again = await page.request.post('/api/webhooks/stripe', { data: payload, headers: { 'stripe-signature': stripe().webhooks.generateTestHeaderString({ payload, secret: WHSEC }), 'content-type': 'application/json' } });
      expect(again.status()).toBe(200);
      const n = (await sql()<{ n: number }[]>`select count(*)::int as n from webhook_events where id = ${event.id}`)[0]!.n;
      expect(n).toBe(1);
      expect((await orderOf(parent)).paid_at).toEqual(paidAt);

      // /orders shows it, at the charged total
      await page.goto('/orders');
      await expect(page.getByText(o.ref)).toBeVisible();
      await expect(page.getByText(gbp(o.total_pence)).first()).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/orders-after-paid.png`, fullPage: true });
    });

    test('declined card (4000 0000 0000 0002): Stripe refuses, nothing is paid', async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      const parent = await parentWithMug(page);
      await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
      await payOnStripe(page, '4000000000000002');
      await expect(page.getByText(/card (was|has been) declined/i).first()).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: `${SHOTS}/stripe-declined.png` });
      const o = await orderOf(parent);
      expect(o.status).toBe('PENDING');
      const s = await stripe().checkout.sessions.retrieve(o.stripe_session_id);
      expect(s.payment_status).toBe('unpaid');
    });

    test('3-D Secure card (4000 0027 6000 3184): the challenge completes and the session is paid', async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      const parent = await parentWithMug(page);
      await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
      await payOnStripe(page, '4000002760003184');
      // Stripe's test 3DS page lives in nested iframes: "Complete" passes the challenge. Its frame can
      // still be wiring up when the button first shows, so keep pressing it until the shopper is back
      let shot = false;
      await expect
        .poll(async () => {
          if (/\/checkout\/confirmation/.test(page.url())) return true;
          for (const f of page.frames()) {
            const b = f.getByRole('button', { name: /^complete/i });
            if (await b.isVisible().catch(() => false)) {
              if (!shot) await page.screenshot({ path: `${SHOTS}/stripe-3ds-challenge.png` });
              shot = true;
              await b.click({ timeout: 5_000 }).catch(() => {}); // a frame torn down mid-click: the next round retries
              break;
            }
          }
          return false;
        }, { timeout: 120_000, intervals: [1_000] })
        .toBe(true);
      await page.waitForURL(/\/checkout\/confirmation\?ref=SNK-\d{6}/, { timeout: 90_000 });
      const o = await orderOf(parent);
      const s = await stripe().checkout.sessions.retrieve(o.stripe_session_id);
      expect(s.payment_status).toBe('paid');
      expect(s.amount_total).toBe(o.total_pence);
    });

    // 05-B3: placeOrder() clears the basket BEFORE sending the shopper to Stripe, so Stripe's "back"
    // (cancel_url = /checkout) lands on an EMPTY basket — the drawing-on-a-mug they built is gone.
    test.fixme('05-B3: going back from Stripe Checkout keeps the basket', async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await parentWithMug(page);
      await page.locator('aside').getByRole('button', { name: /^checkout$/ }).click();
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      await page.getByRole('link', { name: /back|snickerdoodle/i }).first().click();
      await page.waitForURL(/localhost:\d+\/checkout/);
      await page.screenshot({ path: `${SHOTS}/back-from-stripe.png` });
      await expect(page.getByRole('heading', { name: /your basket$/i })).toBeVisible();
    });
  });
});
