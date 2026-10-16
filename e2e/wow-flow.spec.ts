import { test, expect } from '@playwright/test';
import { artwork, quietCookies } from './helpers';

// A realistic drawing: the print-quality rule rightly refuses a tiny picture on a frame.

test('wow flow: upload → personalised range → add → checkout → personalised-guest sign-up gate', async ({ page }) => {
  await quietCookies(page);
  await page.goto('/start-creating');

  // Consent is action-based: a conspicuous notice, and NO tickbox anywhere.
  await expect(page.getByText(/by uploading, you confirm/i)).toBeVisible();
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);

  // Upload via the file chooser the "upload a drawing" button opens (the real control,
  // so the handler is hydrated).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /upload a drawing/i }).click(),
  ]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: await artwork() });

  // The personalised range renders with real products.
  await expect(page.getByRole('heading', { name: /your masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });

  // The Start-Creating range adds via "+ customize" (basket-sidebar model — there is no
  // direct per-tile add). Open the framed print, then add to basket; this ingests the
  // upload server-side and the basket line carries the artwork.
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint(\?|$)/);
  await page.getByRole('button', { name: /add to basket/ }).click();

  // Adding returns to the range with the item in the basket.
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });

  // Checkout — the basket persists across navigation (sessionStorage).
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('framed print').first()).toBeVisible();
  // A personalised line asks a guest to sign up (the controlling-parent gate).
  await expect(page.getByText(/magic-link sign-up/i)).toBeVisible();

  // Placing the order as a guest routes to the sign-up gate, not a charge.
  await page.locator('aside').getByRole('button', { name: /^checkout$/i }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
});
