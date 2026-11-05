import { test, expect, type Page } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';
import { sql } from './harness';
import { basketLines, goClient, optionGroup, rangeReady, waitForAsset } from './shop-db';

/**
 * Made in the UK since Prodigi's "global" change (5 Nov 2026): the toddler tee (a garment) and the Apple
 * Watch strap (a long, thin print file with a gap behind the watch). Both are HIDDEN in the shop until the
 * founder's photos are in, so this spec puts them on show in ITS OWN e2e database for the run and takes them
 * off again after (Playwright runs one worker — no other spec sees them). Each: customise → basket →
 * checkout at the SERVER's price; the strap also through the placement editor, which shades what won't print.
 */
const KEYS = ['toddlerTee', 'watchStrap'];

test.beforeAll(async () => {
  await sql()`update products set visible_in_shop = true where key in ${sql()(KEYS)}`;
});
test.afterAll(async () => {
  await sql()`update products set visible_in_shop = false where key in ${sql()(KEYS)}`;
});

const addButton = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });
const chip = (page: Page, group: string, name: string) => optionGroup(page, group).getByRole('button', { name, exact: true });

async function checkoutTotal(page: Page, label: RegExp, total: string) {
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText(label).first()).toBeVisible();
  const summary = page.locator('dl').first();
  await expect(summary.locator('xpath=.//dt[normalize-space()="Total"]/following-sibling::dd[1]')).toHaveText(total);
}

test('toddler tee: 3–4 years in navy → basket → checkout at £20', async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);

  await goClient(page, '/customize/toddlerTee');
  await expect(page.getByRole('heading', { level: 1, name: 'toddler tee', exact: true })).toBeVisible({ timeout: 30_000 });
  // no product photo yet (the founder's layers aren't in) — the page still works off the plain tile
  await expect(addButton(page)).toBeEnabled({ timeout: 30_000 });
  // not organic (Rabbit Skins ringspun cotton) — the garment note mustn't say it is
  await expect(page.getByText(/printed straight onto the fabric/)).toBeVisible();
  // only the two sizes Prodigi's UK lab makes
  await expect(optionGroup(page, 'Size').getByRole('button')).toHaveCount(2);
  await chip(page, 'Size', '3-4 years').click();
  await chip(page, 'Colour', 'navy').click();
  await expect(chip(page, 'Colour', 'navy')).toHaveAttribute('aria-pressed', 'true');
  await expect(addButton(page)).toHaveText(/· £20$/);
  // the honest post line: uk2 sends it Royal Mail 1st Class, untracked
  await expect(page.getByText('free delivery', { exact: true })).toBeVisible();
  await addButton(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });
  expect((await basketLines(page)).map((l) => l.sku)).toEqual(['toddlerTee-34years-navy']);

  await checkoutTotal(page, /toddler tee/, '£20');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});

test('watch strap: large → the placement editor shades what’s behind the watch → basket → checkout at £45', async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);

  await goClient(page, '/customize/watchStrap');
  await expect(page.getByRole('heading', { level: 1, name: 'watch strap', exact: true })).toBeVisible({ timeout: 30_000 });
  await customizeReady(page);
  // sizes in parent words; the details say which watches each fits
  await expect(optionGroup(page, 'Size').getByRole('button')).toHaveCount(2);
  await chip(page, 'Size', 'large').click();
  await expect(chip(page, 'Size', 'large')).toHaveAttribute('aria-pressed', 'true');
  await expect(addButton(page)).toHaveText(/· £45$/);
  await expect(page.getByText('free tracked delivery', { exact: true })).toBeVisible(); // uk6 Standard is tracked

  // the placement editor on a 1 : 8 strip: it opens, the unprinted parts are shaded, and it says so
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  const layout = page.locator('[role="application"]');
  await expect(layout).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/the shaded middle sits behind the watch/)).toBeVisible();
  await expect(layout.locator('img[src^="data:image/svg+xml"]')).toHaveCount(1);
  const box = (await layout.boundingBox())!;
  expect(box.height / box.width, 'the layout is the strap’s long, thin shape').toBeGreaterThan(5);
  // the drawing starts on the visible strap, not behind the watch (gap ends about half-way down)
  const art = (await layout.locator('img[alt="your keepsake"]').boundingBox())!;
  expect((art.y - box.y) / box.height).toBeGreaterThan(0.48);
  await expect(page.getByRole('status').filter({ hasText: /too small|blurry|soft/i })).toHaveCount(0);
  await page.getByRole('button', { name: /save & return/ }).click();
  await expect(page).toHaveURL(/\/customize\/watchStrap/);
  await customizeReady(page);

  await addButton(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });
  expect((await basketLines(page)).map((l) => l.sku)).toEqual(['watchStrap-large']);

  await checkoutTotal(page, /watch strap/, '£45');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
