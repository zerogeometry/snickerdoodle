import { test, expect, type Page } from '@playwright/test';
import { quietCookies } from './helpers';

/**
 * "festive touches" (Christmas 2026, mockups/christmas screen 3): only in season (1 Nov–6 Jan, UK);
 * one tap puts holly tape / a gold frame / snow on as ordinary layers, another takes it off, undo
 * works, and "stickers" opens the festive shapes. The browser's clock decides the season here.
 */
async function openBlankStudio(page: Page, when: string) {
  await page.clock.setFixedTime(new Date(when));
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await page.goto('/start-creating');
  await page.getByRole('button', { name: /design from scratch/i }).click();
  await page.getByRole('group', { name: 'canvas shape' }).getByRole('button').nth(1).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
}

test('out of season there are no festive touches', async ({ page }) => {
  await openBlankStudio(page, '2026-10-25T12:00:00Z');
  await expect(page.getByRole('toolbar', { name: 'studio tools' }).getByRole('button', { name: 'festive touches' })).toHaveCount(0);
});

test('in season: festive touches go on and off in one tap, undo, and open the festive stickers', async ({ page }) => {
  test.setTimeout(120_000);
  await openBlankStudio(page, '2026-12-01T12:00:00Z');
  const toolbar = page.getByRole('toolbar', { name: 'studio tools' });
  await toolbar.getByRole('button', { name: 'festive touches' }).click();

  // the phone sheet (the desktop panel carries the same, hidden on a phone)
  const sheet = page.getByRole('region', { name: 'festive touches' }).filter({ visible: true });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('your original stays safe');
  await expect(page.locator('body')).not.toContainText(/\bAI\b/);

  const frame = sheet.getByRole('button', { name: 'gold frame' });
  await expect(frame).toHaveAttribute('aria-pressed', 'false');
  await frame.click();
  await expect(frame).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'snowfall' }).click();
  await expect(sheet.getByRole('button', { name: 'snowfall' })).toHaveAttribute('aria-pressed', 'true');

  // undo takes the last touch off; tapping a touch that's on takes it off too
  await page.getByRole('button', { name: 'undo' }).click();
  await expect(sheet.getByRole('button', { name: 'snowfall' })).toHaveAttribute('aria-pressed', 'false');
  await frame.click();
  await expect(frame).toHaveAttribute('aria-pressed', 'false');
  await frame.click();

  // ≥44px targets
  for (const b of await sheet.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // it's an ordinary layer
  await toolbar.getByRole('button', { name: 'layers' }).click();
  await expect(page.getByRole('group', { name: 'layers, top first' }).getByRole('button', { name: 'layer: gold frame' })).toBeVisible();

  // stickers → the shape picker, on its festive set
  await toolbar.getByRole('button', { name: 'festive touches' }).click();
  await page.getByRole('region', { name: 'festive touches' }).filter({ visible: true }).getByRole('button', { name: 'stickers' }).click();
  const shapes = page.getByRole('group', { name: 'shapes options' });
  await expect(shapes.getByRole('button', { name: 'add a gingerbread man' })).toBeVisible();
  await shapes.getByRole('button', { name: 'add a gingerbread man' }).click();
  await expect(page.getByRole('group', { name: 'layers, top first' }).getByRole('button', { name: 'layer: gingerbread man' })).toBeVisible();
});
