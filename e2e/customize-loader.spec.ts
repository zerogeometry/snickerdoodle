import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Customize: while a new preview is being made (here, a different sock length) the "making it"
 * loader sits over the previous photo, and it leaves only once the NEW photo has painted.
 * Socks are used because their preview is drawn in-house (no product photography needed).
 */
for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test(`customize preview shows the loader until the new photo paints (${vp.w}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: 'customize socks', exact: true }).click();
    await expect(page).toHaveURL(/\/customize\/socks/);

    const loader = page.getByRole('status').filter({ hasText: 'updating your preview' });
    const photo = page.locator('img[alt="your drawing on a socks"]').first();
    await expect(photo).toBeVisible({ timeout: 60_000 });
    await expect(loader).toHaveCount(0, { timeout: 10_000 });
    const before = await photo.getAttribute('src');

    // behave like the deployed site: a few seconds per preview
    await page.route('**/api/mockup', async (r) => {
      await new Promise((ok) => setTimeout(ok, 2500));
      await r.continue();
    });
    const other = page.getByRole('button', { name: /^(ankle|tube)$/ }).and(page.locator('[aria-pressed="false"]'));
    await other.first().click();

    await expect(loader).toBeVisible({ timeout: 5_000 });
    expect(await photo.getAttribute('src')).toBe(before); // the old photo stays underneath
    await expect(page.getByRole('button', { name: /enlarge socks preview/i })).toBeVisible();

    await expect(loader).toHaveCount(0, { timeout: 60_000 });
    expect(await photo.getAttribute('src')).not.toBe(before);
    expect(await photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  });
}
