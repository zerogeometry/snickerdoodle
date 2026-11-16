import { test, expect } from './test';
import { artwork, quietCookies } from './helpers';

/**
 * "use camera" (founder, 16 Nov 2026): on a phone or tablet it opens the phone's OWN camera app — a
 * file input with capture="environment" — never our in-page camera window. The photo comes back as a
 * picked file and takes the same road as "upload a drawing". A computer has no camera app, so it keeps
 * the webcam window. "upload a drawing" and "change image" stay plain pickers (no capture), so the
 * photo library is always one tap away.
 */
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: IPHONE_UA });

  test('use camera → the camera app (capture input), and the photo comes in like an upload', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/start-creating');
    const cam = page.getByTestId('camera-input');
    await expect(cam).toHaveAttribute('type', 'file');
    await expect(cam).toHaveAttribute('accept', 'image/*');
    await expect(cam).toHaveAttribute('capture', 'environment');
    // the library picker has no capture — choosing from photos stays possible
    await expect(page.locator('input[type="file"]:not([capture])')).toHaveCount(1);

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /use camera/i }).click()]);
    expect(await chooser.element().getAttribute('capture')).toBe('environment');
    await expect(page.getByRole('dialog', { name: /take a photo/i })).toHaveCount(0); // no in-page camera
    await chooser.setFiles({ name: 'image.jpg', mimeType: 'image/png', buffer: await artwork() });
    await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('computer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('use camera → the webcam window (no camera app on a computer)', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/start-creating');
    await page.getByRole('button', { name: /use camera/i }).click();
    await expect(page.getByRole('dialog', { name: /take a photo/i })).toBeVisible();
  });
});
