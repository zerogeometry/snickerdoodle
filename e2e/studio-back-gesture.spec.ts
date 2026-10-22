import { test, expect, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Phones leave the studio with the BACK GESTURE (iOS swipe / Android back), not the "done" button.
 * With unsaved edits that must ask "save your changes?" — never silently drop them (a removed
 * background that didn't make it back to the range). With no edits, back just goes back.
 */
async function openStudio(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  // the picture is drawn (a tap before then is ignored)
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(500);
}

test('back gesture with unsaved edits asks, and saving keeps the removed background', async ({ page }) => {
  test.setTimeout(300_000);
  await openStudio(page);
  await page.getByRole('button', { name: 'remove background' }).last().click();
  await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled({ timeout: 150_000 });

  await page.goBack();
  await expect(page.getByRole('dialog', { name: /save your changes/i })).toBeVisible();
  await expect(page).toHaveURL(/\/studio$/); // still here, edits intact

  await page.getByRole('button', { name: /save & go back/i }).click();
  await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /edited · back to studio/i })).toBeVisible();
  // and back from the range lands on the studio once — not a stale duplicate
  await page.goBack();
  await expect(page).toHaveURL(/\/studio$/);
  // the picture is drawn (a tap before then is ignored)
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(500);
});

test('back gesture with no edits just goes back', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
