import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { artwork, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Test sweep 2026-10-29, tester 06 — gifts & sharing. Pins what a STRANGER holding a gift link can
 * and can't reach (only that link's own gift), the link's life-cycle (revoke / expiry / deleted
 * source / report → the real review-and-erase path), buying from it (guest, and the join loop),
 * the frozen snapshot, and Share-a-Wish. Builds on e2e/gift-loop.spec.ts.
 * Report: reports/test-sweep-2026-10-29/06-gifts-sharing.md
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database) to sign people in');

const SHOTS = 'reports/test-sweep-2026-10-29/shots/06';
mkdirSync(SHOTS, { recursive: true });
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** A second, visibly different drawing (so two keepsakes are two different pictures). */
async function otherArt(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><circle cx="1000" cy="1000" r="700" fill="#2F5DA8"/></svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

/** Upload + keep one drawing as the signed-in parent; returns its asset id. */
async function keepADrawing(page: Page, art?: Buffer): Promise<string> {
  await uploadAndOpenRange(page, art ?? (await artwork()));
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
  await expect(page.getByRole('button', { name: /kept ♥/ }).first()).toBeVisible({ timeout: 30_000 });
  const [a] = await sql()`select id from assets where kept_in_home order by created_at desc limit 1`;
  return a!.id as string;
}

/**
 * A parent signs in, keeps a drawing (and optionally a second one that is NOT shared), and makes a
 * gift request on /home for the first. Returns the link path + ids for probing.
 */
async function parentMakesGiftLink(page: Page, opts: { invite?: { email: string }; extraKept?: boolean } = {}) {
  const parent = testEmail('parent');
  await quietCookies(page);
  await signInByEmailLink(page, parent, '/start-creating');
  let otherAssetId: string | null = null;
  if (opts.extraKept) {
    otherAssetId = await keepADrawing(page, await otherArt());
    await page.getByRole('button', { name: 'create another' }).click().catch(() => {});
  }
  const sharedAssetId = await keepADrawing(page);
  await clearForTest(parent);

  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (opts.invite) {
    await dialog.getByRole('switch', { name: 'Also invite them to join the family' }).click();
    await dialog.getByPlaceholder('their email').fill(opts.invite.email);
    await dialog.getByRole('group', { name: 'their relationship' }).getByRole('button', { name: 'Grandparent' }).click();
  }
  await dialog.getByRole('button', { name: 'create gift request' }).click();
  const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const path = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];
  const token = path.split('/').pop()!;
  const [link] = await sql()`select id, family_id, items, expires_at, created_at from gift_links where token = ${token}`;
  const items = link!.items as { assetId: string }[];
  await page.keyboard.press('Escape');
  return { parent, path, token, linkId: link!.id as string, familyId: link!.family_id as string, items, sharedAssetId, otherAssetId, link: link! };
}

/** A brand-new, signed-out browser — someone the link was forwarded to. */
async function stranger(browser: Browser, viewport = PHONE) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await quietCookies(page);
  return page;
}

const tamper = (t: string) => t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');

/** RFC 6238 TOTP — what an authenticator app shows (the admin two-step login). */
function totp(secretB32: string, at = Date.now()): string {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[\s=]/g, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('06: a stranger sees ONLY the one gift — noindex, own previews only, tampered tokens tell nothing', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const g = await parentMakesGiftLink(page, { extraKept: true });
  expect(g.items.map((i) => i.assetId)).toEqual([g.sharedAssetId]); // the unshared keepsake is NOT on the link
  // 14-day life (founder, 21 Oct)
  const days = (new Date(g.link.expires_at).getTime() - new Date(g.link.created_at).getTime()) / 86_400_000;
  expect(Math.round(days)).toBe(14);

  // a second, unrelated family with its own kept drawing
  const otherFamily = await browser.newContext();
  const op = await otherFamily.newPage();
  await quietCookies(op);
  await signInByEmailLink(op, testEmail('other-parent'), '/start-creating');
  const foreignAssetId = await keepADrawing(op, await otherArt());
  await otherFamily.close();

  for (const [label, vp] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
    const s = await stranger(browser, vp);
    const res = await s.goto(g.path);
    expect(res!.status()).toBe(200);
    await expect(s.getByRole('heading', { level: 1 })).toBeVisible();
    // never indexed
    await expect(s.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // what the stranger's browser received: no other keepsake, no family id, no parent email
    const html = await s.content();
    expect(html).toContain(g.sharedAssetId);
    expect(html).not.toContain(g.otherAssetId!);
    expect(html).not.toContain(g.familyId);
    expect(html).not.toContain(g.parent);
    // every image on the page is this link's own preview
    const srcs = await s.locator('main img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute('src')));
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(src).toBe(`/api/gift/${g.token}/preview/${g.sharedAssetId}`);
    // one-tap report path present
    await expect(s.getByRole('button', { name: /report this gift list/ })).toBeVisible();
    await s.screenshot({ path: `${SHOTS}/gift-link-stranger-${label}.png`, fullPage: true });
    await s.context().close();
  }

  // the preview route serves this link's own keepsake — small, re-encoded, noindex — and nothing else
  const api = page.context().request; // a signed-in parent's cookies make no difference: the token is the only key
  const anon = await (await browser.newContext()).request;
  const own = await anon.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-type']).toBe('image/webp');
  expect(own.headers()['x-robots-tag']).toMatch(/noindex/);
  const meta = await sharp(await own.body()).metadata();
  expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(720);
  expect(meta.exif).toBeUndefined();

  const probes = [
    `/api/gift/${g.token}/preview/${g.otherAssetId}`, // same family, kept, cleared — but not on the link
    `/api/gift/${g.token}/preview/${foreignAssetId}`, // another family's keepsake
    `/api/gift/${g.token}/preview/00000000-0000-0000-0000-000000000000`,
    `/api/gift/${g.token}/preview/not-a-uuid`,
    `/api/gift/${tamper(g.token)}/preview/${g.sharedAssetId}`, // a one-character-off token
    `/api/gift/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/preview/${g.sharedAssetId}`,
  ];
  for (const p of probes) {
    for (const client of [anon, api]) {
      const r = await client.get(p);
      expect(r.status(), p).toBe(404);
      expect((await r.body()).length, p).toBe(0); // a bare 404 — no hint whether the link or keepsake exists
    }
  }

  // guessed / tampered tokens: the same plain "isn't valid" 404 whichever way it's wrong
  const s = await stranger(browser);
  const bodies: string[] = [];
  for (const t of [tamper(g.token), 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', g.token.toLowerCase() === g.token ? g.token.toUpperCase() : g.token.toLowerCase()]) {
    const r = await s.goto(`/g/${t}`);
    expect(r!.status()).toBe(404);
    await expect(s.getByRole('heading', { level: 1 })).toHaveText("This gift link isn't valid");
    await expect(s.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    bodies.push((await s.locator('main').innerText()).trim());
  }
  expect(new Set(bodies).size).toBe(1);
  await s.screenshot({ path: `${SHOTS}/gift-link-tampered-phone.png` });
  await s.context().close();
});

test('06: revoke switches the link off at once — page 410, preview 404, an open tab can no longer buy', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  const s = await stranger(browser);
  await s.goto(g.path);
  await expect(s.getByRole('button', { name: /^checkout as guest$/ })).toBeVisible();

  // the parent switches it off from their keepsake home (asks once first)
  await page.goto('/home');
  await page.getByRole('button', { name: 'switch this link off' }).first().click();
  await page.getByRole('button', { name: 'switch off', exact: true }).click();
  await expect(page.getByText('switched off', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const [revoked] = await sql()`select status from gift_links where id = ${g.linkId}`;
  expect(revoked!.status).toBe('REVOKED');
  const [audit] = await sql()`select event from audit_records where target_id = ${g.linkId} and event = 'GIFT_LINK_REVOKED'`;
  expect(audit).toBeTruthy();

  // the stranger's still-open tab: checkout is refused, nothing is ordered
  await s.getByPlaceholder('e.g. Granny & Grandad').fill('Granny');
  await s.getByRole('button', { name: /^checkout as guest$/ }).click();
  await expect(s.getByText(/changed by the family/)).toBeVisible({ timeout: 15_000 });
  const orders = await sql()`select id from orders where gift_link_id = ${g.linkId}`;
  expect(orders).toHaveLength(0);

  const r = await s.goto(g.path);
  expect(r!.status()).toBe(410);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('This gift list was turned off');
  await s.screenshot({ path: `${SHOTS}/gift-link-revoked-phone.png` });
  expect((await s.request.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`)).status()).toBe(404);
  await s.context().close();
});

test('06: an expired link is 410 "expired" and serves no preview', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  await sql()`update gift_links set expires_at = now() - interval '1 minute' where id = ${g.linkId}`; // the clock, moved on 14 days
  const s = await stranger(browser);
  const r = await s.goto(g.path);
  expect(r!.status()).toBe(410);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('This gift list has expired');
  expect((await s.request.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`)).status()).toBe(404);
  await s.context().close();
});

test('06: the parent deletes the shared keepsake → the link is 410 "no longer available" at once', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  await page.goto('/home');
  await page.getByRole('button', { name: 'choose who can see this keepsake' }).first().click();
  const del = page.getByRole('dialog').getByRole('button', { name: /delete this keepsake/ });
  await del.click();
  await page.getByRole('dialog').getByRole('button', { name: /tap again to delete for good/ }).click();
  await expect(page.getByText('keepsake deleted — gone for good')).toBeVisible({ timeout: 30_000 });
  expect(await sql()`select id from assets where id = ${g.sharedAssetId}`).toHaveLength(0);

  const s = await stranger(browser);
  const r = await s.goto(g.path);
  expect(r!.status()).toBe(410);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('This gift list is no longer available');
  expect((await s.request.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`)).status()).toBe(404);
  await s.context().close();
});

test('06: a guest buys at phone size → the list ticks itself off (never says who); only the parent sees "from Granny"', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  const granny = await stranger(browser);
  await granny.goto(g.path);
  // the thumb-zone checkout button is on screen at 390×844 without hunting
  const buy = granny.getByRole('button', { name: /^checkout as guest$/ });
  await buy.scrollIntoViewIfNeeded();
  await expect(buy).toBeInViewport();
  await granny.getByPlaceholder('e.g. Granny & Grandad').fill('Granny');
  await buy.click();
  await expect.poll(() => granny.url(), { timeout: 30_000 }).toMatch(/\/checkout\/confirmation\?ref=|checkout\.stripe\.com/);
  await granny.screenshot({ path: `${SHOTS}/gift-guest-confirmation-phone.png`, fullPage: true });

  const [o] = await sql()`select status, account_id, join_saving_pence, gift_from_name, subtotal_pence, total_pence from orders where gift_link_id = ${g.linkId}`;
  expect(o).toMatchObject({ account_id: null, join_saving_pence: 0, gift_from_name: 'Granny' });

  if (o!.status === 'PAID') {
    // a second relative opening the same link sees it ticked off — and not who bought it
    const aunt = await stranger(browser, DESKTOP);
    await aunt.goto(g.path);
    await expect(aunt.getByText('already bought ✓')).toBeVisible();
    await expect(aunt.getByText(/Granny/)).toHaveCount(0);
    await expect(aunt.getByRole('button', { name: /checkout/ })).toHaveCount(0);
    await aunt.screenshot({ path: `${SHOTS}/gift-all-bought-desktop.png`, fullPage: true });
    await aunt.context().close();
    // the parent's home: "from Granny ✓"
    await page.goto('/home');
    await expect(page.getByText('from Granny ✓')).toBeVisible();
    await expect(page.getByText('1 of 1 bought')).toBeVisible();
  }
  await granny.context().close();
});

test('06: the join loop from a forwarded link — a stranger who is NOT the invitee cannot join, and is never shown the invitee’s email (06-B1)', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const grannyEmail = testEmail('granny');
  const g = await parentMakesGiftLink(page, { invite: { email: grannyEmail } });

  // signed-out stranger taps "join the family · 5% off" on a forwarded link
  const s = await stranger(browser);
  await s.goto(g.path);
  await s.getByRole('link', { name: /join the family · 5% off/ }).click();
  await expect(s).toHaveURL(/\/join\//);
  await expect(s.getByRole('heading', { level: 1 })).toContainText(/Join/);
  // 06-B1 (fixed): whoever holds the gift link sees only a masked address — never the invitee's
  await s.screenshot({ path: `${SHOTS}/join-from-forwarded-link-phone.png`, fullPage: true });
  expect(await s.content(), 'the invitee’s address is nowhere in the page').not.toContain(grannyEmail);

  // a stranger signed in as someone else cannot accept it
  const intruder = testEmail('intruder');
  const joinUrl = new URL(s.url());
  await signInByEmailLink(s, intruder, joinUrl.pathname + joinUrl.search);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('This invite is for someone else');
  expect(await s.content(), 'still masked when signed in as someone else').not.toContain(grannyEmail);
  const m = await sql()`select m.status from memberships m join accounts a on a.id = m.account_id where a.email = ${intruder} and m.family_id = ${g.familyId}`;
  expect(m).toHaveLength(0); // no membership for the wrong person
  // …and the intruder buying from the link gets no family saving
  await s.goto(g.path);
  await expect(s.getByText('Family saving')).toHaveCount(0);
  await s.context().close();
});

test('06: report from a gift link → list offline at once → admin (two-step login) removes it → erased for real', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const g = await parentMakesGiftLink(page);

  // a stranger reports it, signed out, at desktop size
  const s = await stranger(browser, DESKTOP);
  await s.goto(g.path);
  await s.getByRole('button', { name: /report this gift list/ }).click();
  const dlg = s.getByRole('dialog');
  await dlg.getByRole('radio', { name: /I don’t know who sent this/ }).check();
  await dlg.getByRole('button', { name: 'send report' }).click();
  await expect(dlg.getByText('Thank you for telling us')).toBeVisible({ timeout: 15_000 });
  await s.screenshot({ path: `${SHOTS}/report-sent-desktop.png` });
  await dlg.getByRole('button', { name: 'done' }).click();
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('This gift list is no longer available', { timeout: 15_000 });
  expect((await s.request.get(g.path)).status()).toBe(410);
  expect((await s.request.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`)).status()).toBe(404);
  await s.context().close();

  const [held] = await sql()`select moderation_status, moderation_detail from assets where id = ${g.sharedAssetId}`;
  expect(held!.moderation_status).toBe('FLAGGED');
  expect((held!.moderation_detail as { labels: string[] }).labels[0]).toBe('reported via a gift link');
  const [flag] = await sql()`select actor_type from audit_records where target_id = ${g.linkId} and event = 'CONTENT_FLAGGED'`;
  expect(flag!.actor_type).toBe('ANON');

  // the parent's own home while it's held: the keepsake says it's being checked; what does the list say?
  await page.goto('/home');
  await expect(page.getByRole('button', { name: /being checked after a report/ })).toBeVisible();
  const listState = await page.locator('section', { hasText: 'Gift requests' }).innerText().catch(() => '');
  test.info().annotations.push({ type: '06-B-owner-list-after-report', description: listState.replace(/\s+/g, ' ').slice(0, 300) });
  await page.screenshot({ path: `${SHOTS}/parent-home-after-report-phone.png`, fullPage: true });

  // an admin: signs in, sets up two-step login, and removes it from the review queue
  const adminEmail = testEmail('admin');
  const ac = await browser.newContext({ viewport: DESKTOP });
  const admin = await ac.newPage();
  await quietCookies(admin);
  await signInByEmailLink(admin, adminEmail, '/home');
  await sql()`update accounts set is_admin = true where email = ${adminEmail}`;
  await admin.goto('/admin/review');
  await admin.getByRole('button', { name: 'start set-up' }).click();
  const key = (await admin.locator('p.select-all').innerText()).replace(/\s/g, '');
  await admin.getByLabel('six-digit code from your authenticator app').fill(totp(key));
  await admin.getByRole('button', { name: 'continue' }).click();
  const queue = admin.getByRole('list', { name: 'held back for review' });
  await expect(queue).toBeVisible({ timeout: 15_000 });
  const item = queue.getByRole('listitem').first(); // newest first
  await expect(item).toContainText('reported via a gift link');
  // This server has no screening set up, so the upload was held as "screening-not-configured" (the
  // test then stood in for a reviewer and set it CLEAR). Its CSAM hash check never ran, so after the
  // report it can only be removed — never looked at or cleared (08-B7).
  await expect(item).toContainText('can’t be looked at or cleared — only removed');
  await expect(item.getByRole('button', { name: 'look' })).toHaveCount(0);
  await admin.screenshot({ path: `${SHOTS}/admin-review-reported-desktop.png`, fullPage: true });
  await item.getByRole('button', { name: 'remove' }).click();
  await admin.getByRole('button', { name: 'yes, remove it' }).click();
  await expect(admin.getByText('removed for good')).toBeVisible({ timeout: 30_000 });

  // the real cascading erase: the keepsake row and its stored objects are gone
  await expect.poll(async () => (await sql()`select id from assets where id = ${g.sharedAssetId}`).length, { timeout: 30_000 }).toBe(0);
  expect(await sql()`select id from storage_objects where asset_id = ${g.sharedAssetId}`).toHaveLength(0);
  const [rev] = await sql()`select metadata from audit_records where target_id = ${g.sharedAssetId} and event = 'CONTENT_REVIEWED'`;
  expect((rev!.metadata as { decision: string }).decision).toBe('remove');
  const s2 = await stranger(browser);
  expect((await s2.goto(g.path))!.status()).toBe(410);
  await s2.context().close();
  await ac.close();
});

test('06: snapshot — the shop reprices after sharing: the frozen snapshot is unchanged (06-B: the line shows the old price, the total the new one)', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  const [item] = g.items as { assetId: string; productKey: string; unitPricePence: number }[];
  const [v] = await sql()`select v.id, v.price_pence from product_variants v where v.sku = ${item!.productKey}`;
  // the shop's price moves after the link was shared (a seasonal change / catalogue sync)
  await sql()`update product_variants set price_pence = ${v!.price_pence + 500} where id = ${v!.id}`;
  try {
    const s = await stranger(browser);
    await s.goto(g.path);
    const line = await s.locator('main').getByText(/^£\d/).first().innerText();
    const totals = await s.locator('aside dl').innerText();
    await s.screenshot({ path: `${SHOTS}/gift-repriced-phone.png`, fullPage: true });
    test.info().annotations.push({ type: '06-B-reprice', description: `line shows ${line}; summary: ${totals.replace(/\s+/g, ' ')}` });
    // the snapshot itself never changes
    const [after] = await sql()`select items from gift_links where id = ${g.linkId}`;
    expect(after!.items).toEqual(g.items);
    await s.context().close();
  } finally {
    await sql()`update product_variants set price_pence = ${v!.price_pence} where id = ${v!.id}`;
  }
});

test('06: a saved design ("+ keepsake" on a mug) shared as a link sells EXACTLY the design shared — even after the design is edited or removed', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const parent = testEmail('parent');
  await quietCookies(page);
  await signInByEmailLink(page, parent, '/start-creating');
  const assetId = await keepADrawing(page);
  await page.getByRole('button', { name: 'customize mug', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/mug/);
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByText('saved to your keepsakes ♥')).toBeVisible({ timeout: 30_000 });
  await clearForTest(parent);
  const [design] = await sql()`select d.id, d.variant_sku, d.transform from saved_designs d join accounts a on a.id = d.created_by_account_id where a.email = ${parent}`;
  expect(design).toBeTruthy();

  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'create gift request' }).click(); // saved designs come pre-ticked
  const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const path = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];

  // step 2: send it by email — the console mailer prints it; only the link goes out, no picture
  await dialog.getByPlaceholder('granny@example.com, uncle@example.com').fill('e2e-auntie@example.test');
  await dialog.getByRole('button', { name: /send gift request/ }).click();
  await expect(page.getByText(/sent to 1 person/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  const token = path.split('/').pop()!;
  const [link] = await sql()`select id, items from gift_links where token = ${token}`;
  const items = link!.items as { assetId: string; productKey: string; designId?: string; transform?: unknown; label: string }[];
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ assetId, productKey: design!.variant_sku, designId: design!.id });

  // AFTER sharing, the design is edited (placement moved) and then removed from "saved"
  await sql()`update saved_designs set transform = ${sql().json({ scale: 0.37, offsetX: 0.2, offsetY: -0.2, rotationDeg: 33 })} where id = ${design!.id}`;
  await page.goto('/home');
  await page.getByRole('button', { name: /^remove .* from saved$/ }).first().click();
  await expect(page.getByText('removed from saved')).toBeVisible({ timeout: 15_000 });

  const s = await stranger(browser);
  await s.goto(path);
  await expect(s.getByText(items[0]!.label)).toBeVisible();
  await s.screenshot({ path: `${SHOTS}/gift-design-mug-phone.png`, fullPage: true });
  await s.getByRole('button', { name: /^checkout as guest$/ }).click();
  await expect.poll(() => s.url(), { timeout: 30_000 }).toMatch(/\/checkout\/confirmation\?ref=|checkout\.stripe\.com/);
  const [art] = await sql()`select oi.product_key, oia.transform from orders o join order_items oi on oi.order_id = o.id join order_item_artwork oia on oia.order_item_id = oi.id where o.gift_link_id = ${link!.id}`;
  expect(art!.product_key).toBe(design!.variant_sku);
  expect((art!.transform as { rotationDeg?: number }).rotationDeg ?? 0).not.toBe(33); // the edit never reached the order
  expect((art!.transform as { scale?: number }).scale).not.toBe(0.37);
  await s.context().close();
});

test('06: invitee joins from the gift link and checks out with 5% at phone size; the saving is one-time', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const grannyEmail = testEmail('granny');
  const g = await parentMakesGiftLink(page, { invite: { email: grannyEmail } });
  const granny = await stranger(browser, PHONE);
  await granny.goto(g.path);
  await granny.screenshot({ path: `${SHOTS}/gift-with-invite-phone.png`, fullPage: true });
  await granny.getByRole('link', { name: /join the family · 5% off/ }).click();
  await expect(granny).toHaveURL(/\/join\//);
  const joinUrl = new URL(granny.url());
  await signInByEmailLink(granny, grannyEmail, joinUrl.pathname + joinUrl.search);
  await expect(granny).toHaveURL(new RegExp(`${g.path}$`));
  await expect(granny.getByText('welcome to the family — your 5% is applied')).toBeVisible();
  const [m] = await sql()`select m.status, m.circle, m.access_level from memberships m join accounts a on a.id = m.account_id where a.email = ${grannyEmail} and m.family_id = ${g.familyId}`;
  expect(m).toMatchObject({ status: 'ACTIVE', circle: 'EXTENDED', access_level: 'VIEW_BUY' });
  await granny.screenshot({ path: `${SHOTS}/gift-joined-5pc-phone.png`, fullPage: true });
  // the invite is spent: a forwarded copy of the gift link no longer offers it
  const later = await stranger(browser);
  await later.goto(g.path);
  await expect(later.getByRole('link', { name: /join the family/ })).toHaveCount(0);
  await later.context().close();
  await granny.getByRole('button', { name: /^checkout$/ }).click();
  await expect.poll(() => granny.url(), { timeout: 30_000 }).toMatch(/\/checkout\/confirmation\?ref=|checkout\.stripe\.com/);
  const [o] = await sql()`select join_saving_pence, subtotal_pence, status from orders where gift_link_id = ${g.linkId}`;
  expect(o!.join_saving_pence).toBe(Math.round(o!.subtotal_pence * 0.05));
  expect(o!.status).toBe('PAID'); // local "mark paid" (Stripe key blanked on this server)

  // a SECOND gift link from the same family: the one-time saving is spent
  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'create gift request' }).click();
  const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const path2 = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];
  await granny.goto(path2);
  // 06-B: a signed-in family member is offered "checkout as guest" once their saving is spent (label keys on the saving, not on being signed in)
  await expect(granny.getByRole('button', { name: /^checkout( as guest)?$/ })).toBeVisible();
  await expect(granny.getByText('Family saving')).toHaveCount(0);
  await granny.screenshot({ path: `${SHOTS}/gift-second-link-member-phone.png`, fullPage: true });
  await granny.context().close();
});

test('06: a keepsake the parent pulls back to "Only me" drops off the link and its preview 404s', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const g = await parentMakesGiftLink(page);
  await page.goto('/home');
  await page.getByRole('button', { name: 'choose who can see this keepsake' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Only me/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'done' }).click();
  await expect(page.getByText(/visibility set to only me/)).toBeVisible({ timeout: 15_000 });
  const s = await stranger(browser);
  const r = await s.goto(g.path);
  expect(r!.status()).toBe(410); // its only item is private now → "no longer available"
  expect((await s.request.get(`/api/gift/${g.token}/preview/${g.sharedAssetId}`)).status()).toBe(404);
  expect(await s.content()).not.toContain(g.sharedAssetId);
  await s.context().close();
});

test('06: Share a Wish — basket → who is it for → signed-out parent signs up → link → recipient opens + buys', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(PHONE);
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: 'customize socks', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/socks/);
  await expect(page.locator('img[alt="your drawing on a socks"]').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /add to basket/i }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const assetId: string = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items[0].artwork.assetId);
  // the stand-in reviewer clears THIS test drawing (no real screening on the e2e server)
  await sql()`update assets set moderation_status = 'CLEAR' where id = ${assetId}`;

  await page.getByRole('button', { name: /share a wish/ }).first().click();
  await page.getByPlaceholder('e.g. Mia').fill('Mia');
  await page.getByRole('button', { name: 'keep it & share a wish' }).click();
  await expect(page).toHaveURL(/\/share-wish/);
  await expect(page.getByRole('heading', { name: 'Let’s save Mia’s wish' })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/wish-needs-auth-phone.png`, fullPage: true });

  // sign up by the magic link, back to /share-wish (the basket survives the round-trip)
  const parent = testEmail('wisher');
  await signInByEmailLink(page, parent, '/share-wish');
  await expect(page.getByRole('heading', { name: 'Mia’s wish is ready ✦' })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/wish-ready-phone.png`, fullPage: true });
  const [link] = await sql()`select g.token, g.title, g.items from gift_links g join accounts a on a.id = g.created_by_account_id where a.email = ${parent}`;
  expect(link!.title).toBe('Mia’s wishlist');
  const items = link!.items as { assetId: string; productKey: string; label: string }[];
  expect(items.map((i) => i.assetId)).toEqual([assetId]);
  test.info().annotations.push({ type: '06-B-wish-product', description: `basket held socks; the wish link sells: ${items.map((i) => `${i.productKey} (${i.label})`).join(', ')}` });

  const [kept] = await sql()`select kept_in_home, visibility, child_subject_id from assets where id = ${assetId}`;
  expect(kept).toMatchObject({ kept_in_home: true, visibility: 'FAMILY' });
  expect(kept!.child_subject_id).toBeTruthy();

  const s = await stranger(browser, DESKTOP);
  await s.goto(`/g/${link!.token}`);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('Mia’s wishlist');
  await s.screenshot({ path: `${SHOTS}/wish-recipient-desktop.png`, fullPage: true });
  await s.getByRole('button', { name: /^checkout as guest$/ }).click();
  await expect.poll(() => s.url(), { timeout: 30_000 }).toMatch(/\/checkout\/confirmation\?ref=|checkout\.stripe\.com/);
  await s.context().close();
});
