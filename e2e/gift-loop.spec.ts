import { test, expect, type Page } from '@playwright/test';
import { gbp, quietCookies, uploadAndOpenRange } from './helpers';
import {
  accountId,
  giftLinkFamily,
  hasDb,
  latestGiftLinkOf,
  magicLinkWasSent,
  membershipOf,
  openMagicLink,
  ordersForGiftLink,
  reviewerClearsUploadsOf,
  signIn,
  testEmail,
} from './db';

/**
 * The gift loop (docs/03): a parent keeps a drawing, shares a ready-to-buy link, and a relative
 * buys from it — as a GUEST (no account, one tap), or by JOINING THE FAMILY from the link's invite
 * (verify it's them → membership at the link's circle/access → the 5% saving, priced by the
 * SERVER). A link that's switched off or whose keepsake is deleted answers 410 Gone and still
 * shows its friendly card. Everything the page shows is checked against what the server wrote.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the same database as the server under test)');

const FRAMED = 6500; // the gift link's default product: a framed print at its default size

/** The parent's side, through the real UI: sign in → upload → "+ keepsake" → (reviewer clears it)
 * → Home → create a gift request (optionally inviting someone). Returns the link. */
async function parentSharesAGiftLink(page: Page, opts: { invite?: { email: string; relationship: RegExp; access: 'VIEW' | 'VIEW_BUY' | 'CONTRIBUTE' } } = {}) {
  const parent = testEmail('parent');
  await page.context().clearCookies(); // a brand-new parent, never on someone else's session
  await quietCookies(page);
  await signIn(page, parent, '/start-creating');
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: '+ keepsake' }).filter({ visible: true }).first().click();
  await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });

  // Production holds every upload for review until the screening provider is live (D8, fail
  // closed) — a gift link only ever snapshots CLEARED art. The test stands in for the reviewer.
  expect((await reviewerClearsUploadsOf(parent)).length).toBeGreaterThan(0);

  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/i }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/which drawings\?/i)).toBeVisible();
  // the keepsake tiles (aria-pressed toggles) — the first one is the drawing we just kept
  // (they have no accessible name yet — reported in tests/visual/MOCKUP-DIFF.md)
  const tile = sheet.locator('button[aria-pressed]:has(img)').first();
  await expect(async () => {
    if ((await tile.getAttribute('aria-pressed')) !== 'true') await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  if (opts.invite) {
    await sheet.getByRole('switch', { name: /also invite them to join the family/i }).click();
    await sheet.getByPlaceholder('their email').fill(opts.invite.email);
    await sheet.getByRole('group', { name: 'their relationship' }).getByRole('button', { name: opts.invite.relationship }).click();
    await sheet.getByRole('combobox').selectOption(opts.invite.access);
  }
  await sheet.getByRole('button', { name: /create gift request/i }).click();
  await expect(page.getByText(/now send it to someone special/i)).toBeVisible({ timeout: 30_000 });
  const link = await latestGiftLinkOf(parent);
  if (opts.invite) expect(link.inviteId, 'the link carries the invite').not.toBeNull();
  return { parent, link };
}

/** Become nobody: drop the parent's session so the next visit is a stranger holding the link. */
async function signOutEverywhere(page: Page) {
  await page.context().clearCookies();
}

test('gift loop · guest: open the link → check out as a guest (no account) → it ticks itself off', async ({ page }) => {
  const { link } = await parentSharesAGiftLink(page);
  await signOutEverywhere(page);

  const res = await page.goto(`/g/${link.token}`);
  expect(res?.status(), 'a live gift link answers 200').toBe(200);
  await expect(page.getByText(/ready to give/i)).toBeVisible();
  await expect(page.getByText('framed print').first()).toBeVisible();
  // no invite on this link → no join path, and no saving for a guest
  await expect(page.getByRole('link', { name: /join the family/i })).toHaveCount(0);
  await expect(page.getByText(/family saving/i)).toHaveCount(0);

  await page.getByPlaceholder(/granny/i).fill('Granny');
  await page.getByRole('button', { name: /checkout as guest/i }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmation\?ref=/, { timeout: 30_000 });

  // What the SERVER charged: full price, no join saving, no account, a gift from "Granny".
  const orders = await ordersForGiftLink(link.id);
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({ account_id: null, is_gift: true, subtotal_pence: FRAMED, join_saving_pence: 0, total_pence: FRAMED, gift_from_name: 'Granny' });

  // The list keeps tabs: the item is ticked off, nobody doubles up.
  await page.goto(`/g/${link.token}`);
  await expect(page.getByText(/already bought ✓/i)).toBeVisible();
  await expect(page.getByText(/everything.s been bought/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /checkout/i })).toHaveCount(0);
});

test('gift loop · join: invite on the link → verify it’s you → join at the link’s circle/access → 5% off, server-priced', async ({ page }) => {
  const granny = testEmail('granny');
  const { link } = await parentSharesAGiftLink(page, { invite: { email: granny, relationship: /grandparent/i, access: 'VIEW_BUY' } });
  await signOutEverywhere(page);

  // A stranger with the link sees the full price and two doors: join (5% off) or guest.
  await page.goto(`/g/${link.token}`);
  await expect(page.getByText(/invited to join the family/i)).toBeVisible();
  await expect(page.getByText(/family saving/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /checkout as guest/i })).toBeVisible();
  const total = page.locator('dt', { hasText: /^Total$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(total).toHaveText(gbp(FRAMED));

  // Join → identity check: only the person who controls the invited inbox can join.
  await page.getByRole('link', { name: /join the family · 5% off/i }).click();
  await expect(page).toHaveURL(/\/join\/[^/?]+\?next=/);
  const joinUrl = new URL(page.url());
  await page.getByRole('button', { name: new RegExp(`email ${granny.replace(/[.+]/g, '\\$&')}`, 'i') }).click();
  await expect(page.getByRole('status').filter({ hasText: /check .* for a link/i })).toBeVisible({ timeout: 30_000 });
  expect(await magicLinkWasSent(granny), 'a real sign-in email went to the invited address').toBe(true);

  // Open the link from the inbox → the invite is accepted → straight back to the gift list.
  await openMagicLink(page, granny, joinUrl.pathname + joinUrl.search);
  await expect(page).toHaveURL(new RegExp(`/g/${link.token}$`), { timeout: 30_000 });

  // Joined at exactly what the parent chose on the link: Extended circle (grandparent), view & buy.
  const familyId = await giftLinkFamily(link.id);
  const m = await membershipOf(granny, familyId);
  expect(m).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW_BUY', status: 'ACTIVE', is_owner: false });
  expect(m!.invite_id).toBe(link.inviteId);

  // The saving is the SERVER's quote for this viewer, shown on the link…
  const saving = Math.round(FRAMED * 0.05);
  await expect(page.getByText(/welcome to the family — your 5% is applied/i)).toBeVisible();
  await expect(page.locator('dt', { hasText: /^Family saving$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText(`−${gbp(saving)}`);
  await expect(total).toHaveText(gbp(FRAMED - saving));

  // …and the same engine charges it.
  await page.getByRole('button', { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmation\?ref=/, { timeout: 30_000 });
  const orders = await ordersForGiftLink(link.id);
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    account_id: await accountId(granny),
    is_gift: true,
    subtotal_pence: FRAMED,
    join_saving_pence: saving,
    total_pence: FRAMED - saving,
  });
});

test('gift loop · a switched-off link and a deleted keepsake answer 410 Gone, with the friendly card', async ({ page }) => {
  // switched off
  const first = await parentSharesAGiftLink(page);
  await page.goto('/home');
  await page.getByRole('button', { name: /switch this link off/i }).first().click();
  await page.getByRole('alert').getByRole('button', { name: /switch off/i }).click();
  await expect(page.getByText('switched off').first()).toBeVisible({ timeout: 30_000 });

  const off = await page.request.get(`/g/${first.link.token}`);
  expect(off.status(), 'a switched-off link is 410 Gone').toBe(410);
  expect(off.headers()['x-robots-tag']).toMatch(/noindex/);
  await page.goto(`/g/${first.link.token}`);
  await expect(page.getByRole('heading', { name: /this gift list was turned off/i })).toBeVisible();

  // deleted source: the parent deletes the keepsake (two taps) → the link is gone
  const second = await parentSharesAGiftLink(page);
  expect((await page.request.get(`/g/${second.link.token}`)).status()).toBe(200);
  await page.goto('/home');
  await page.getByRole('button', { name: /choose who can see this keepsake/i }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /delete this keepsake/i }).click();
  await sheet.getByRole('button', { name: /tap again to delete for good/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });

  const gone = await page.request.get(`/g/${second.link.token}`);
  expect(gone.status(), 'a deleted source is 410 Gone').toBe(410);
  await page.goto(`/g/${second.link.token}`);
  await expect(page.getByRole('heading', { name: /this gift list is no longer available/i })).toBeVisible();

  // an unknown token is simply not found
  expect((await page.request.get('/g/notARealGiftLinkToken123')).status()).toBe(404);
});
