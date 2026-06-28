import { test, expect } from '@playwright/test';

// Smallest valid PNG (1×1). The content-safety stub passes everything; image size is
// irrelevant to the wow→checkout journey (low-res only matters later, at render).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC',
  'base64',
);

test('wow flow: upload → personalised range → add → checkout → personalised-guest sign-up gate', async ({ page }) => {
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
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: PNG });

  // The personalised range renders with real products.
  await expect(page.getByRole('heading', { name: /your masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
  const addFramed = page.getByRole('button', { name: /add a framed print/i });
  await expect(addFramed).toBeVisible();

  // Add it — this ingests the upload server-side; the basket line carries the artwork.
  await addFramed.click();
  await expect(page.getByRole('link', { name: /basket.*1 item/i })).toBeVisible({ timeout: 30_000 });

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
