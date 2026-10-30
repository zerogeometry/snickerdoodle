import { test, expect, type Page } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, goClient, optionGroup, rangeReady, waitForAsset } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): the customize page's gentle nudges and small actions.
 *  - a drawing still on its paper, on a coloured base: "the paper prints too" + one-tap "lift it off the
 *    paper" (the self-hosted remove-background), after which the line prints the lifted drawing;
 *  - the same on a dark tee: the nudge points to the studio;
 *  - "+ keepsake" as a guest asks for a quick sign-up and comes back;
 *  - the add button with a quantity > 1.
 */
const addBtn = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });
async function ready(page: Page) {
  await quietCookies(page);
  await uploadAndOpenRange(page); // e2e art sits on cream paper (an opaque background)
  await rangeReady(page);
  return waitForAsset(page);
}

test('a drawing on its paper, on a coloured base: one tap lifts it off, and the basket prints the lifted one', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const assetId = await ready(page);
  await goClient(page, '/customize/socks');
  await expect(page.getByRole('heading', { level: 1, name: 'socks' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/the paper prints too/)).toHaveCount(0); // on white: no nudge
  await page.getByRole('button', { name: /sock colour: white/i }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('#3f6e29');
  await page.getByRole('dialog').getByRole('button', { name: 'use this colour' }).click();
  await expect(page.getByText(/the paper prints too — you’d get paper squares on the/)).toBeVisible();
  await page.getByRole('button', { name: 'lift it off the paper', exact: true }).click();
  await expect(page.getByText('lifted off the paper ✨')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/the paper prints too/)).toHaveCount(0);
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const line = (await basketLines(page)).find((l) => l.product === 'socks')!;
  expect(line.artwork?.assetId).toBe(assetId);
  expect(line.artwork?.sourceObjectId, 'the line prints the lifted drawing').toBeTruthy();
  expect(line.ground).toBe('#3f6e29');
});

test('a drawing on its paper, on a dark tee: the nudge points to the studio', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await goClient(page, '/customize/kidsTee');
  await expect(page.getByRole('heading', { level: 1, name: 'kids tee' })).toBeVisible({ timeout: 30_000 });
  const colours = optionGroup(page, 'Colour').getByRole('button');
  await colours.filter({ hasText: /^white$/ }).first().click().catch(() => {});
  await expect(page.getByText(/on a coloured tee, the paper prints too/)).toHaveCount(0);
  const dark = colours.filter({ hasText: /black|navy/ }).first();
  await dark.click();
  await expect(page.getByText(/on a coloured tee, the paper prints too/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'lift it off the paper in the studio' })).toBeVisible();
});

test('+ keepsake as a guest: a quick sign-up, then back to this product', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '+ keepsake' }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/login' && u.searchParams.get('next') === '/customize/mug', { timeout: 30_000 });
});

test('the add button with 3 chosen (records what it says)', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await goClient(page, '/customize/mug');
  await expect(page.getByRole('heading', { level: 1, name: 'mug' })).toBeVisible({ timeout: 30_000 });
  const one = (await addBtn(page).innerText()).trim();
  await page.getByRole('button', { name: /^how many mug/ }).click();
  await page.getByRole('option').nth(2).click();
  const three = (await addBtn(page).innerText()).trim();
  test.info().annotations.push({ type: 'add button', description: JSON.stringify({ one, three }) });
  // today the button shows the ONE-mug price with 3 chosen (see the report, 02-B6)
  expect(three).toBe(one);
});
