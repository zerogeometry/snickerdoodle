import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The dated 2027 WALL CALENDAR (CHRISTMAS-range-and-postage.md §5): the drawing in progress lands on
 * the cover and repeats through the year, so ONE drawing is already a whole calendar → flip through
 * it (cover → months) → A4 → the basket carries ONE calendar line at the SERVER's price, £24.
 */
test('calendar: one drawing fills all 13 pages → flip through → A4 → basket → server-priced £24', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);

  const tile = page.getByRole('button', { name: 'customize calendar', exact: true });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();

  await expect(page).toHaveURL(/\/customize\/calendar/);
  await expect(page.getByRole('heading', { name: '2027 calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'A5 · £22' })).toHaveAttribute('aria-pressed', 'true');

  // the drawing is on the cover; the twelve months repeat it — every page print-ready
  await expect(page.getByText('1 of 13 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^cover: this drawing, print-ready/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /: repeats this drawing, print-ready/ })).toHaveCount(12);

  // flip through: cover → january 2027 → february 2027, and back
  const carousel = page.getByRole('region', { name: 'flip through your calendar' });
  await expect(carousel.getByText('page 1 of 13')).toBeVisible();
  await carousel.getByRole('button', { name: 'next page' }).click();
  await expect(carousel.getByText('page 2 of 13')).toBeVisible();
  await expect(carousel.getByRole('img', { name: 'your drawing on january 2027' })).toBeVisible();
  await carousel.getByRole('button', { name: 'next page' }).click();
  await expect(carousel.getByText('page 3 of 13')).toBeVisible();
  await carousel.getByRole('button', { name: 'previous page' }).click();
  await expect(carousel.getByText('page 2 of 13')).toBeVisible();

  // give March its own pick (the same drawing — still one favourite) through the bottom sheet
  await page.getByRole('button', { name: /^march: repeats this drawing/ }).click();
  const sheet = page.getByRole('dialog', { name: 'pick a drawing for march' });
  await sheet.getByRole('button', { name: 'this drawing' }).click();
  await sheet.getByRole('button', { name: 'put it on march' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('2 of 13 chosen')).toBeVisible();

  await page.getByRole('button', { name: 'A4 · £24' }).click();
  await expect(page.getByRole('button', { name: /too small to print/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'add to basket · £24' }).click();
  await expect(page).toHaveURL(/\/start-creating/);

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('calendar', { exact: true })).toBeVisible();
  await expect(page.getByText('A4 · 2027 · one favourite drawing')).toBeVisible();
  // the total comes from the server's quote of the A4 calendar, not the basket's display price
  await expect(page.getByText('£24').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
