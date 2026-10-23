import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Customize opens at once from the range (founder, 23 Oct): the product list is the range page's
 * copy (no skeleton wait), and the big preview starts as the very tile you clicked — the same
 * picture — then swaps to the sharp close-up as soon as that's drawn.
 */
test('customize opens with the range tile, then sharpens', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 90_000 });

  const tile = page.locator('img[alt="your drawing on a mug"]').first();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tile.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
  const small = await tile.getAttribute('src');

  // the close-up takes a while, like the deployed site
  let closeUps = 0;
  await page.route('**/api/mockup', async (r) => {
    closeUps++;
    await new Promise((ok) => setTimeout(ok, 6000));
    await r.continue();
  });

  await page.getByRole('button', { name: /^customize mug/i }).first().click();
  await expect(page).toHaveURL(/\/customize\/mug/);

  const big = page.locator('img[alt="your drawing on a mug"]').first();
  // straight away: no loading skeleton, and the tile's own picture
  await expect(big).toBeVisible({ timeout: 3_000 });
  expect(await big.getAttribute('src')).toBe(small);
  await expect(page.getByRole('status').filter({ hasText: 'updating your preview' })).toHaveCount(0);

  // then the sharp close-up replaces it
  await expect.poll(() => big.getAttribute('src'), { timeout: 60_000 }).not.toBe(small);
  expect(closeUps).toBeGreaterThan(0);
});
