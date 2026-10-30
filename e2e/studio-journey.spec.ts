import { test, expect } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * create → studio → basket: an edit made in the Studio is what the range previews and what
 * goes in the basket. No account wall anywhere on the way (the wow flow).
 */
test('studio journey: upload → studio edit → done → the range shows the edit → basket → checkout', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);

  const framePreview = page.locator('img[alt="your drawing on a framedPrint"]').first();
  await expect(framePreview).toBeVisible({ timeout: 45_000 });
  const before = await framePreview.getAttribute('src');

  // Into the Studio (client-side, so the in-memory upload comes along)
  await page.getByRole('button', { name: 'edit in studio' }).click();
  await expect(page).toHaveURL(/\/studio/);
  const undo = page.getByRole('button', { name: 'undo' });
  await expect(undo).toBeDisabled(); // nothing to undo yet

  // One simple, honest edit: flip it sideways
  await page.getByRole('button', { name: 'flip' }).first().click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await expect(undo).toBeEnabled();

  // undo / redo round-trip
  await undo.click();
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'redo' }).click();
  await expect(undo).toBeEnabled();

  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();

  // Back on the range, the previews are re-made from the edited design
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(framePreview).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => framePreview.getAttribute('src'), { timeout: 45_000, message: 'the frame preview is re-made from the edit' }).not.toBe(before);

  // …and it goes in the basket
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint/);
  await page.getByRole('button', { name: /add to basket/ }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('framed print').first()).toBeVisible();
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
