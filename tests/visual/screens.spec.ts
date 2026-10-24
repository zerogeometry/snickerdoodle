import { test, expect, type Locator, type Page } from '@playwright/test';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from '../../e2e/harness';
import { quietCookies, uploadAndOpenRange } from '../../e2e/helpers';

/**
 * The main screens, as /mockups lays them out (landing · start creating · the range · customize ·
 * studio · placement · checkout · family home · gift link · help), at 390px and 1280px.
 *
 * Masked (they change from run to run, not with the design): the product photos (composed on the
 * server, arriving in their own time), the "making it" loader, toasts and dates.
 */
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop', width: 1280, height: 800 },
] as const;

const masks = (page: Page): Locator[] => [
  page.locator('img[alt^="your drawing on"]'),
  page.locator('[data-instant]'),
  page.locator('[aria-label="your drawing on two grown-up tees and two kids tees — a matching family set"]'),
  page.getByRole('status').filter({ hasText: /making|warming up/ }),
  page.locator('div.pointer-events-none.fixed.z-\\[60\\]'), // toasts come and go on a timer
  page.locator('time'),
];

async function shot(page: Page, name: string, opts: { fullPage?: boolean; mask?: Locator[] } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: opts.fullPage ?? true, mask: [...masks(page), ...(opts.mask ?? [])] });
}

const push = (page: Page, url: string) =>
  page.evaluate((u) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(u), url);

for (const vp of WIDTHS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, ...(vp.width < 600 ? { hasTouch: true, isMobile: true } : {}) });

    test('landing, start creating, help', async ({ page }) => {
      await quietCookies(page);
      await page.goto('/');
      // the landing's example wall drifts sideways by design — hold it still for the picture
      await shot(page, `${vp.name}-landing`, { mask: [page.locator('.marquee-track')] });
      await page.goto('/start-creating');
      await shot(page, `${vp.name}-start-creating`);
      await page.goto('/help');
      await shot(page, `${vp.name}-help`);
    });

    test('the range, customize, studio, placement, checkout', async ({ page }) => {
      test.setTimeout(180_000);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
      await shot(page, `${vp.name}-range`);

      await push(page, '/customize/mug');
      await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();
      await shot(page, `${vp.name}-customize-mug`);

      await page.getByRole('button', { name: /edit placement/i }).click();
      await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
      await shot(page, `${vp.name}-placement-mug`, { fullPage: false });
      await page.getByRole('button', { name: /save & return/ }).click();
      await expect(page).toHaveURL(/\/customize\/mug/);
      await page.getByRole('button', { name: /add to basket/i }).first().click();

      await page.goto('/checkout');
      await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
      await shot(page, `${vp.name}-checkout`);

      await page.goto('/start-creating');
      await page.getByRole('button', { name: /edit in studio/i }).first().click();
      await expect(page).toHaveURL(/\/studio$/);
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas[aria-label^="your drawing"]') as HTMLCanvasElement | null;
        return !!c && c.width > 0;
      });
      await shot(page, `${vp.name}-studio`, { fullPage: false });
    });

    test('family home and a gift link (signed in)', async ({ page, browser }) => {
      test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET to sign in');
      test.setTimeout(180_000);
      const parent = testEmail('visual');
      await quietCookies(page);
      await signInByEmailLink(page, parent, '/start-creating');
      await sql()`update accounts set display_name = 'Sam' where email = ${parent}`; // a steady name on screen
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
      await page.getByRole('button', { name: /\+ keepsake/ }).click();
      await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
      await clearForTest(parent);

      await page.goto('/home');
      await expect(page.getByRole('button', { name: /create a gift request/ })).toBeVisible();
      await shot(page, `${vp.name}-family-home`);

      await page.getByRole('button', { name: /create a gift request/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'create gift request' }).click();
      const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
      await expect(shown).toBeVisible({ timeout: 30_000 });
      const path = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];

      const guest = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' })).newPage();
      await quietCookies(guest);
      await guest.goto(path);
      await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
      await shot(guest, `${vp.name}-gift-link`);
      await guest.context().close();
    });
  });
}
