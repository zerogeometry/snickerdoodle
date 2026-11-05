import { test, expect, type Page } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, goClient, optionGroup, rangeReady, waitForAsset } from './shop-db';

/**
 * Made in the UK since Prodigi's "global" change (5 Nov 2026): the Apple Watch strap — a long, thin print file with
 * a gap behind the watch. Customise → a base colour off the wheel → the placement editor, which shades what won't
 * print → basket → checkout at the SERVER's price.
 */
const NAVY = '#26334f';

const addButton = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });
const chip = (page: Page, group: string, name: string) => optionGroup(page, group).getByRole('button', { name, exact: true });

async function checkoutTotal(page: Page, label: RegExp, total: string) {
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText(label).first()).toBeVisible();
  const summary = page.locator('dl').first();
  await expect(summary.locator('xpath=.//dt[normalize-space()="Total"]/following-sibling::dd[1]')).toHaveText(total);
}

test('watch strap: large → the drawing fills the strap → the placement editor shades what’s behind the watch → basket → £45', async ({ page }) => {
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

  // a BASE COLOUR off the wheel, like the other edge-to-edge products (founder, 5 Nov) — so a drawing with no
  // background of its own sits on a colour: the preview is asked for on it, and the basket line carries it
  const asked: Array<{ ground?: string }> = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/mockup')) asked.push(r.postDataJSON()); });
  await page.getByRole('button', { name: /— change it$/ }).click();
  await page.getByLabel('colour code').fill(NAVY.slice(1));
  await page.getByRole('button', { name: 'use this colour' }).click();
  await expect.poll(() => asked.filter((b) => b.ground === NAVY).length, { timeout: 30_000 }).toBeGreaterThan(0);

  // the placement editor on a 1 : 8 strip: it opens, the unprinted parts are shaded, and it says so
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  const layout = page.locator('[role="application"]');
  await expect(layout).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/the shaded middle sits behind the watch/)).toBeVisible();
  await expect(layout.locator('img[src^="data:image/svg+xml"]')).toHaveCount(1);
  const box = (await layout.boundingBox())!;
  expect(box.height / box.width, 'the layout is the strap’s long, thin shape').toBeGreaterThan(5);
  // by default the drawing FILLS the strap (founder, 5 Nov): it reaches every edge of the print layout
  const art = (await layout.locator('img[alt="your keepsake"]').boundingBox())!;
  expect(art.x).toBeLessThanOrEqual(box.x + 2);
  expect(art.y).toBeLessThanOrEqual(box.y + 2);
  expect(art.x + art.width).toBeGreaterThanOrEqual(box.x + box.width - 2);
  expect(art.y + art.height).toBeGreaterThanOrEqual(box.y + box.height - 2);
  // the strap shows as it prints — the server's own preview (laid half by half from Prodigi's template), not an
  // in-browser approximation: no "on the strap" photo toggle, a live preview instead
  await expect(page.getByRole('button', { name: 'on the strap' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^on the / })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: /too small|blurry|soft/i })).toHaveCount(0);
  await page.getByRole('button', { name: /save & return/ }).click();
  await expect(page).toHaveURL(/\/customize\/watchStrap/);
  await customizeReady(page);

  await addButton(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });
  expect((await basketLines(page)).map((l) => [l.sku, l.ground])).toEqual([['watchStrap-large', NAVY]]);

  await checkoutTotal(page, /watch strap/, '£45');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
