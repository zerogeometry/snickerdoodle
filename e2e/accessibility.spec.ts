import { test, expect, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Accessibility (CLAUDE.md non-negotiable 7): axe finds nothing on the key pages — the marketing and
 * trust pages, the upload page before and after a drawing, customize, the placement editor, the
 * basket/checkout — on a phone and on a laptop. (The gift link page is checked in gift-loop.spec.ts.)
 */
const STATIC = ['/', '/faq', '/help', '/trust/privacy', '/trust/data-complaint', '/checkout', '/start-creating'];

const push = (page: Page, url: string) =>
  page.evaluate((u) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(u), url);

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop', width: 1280, height: 800 },
]) {
  test.describe(`on a ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('the marketing, trust and empty shop pages', async ({ page }) => {
      await quietCookies(page);
      for (const path of STATIC) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForTimeout(500); // pop-in animations settle
        await expectAccessible(page, path);
      }
    });

    test('the shop with a drawing: range, customize, placement, basket', async ({ page }) => {
      test.setTimeout(180_000);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
      await expectAccessible(page, '/start-creating with a drawing');

      for (const key of ['mug', 'framedPrint', 'socks', 'card']) {
        await push(page, `/customize/${key}`);
        await expect(page).toHaveURL(new RegExp(`/customize/${key}`));
        await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();
        await page.waitForTimeout(800);
        await expectAccessible(page, `/customize/${key}`);
      }

      await page.getByRole('button', { name: /edit placement/i }).click();
      await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await expectAccessible(page, '/studio/position');

      await page.getByRole('button', { name: /save & return/ }).click();
      await expect(page).toHaveURL(/\/customize\/card/);
      await page.getByRole('button', { name: /add to basket/i }).first().click();
      await page.goto('/checkout');
      await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
      await expectAccessible(page, '/checkout with a line');
    });
  });
}
