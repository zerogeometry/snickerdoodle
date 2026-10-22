import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The same product made with two different drawings is TWO basket lines — each with its own
 * picture and its own quantity — and adding the very same one again counts up only its own line.
 * Socks are used because their preview is drawn in-house (no product photography needed).
 */
async function drawing(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><circle cx="1000" cy="1000" r="700" fill="${fill}"/></svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

async function addSocks(page: Page) {
  await page.getByRole('button', { name: 'customize socks', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/socks/);
  await expect(page.locator('img[alt="your drawing on a socks"]').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /add to basket/i }).click();
  await expect(page).toHaveURL(/\/start-creating/);
}

test('two drawings on the same product are two basket lines, each with its own quantity', async ({ page }) => {
  test.setTimeout(240_000);
  await quietCookies(page);
  await uploadAndOpenRange(page, await drawing('#C8402A'));
  await addSocks(page);
  await page.getByRole('button', { name: 'create another' }).click();
  await uploadAndOpenRange(page, await drawing('#2F5DA8'));
  await addSocks(page);

  const basket = page.getByRole('complementary', { name: 'your basket' }).first();
  const thumbs = basket.locator('img[alt="your drawing on a socks"]');
  await expect(thumbs).toHaveCount(2, { timeout: 60_000 });
  await expect(thumbs.nth(1)).toBeVisible({ timeout: 60_000 });
  const [a, b] = await thumbs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.split('?')[0]));
  expect(a).not.toBe(b); // each line shows its own drawing

  // + on the second line counts up that line only
  await basket.getByRole('button', { name: 'one more socks' }).nth(1).click();
  const lines = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{}').state.items.map((i: { qty: number; artwork: { assetId: string } }) => [i.artwork.assetId, i.qty]));
  expect(lines).toHaveLength(2);
  expect(lines.map((l: [string, number]) => l[1])).toEqual([1, 2]);
  expect(lines[0][0]).not.toBe(lines[1][0]);
});
