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

    // Founder brief 5 Nov: the new logo in the header, and the two doodle-paper textures (still,
    // a shade off the section colour). Element shots, so a texture or logo change shows up on its own.
    test('brand: header logo + doodle-paper sections', async ({ page }) => {
      await quietCookies(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('header').first()).toHaveScreenshot(`${vp.name}-brand-header.png`);
      const pinned = page.locator('div.kraft.fixed'); // the phone's thumb-zone CTA can sit over a section
      const steps = page.locator('section.doodle-paper-everyday');
      await steps.scrollIntoViewIfNeeded();
      await expect(steps).toHaveScreenshot(`${vp.name}-doodle-paper-steps.png`, { mask: [pinned] });
      const xmas = page.locator('section.doodle-paper-christmas'); // in season only (1 Nov → 6 Jan)
      if (await xmas.count()) {
        await xmas.scrollIntoViewIfNeeded();
        await expect(xmas).toHaveScreenshot(`${vp.name}-doodle-paper-christmas.png`, { mask: [xmas.locator('img'), pinned] });
      }
    });

    test('christmas last order dates (D24)', async ({ page }) => {
      await quietCookies(page);
      await page.goto('/christmas/delivery-dates');
      await shot(page, `${vp.name}-christmas-delivery-dates`, { mask: [page.locator('tbody')] });
    });

    // C7: a public product page. Dates move with the calendar, so the deadline lines + "arrives by
    // christmas" pills are masked (not the design). (No /christmas hub — founder, 26 + 28 Oct.)
    test('a public product page (C7)', async ({ page }) => {
      await quietCookies(page);
      const dated = () => [page.getByText(/order by|arrives by christmas|too late for christmas|last order dates for christmas/)];
      await page.goto('/products/ceramic-christmas-ornament');
      await shot(page, `${vp.name}-product-ornament`, { mask: dated() });
    });

    test('the range, customize, studio, placement, checkout', async ({ page }) => {
      test.setTimeout(180_000);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
      await shot(page, `${vp.name}-range`);

      await push(page, '/customize/mug');
      await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();
      await shot(page, `${vp.name}-customize-mug`);

      // the 2027 calendar builder: the drawing on the cover, the flip-through, the 13 pages
      await push(page, '/customize/calendar');
      await expect(page.getByRole('heading', { name: '2027 calendar' })).toBeVisible();
      await expect(page.getByText('1 of 13 chosen')).toBeVisible();
      await shot(page, `${vp.name}-customize-calendar`);
      // the card pack builder: laid out like every product page (the pack + its fronts left, options right)
      await push(page, '/customize/cardPack');
      await expect(page.getByRole('heading', { name: 'card pack' })).toBeVisible();
      await expect(page.getByText(/1 of \d+ chosen/)).toBeVisible();
      await shot(page, `${vp.name}-customize-cardpack`);
      // the christmas family bundle builder: three sizes, the drawing on the table, a picture of the set
      await push(page, '/customize/christmasBundle?size=4');
      await expect(page.getByRole('heading', { name: 'christmas family bundle' })).toBeVisible();
      await expect(page.getByRole('radio', { name: /a set for 4/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('button', { name: /add to basket · £145$/ })).toBeVisible();
      await expect(page.getByRole('img', { name: /your set for 4/ })).toBeVisible({ timeout: 30_000 });
      await shot(page, `${vp.name}-customize-christmas-bundle`);
      await push(page, '/customize/mug');
      await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();

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

    test('the multi photo frame builder', async ({ page }) => {
      test.setTimeout(180_000);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
      // the 6 × 4 on the founder's frame photo, the drawing in every square, the squares under it
      await push(page, '/customize/multiPhotoFrame');
      await expect(page.getByRole('heading', { name: 'multi photo frame' })).toBeVisible();
      await expect(page.getByText('1 of 24 chosen')).toBeVisible();
      const photo = page.getByRole('img', { name: /^your 16×24″ landscape frame/ });
      await expect(photo).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
      await shot(page, `${vp.name}-customize-multi-photo-frame`, { mask: [photo] });
    });

    test('family home and a gift link (signed in)', async ({ page, browser }) => {
      test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET to sign in');
      test.setTimeout(180_000);
      const parent = testEmail('visual');
      await quietCookies(page);
      await signInByEmailLink(page, parent, '/start-creating');
      await sql()`update accounts set display_name = 'Sam' where email = ${parent}`; // a steady name on screen
      await uploadAndOpenRange(page);
      await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
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
