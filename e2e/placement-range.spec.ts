import { test, expect, type Page } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Edit placement — finer steps, more room (founder, 16 Nov 2026: "finer increments to the edit placement
 * adjustments, as well as increasing the range of movement and zoom for greater flexibility"):
 *  - an arrow press moves the drawing a little (1% of the canvas);
 *  - the move sliders run on past the edge (offset up to ±2) and are never dead, even when the drawing
 *    exactly fills the canvas;
 *  - zoom reaches 8×.
 */
const rangeReady = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
const lr = (page: Page) => page.getByRole('slider', { name: /^Left \/ right/ });
const offsetX = async (page: Page) => Number(await lr(page).getAttribute('data-offset'));

async function openPlacement(page: Page, productKey: string) {
  await page.evaluate((k) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(`/customize/${k}`), productKey);
  await expect(page).toHaveURL(new RegExp(`/customize/${productKey}`));
  await customizeReady(page);
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

test.use({ viewport: { width: 1280, height: 900 } });

test('fine arrow steps, a move range past the edge, zoom to 8×', async ({ page }) => {
  test.setTimeout(240_000);
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  for (const key of ['framedPrint', 'mug', 'cushion']) {
    await openPlacement(page, key);
    const canvas = page.locator('[role="application"]').first();
    const art = page.getByRole('img', { name: 'your keepsake' });
    const box = (await canvas.boundingBox())!;
    // one arrow press: a small, real move
    await canvas.focus();
    const x0 = (await art.boundingBox())!.x;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const x1 = (await art.boundingBox())!.x;
    expect(x1 - x0, `${key}: an arrow press moves it`).toBeGreaterThan(0);
    expect(x1 - x0, `${key}: …by a small step`).toBeLessThan(box.width * 0.03);
    // the slider, all the way: on past the edge (offset 2), the drawing hanging off the right
    await lr(page).fill('1');
    await page.waitForTimeout(200);
    expect(await offsetX(page), `${key}: the far end of the move slider`).toBeCloseTo(2, 2);
    const a = (await art.boundingBox())!;
    expect(a.x + a.width, `${key}: past the right edge`).toBeGreaterThan(box.x + box.width - 1);
    await lr(page).fill('0');
    // zoom all the way in: 8×
    await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('1');
    await page.waitForTimeout(200);
    await expect(page.getByText(/^8\.0×$/), `${key}: zoom reaches 8×`).toBeVisible();
  }
});
