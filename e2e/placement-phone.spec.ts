import { test, expect, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Edit placement on a phone (founder, 24 Oct): nothing spills sideways, every control is a ≥44px
 * target, "save & return" stays in the thumb zone, and the live product preview is on screen near
 * the print layout — beside a tall narrow one (height chart, wrapping paper), just under a wide one —
 * not buried below every control. And on a laptop a plain mouse wheel scrolls the page past the print
 * layout; only ctrl/⌘ + wheel (or a trackpad pinch) zooms.
 */
/** The drawing is stored (it has an asset id) once the range has finished making. */
const rangeReady = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });

async function openPlacement(page: Page, productKey: string) {
  await page.evaluate((k) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(`/customize/${k}`), productKey);
  await expect(page).toHaveURL(new RegExp(`/customize/${productKey}`));
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('placement fits, has thumb-sized controls, and shows the real product near the layout', async ({ page }) => {
    test.setTimeout(240_000);
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await rangeReady(page);
    for (const key of ['heightChart', 'wrappingPaper', 'mug', 'socks', 'teaTowel', 'framedPrint', 'phoneCase', 'playingCards']) {
      await openPlacement(page, key);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${key}: no sideways scroll`).toBeLessThanOrEqual(0);

      // every slider is a 44px target (the native track stays thin)
      for (const name of [/^Zoom$/, /^Left \/ right/, /^Up \/ down/]) {
        const box = (await page.getByRole('slider', { name }).boundingBox())!;
        expect(box.height, `${key}: ${String(name)} slider height`).toBeGreaterThanOrEqual(44);
      }
      // save & return: in the thumb zone
      const save = (await page.getByRole('button', { name: /save & return/ }).boundingBox())!;
      expect(save.y + save.height, `${key}: save in the thumb zone`).toBeGreaterThan(844 - 120);

      const live = page.getByRole('region', { name: /^on the / });
      if (['heightChart', 'wrappingPaper', 'mug', 'socks', 'teaTowel'].includes(key)) {
        const r = (await live.boundingBox())!;
        // on screen above the save dock as it opens — not scrolled out of reach
        expect(r.y, `${key}: live preview starts on screen`).toBeLessThan(844 - 140);
        expect(r.x + r.width, `${key}: live preview fits`).toBeLessThanOrEqual(390);
        // it sits right by the print layout, before the sliders
        const zoom = (await page.getByRole('slider', { name: 'Zoom', exact: true }).boundingBox())!;
        expect(r.y).toBeLessThan(zoom.y);
      } else {
        await expect(live).toHaveCount(0); // these have the on-the-product toggle instead
      }
      await page.goBack();
    }
  });
});

test('laptop: a plain wheel scrolls past the print layout; ctrl + wheel zooms', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 640 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await openPlacement(page, 'mug');
  await expect(page.getByText('drag a corner (or pinch, or ctrl/⌘ + scroll) to resize')).toBeVisible();
  const zoom = page.getByRole('slider', { name: 'Zoom', exact: true });
  const canvas = (await page.locator('[role="application"]').boundingBox())!;
  await page.evaluate(() => window.scrollTo(0, 0));
  const z0 = await zoom.inputValue();

  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0); // the page moved
  expect(await zoom.inputValue()).toBe(z0); // the drawing didn't

  await page.evaluate(() => window.scrollTo(0, 0));
  const c = (await page.locator('[role="application"]').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(Number(z0)); // zoomed in
  expect(await page.evaluate(() => window.scrollY)).toBe(0); // and the page stayed put
});
