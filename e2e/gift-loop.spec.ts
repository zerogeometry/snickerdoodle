import { test, expect, type Browser, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The gift loop (CLAUDE.md e2e list): a parent keeps a drawing and makes a ready-to-buy gift link;
 *  - a grandparent buys from it as a GUEST — no account, one tap;
 *  - or the link carries an INVITE: they join the family (verify by the email link → an ACTIVE
 *    membership at the circle/access the parent set) and check out with the 5% family saving,
 *    priced by the server.
 * Signing in uses the real email-link callback (e2e/harness.ts); the one stand-in is the content
 * review, which holds every upload on a server without real screening (as production would).
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database) to sign people in');

/** A parent with a kept drawing, on their keepsake home, making a gift request. Returns the link. */
async function parentMakesGiftLink(page: Page, invite?: { email: string }) {
  const parent = testEmail('parent');
  await quietCookies(page);
  await signInByEmailLink(page, parent, '/start-creating');
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  await clearForTest(parent);

  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (invite) {
    await dialog.getByRole('switch', { name: 'Also invite them to join the family' }).click();
    await dialog.getByPlaceholder('their email').fill(invite.email);
    await dialog.getByRole('group', { name: 'their relationship' }).getByRole('button', { name: 'Grandparent' }).click();
  }
  await dialog.getByRole('button', { name: 'create gift request' }).click();
  const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const path = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];
  return { parent, path };
}

/** Buy what's on the link; the order is placed (local "mark paid") or handed to Stripe. */
async function checkOut(page: Page, button: RegExp) {
  await page.getByRole('button', { name: button }).click();
  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/\/checkout\/confirmation\?ref=|checkout\.stripe\.com/);
}

const newPage = async (browser: Browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await quietCookies(page);
  return page;
};

test('gift loop: a guest buys from a gift link — no account, no saving', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { path } = await parentMakesGiftLink(page);

  const granny = await newPage(browser);
  await granny.goto(path);
  await expect(granny.getByRole('heading', { level: 1 })).toContainText(/gift list/i);
  await expectAccessible(granny, 'gift link page');
  await expect(granny.getByText('welcome to the family')).toHaveCount(0);
  await granny.getByPlaceholder('e.g. Granny & Grandad').fill('Granny');
  await checkOut(granny, /^checkout as guest$/);

  const token = path.split('/').pop()!;
  const [order] = await sql()`select o.join_saving_pence, o.subtotal_pence, o.account_id from orders o join gift_links g on g.id = o.gift_link_id where g.token = ${token}`;
  expect(order).toBeTruthy();
  expect(order!.join_saving_pence).toBe(0); // a guest never gets the family saving
  expect(order!.account_id).toBeNull(); // and needed no account
  await granny.context().close();
});

test('gift loop: invite → verify by email link → joined at the set circle → 5% off, priced by the server', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const grannyEmail = testEmail('granny');
  const { path } = await parentMakesGiftLink(page, { email: grannyEmail });

  const granny = await newPage(browser);
  await granny.goto(path);
  // the guest price first: no saving until they've joined
  await expect(granny.getByText('welcome to the family')).toHaveCount(0);
  await granny.getByRole('link', { name: /join the family · 5% off/ }).click();
  await expect(granny).toHaveURL(/\/join\//);
  const joinUrl = new URL(granny.url());

  // verify: the one-tap link to the INVITED address (identity, not authority)
  await signInByEmailLink(granny, grannyEmail, joinUrl.pathname + joinUrl.search);
  await expect(granny).toHaveURL(new RegExp(`${path}$`)); // joined, and straight back to the list
  await expect(granny.getByText('welcome to the family — your 5% is applied')).toBeVisible();
  await expect(granny.getByText('Family saving')).toBeVisible();

  // the membership is ACTIVE, at the circle the relationship sets (grandparent → extended) + the access chosen
  const [m] = await sql()`select m.status, m.circle, m.access_level, m.is_owner from memberships m join accounts a on a.id = m.account_id where a.email = ${grannyEmail}`;
  expect(m).toMatchObject({ status: 'ACTIVE', circle: 'EXTENDED', access_level: 'VIEW_BUY', is_owner: false });

  await checkOut(granny, /^checkout$/);
  const token = path.split('/').pop()!;
  const [order] = await sql()`select o.join_saving_pence, o.subtotal_pence from orders o join gift_links g on g.id = o.gift_link_id where g.token = ${token}`;
  expect(order!.join_saving_pence).toBe(Math.round(order!.subtotal_pence * 0.05)); // the 5%, server-side
  await granny.context().close();
});
