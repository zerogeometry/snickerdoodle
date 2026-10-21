import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The family set: the same drawing on everyone's tee, one shared colour. Three pieces or more
 * earns 5% off the set — and that saving is worked out by the SERVER at checkout, never trusted
 * from the page.
 */
test('family set: build a set → 3 pieces earns the saving → basket → server-priced checkout', async ({ page }) => {
  await quietCookies(page);
  await uploadAndOpenRange(page);

  await page.getByRole('button', { name: 'build a family set' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('dress the whole family')).toBeVisible();

  // starts as one kids tee + one adult tee, with a nudge (not a push) toward the third piece
  await expect(sheet.getByText('2 pieces')).toBeVisible();
  await expect(sheet.getByText(/add 1 more piece and 5% comes off/)).toBeVisible();

  // add a second kids tee → 3 pieces
  await sheet.getByRole('button', { name: 'kids tee', exact: true }).click();
  await expect(sheet.getByText('3 pieces')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'remove this kids tee' })).toHaveCount(2);

  await sheet.getByRole('button', { name: /add the set to basket/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText(/kids tee/).first()).toBeVisible();
  await expect(page.getByText(/adult tee/).first()).toBeVisible();

  // the server re-prices: subtotal 2 × £25 + £32 = £82, and the set saving is applied
  const summary = page.locator('dl').first();
  const rowValue = (label: string) => summary.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
  await expect(rowValue('Subtotal')).toHaveText('£82');
  await expect(rowValue('Family set saving (5%)')).toHaveText(/£4\.10/); // 5% of £82
  const total = (await rowValue('Total').innerText()).replace(/[£,]/g, '');
  expect(Number(total)).toBeCloseTo(82 * 0.95, 1);
});
