import { test, expect, type Page } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, gbp, goClient, optionGroup, rangeReady, shopCatalogue, waitForAsset } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): the customize page's quantity + pack wording, and editing a basket
 * line in place.
 */
async function ready(page: Page) {
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  return waitForAsset(page);
}
const addBtn = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });
const qtySelect = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^how many ${label}`) });

test('pack labels say how many the price buys (placemats, coasters 2 / 4 / 6)', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await goClient(page, '/customize/placemat');
  await expect(page.getByText('a set of 4 placemats, one drawing on all 4', { exact: true })).toBeVisible({ timeout: 30_000 });
  // the bundle-only placemat packs (1 / 2 / 6) are never offered on their own
  await expect(optionGroup(page, 'Size')).toHaveCount(0);
  await goClient(page, '/customize/coaster');
  await expect(page.getByText('a set of 6 coasters, one drawing on all 6', { exact: true })).toBeVisible({ timeout: 30_000 });
  const sizes = optionGroup(page, 'Size').getByRole('button');
  await expect(sizes).toHaveText(['pack of 2', 'pack of 4', 'pack of 6']); // no single coaster
  await sizes.nth(0).click();
  await expect(page.getByText('a set of 2 coasters, one drawing on both', { exact: true })).toBeVisible();
  await expect(addBtn(page)).toHaveText(/· £18$/);
  await sizes.nth(1).click();
  await expect(page.getByText('a set of 4 coasters, one drawing on all 4', { exact: true })).toBeVisible();
  await expect(addBtn(page)).toHaveText(/· £26$/);
});

test('buy more & save: the dropdown shows each quantity’s saving and adds that many', async ({ page }) => {
  test.setTimeout(180_000);
  const assetId = await ready(page);
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('buy more & save', { exact: true })).toBeVisible();
  await qtySelect(page, 'mug').click();
  const opts = page.getByRole('option');
  await expect(opts).toHaveCount(10);
  const texts = await opts.allInnerTexts();
  expect(texts[0]!.replace(/\s+/g, ' ').trim(), 'one mug: no saving note').toBe('1');
  expect(texts.some((t) => /\d+% off/.test(t)), `some quantity earns a saving: ${texts.join(' / ')}`).toBe(true);
  await opts.nth(2).click(); // 3
  await expect(qtySelect(page, 'mug')).toHaveText(/^3/);
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const lines = await basketLines(page);
  expect(lines).toHaveLength(1);
  expect(lines[0]!.qty).toBe(3);
  expect(lines[0]!.artwork?.assetId).toBe(assetId);
});

// 02-B1 (CONFIRMED 29 Oct): editing a line into a variant another line already has folds the two lines
// (useBasket.update sums their quantities) — then the page's setLineQty(id, qty) overwrites the sum with the
// EDITED line's own quantity, so 2 + 1 mugs become 1. src/app/customize/[productKey]/page.tsx:556-557.
// Observed: expected 3, received 1.
test('editing a basket line into another line’s variant keeps BOTH quantities (02-B1)', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  const mug = (await shopCatalogue()).find((p) => p.key === 'mug')!;
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  const colours = optionGroup(page, 'Colour').getByRole('button');
  expect(await colours.count(), 'the mug has more than one colour').toBeGreaterThan(1);
  const [c0, c1] = [(await colours.nth(0).innerText()).trim(), (await colours.nth(1).innerText()).trim()];
  // line A: colour 0, qty 2
  await colours.nth(0).click();
  await qtySelect(page, 'mug').click();
  await page.getByRole('option').nth(1).click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  // line B: colour 1, qty 1
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  await optionGroup(page, 'Colour').getByRole('button', { name: c1 }).click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  let lines = await basketLines(page);
  expect(lines.map((l) => l.qty)).toEqual([2, 1]);
  // edit line B and change it to colour 0 → it folds into line A: 2 + 1 = 3 mugs
  await goClient(page, `/customize/mug?edit=${encodeURIComponent(lines[1]!.id)}`);
  await expect(addBtn(page)).toHaveText(/update basket · /, { timeout: 30_000 });
  await optionGroup(page, 'Colour').getByRole('button', { name: c0 }).click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  lines = await basketLines(page);
  expect(lines, 'folded into one line').toHaveLength(1);
  expect(lines[0]!.sub).toContain(c0);
  expect(lines[0]!.pricePence).toBe(mug.variants.find((v) => v.attributes.colour === c0 && v.attributes.size === lines[0]!.sub!.split(' · ')[0])?.pricePence ?? lines[0]!.pricePence);
  expect(lines[0]!.qty, `qty after folding (2 + 1); got ${lines[0]!.qty} — ${gbp(lines[0]!.pricePence)} each`).toBe(3);
});

test('the basket sidebar’s edit reopens THAT line (drawing, variant, placement) in "update basket" mode', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  await optionGroup(page, 'Colour').getByRole('button').last().click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const [line] = await basketLines(page);
  const basket = page.getByRole('complementary', { name: 'your basket' }).first();
  await basket.getByRole('button', { name: /^edit mug/ }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/customize/mug' && u.searchParams.get('edit') === line!.id);
  await expect(addBtn(page)).toHaveText(/update basket · /, { timeout: 30_000 });
  await expect(optionGroup(page, 'Colour').getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
});

// 02-B4: at CHECKOUT the pencil on an ordinary line ("customize your mug") goes to /customize/mug WITHOUT
// ?edit= (only packs, the bundle and calendars get it — src/app/checkout/page.tsx:355). So it opens a fresh
// customize page on the drawing in progress (not the line's), at the default variant + placement, and its
// button ADDS a second line instead of updating this one. The basket sidebar (Basket.tsx:36) does it right.
// CONFIRMED 29 Oct: landed on http://localhost:3202/customize/mug with "add to basket · £18".
test('02-B4: checkout’s "customize your …" reopens that line in update mode', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  await optionGroup(page, 'Colour').getByRole('button').last().click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'customize your mug' }).click();
  await expect(page).toHaveURL(/\/customize\/mug/);
  const url = page.url();
  const button = (await addBtn(page).innerText()).trim();
  const colourKept = await optionGroup(page, 'Colour').getByRole('button').last().getAttribute('aria-pressed');
  test.info().annotations.push({ type: '02-B4', description: JSON.stringify({ url, button, colourKept }) });
  expect.soft(url, 'opens the line in edit mode').toMatch(/\?edit=/);
  expect(button, 'the button updates the line').toMatch(/^update basket/);
});
