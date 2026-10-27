import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from '../../e2e/helpers';
import { hasDb } from '../../e2e/db';
import { parentWithKeepsakeAndGiftLink, shot } from './helpers';

/**
 * The main screens at 390px (mobile-390) and 1280px (desktop-1280), against committed
 * baselines. A failing diff is either a regression or an intended change — re-record with
 * `npm run test:visual:update` only after looking at the diff in the report.
 * The side-by-side with /mockups lives in mockup-pairs.spec.ts (MOCKUP-DIFF.md).
 */

test.beforeEach(async ({ page }) => {
  await quietCookies(page);
});

test.describe('public', () => {
  test('landing', async ({ page }) => {
    await page.goto('/');
    await shot(page, 'landing');
  });

  test('start creating (before an upload)', async ({ page }) => {
    await page.goto('/start-creating');
    await shot(page, 'start-creating');
  });

  test('catalogue', async ({ page }) => {
    await page.goto('/catalogue');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, 'catalogue');
  });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await shot(page, 'login');
  });

  for (const slug of ['privacy', 'family-promise', 'terms', 'cookies', 'data-complaint']) {
    test(`trust · ${slug}`, async ({ page }) => {
      await page.goto(`/trust/${slug}`);
      await shot(page, `trust-${slug}`, { fullPage: false }); // long prose: the first screen carries the look
    });
  }
});

test.describe('the making flow (a drawing uploaded)', () => {
  test('range → customize → studio → checkout', async ({ page }) => {
    await uploadAndOpenRange(page);
    await expect(page.locator('img[alt="your drawing on a framedPrint"]').first()).toBeVisible({ timeout: 45_000 });
    await shot(page, 'range');

    await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
    await expect(page).toHaveURL(/\/customize\/framedPrint/);
    await expect(page.locator('img[alt="your drawing on a framedPrint"]').first()).toBeVisible({ timeout: 45_000 });
    await shot(page, 'customize-framed-print');

    await page.getByRole('button', { name: /add to basket/i }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/start-creating/);

    await page.getByRole('button', { name: 'edit in studio' }).click();
    await expect(page).toHaveURL(/\/studio/);
    await expect(page.locator('canvas[aria-label^="your drawing"]')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'studio', { fullPage: false });

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
    await shot(page, 'checkout');
  });
});

test.describe('signed in (a parent with one keepsake and a gift link)', () => {
  test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET');

  test('home → family → gift link (as the relative) → gone link', async ({ page }) => {
    const { token } = await parentWithKeepsakeAndGiftLink(page);

    await page.goto('/home');
    await expect(page.getByRole('button', { name: /choose who can see this keepsake/i })).toBeVisible();
    await shot(page, 'home');

    await page.goto('/family');
    await shot(page, 'family');

    await page.context().clearCookies();
    await page.goto(`/g/${token}`);
    await expect(page.getByText(/ready to give/i)).toBeVisible();
    await shot(page, 'gift-link');

    await page.goto('/g/notARealGiftLinkToken123');
    await shot(page, 'gift-link-not-found');
  });
});
