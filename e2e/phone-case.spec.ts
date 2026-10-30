import { test, expect } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Phone case: type your phone, pick it, choose the grade + finish, and the basket carries exactly
 * that case at the SERVER's price. A phone we can't make for says so plainly.
 */
test('phone case: type to find the phone → tough + matte → basket → server-priced checkout', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);

  await page.getByRole('button', { name: 'customize phone case', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/phoneCase/);
  const box = page.getByRole('combobox', { name: /your phone/i });

  // a phone we don't cover → a plain answer, no dead end
  await box.fill('iphone 11');
  await expect(page.getByText(/can.t make a case for that phone yet/)).toBeVisible();

  // shorthand finds it; Enter picks the top match
  await box.fill('s24u');
  await expect(page.getByRole('option', { name: 'Galaxy S24 Ultra' })).toBeVisible();
  await box.press('Enter');
  await expect(page.getByText(/for Galaxy S24 Ultra/)).toBeVisible();

  await page.getByRole('button', { name: /^tough/ }).click();
  await page.getByRole('button', { name: 'matte', exact: true }).click();
  const add = page.getByRole('button', { name: /add to basket/ });
  await expect(add).toContainText('£30');

  // a tough-only phone offers tough alone
  await box.fill('pixel 9 pro');
  await page.getByRole('option', { name: 'Pixel 9 Pro', exact: true }).click();
  await expect(page.getByRole('button', { name: /^snap/ })).toHaveCount(0);
  await expect(page.getByText(/comes in tough only/)).toBeVisible();

  // back to the Samsung, into the basket
  await box.fill('galaxy s24 ultra');
  await box.press('Enter');
  await page.getByRole('button', { name: /^tough/ }).click();
  await add.click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText(/phone case/).first()).toBeVisible();
  const summary = page.locator('dl').first();
  await expect(summary.locator('xpath=.//dt[normalize-space()="Total"]/following-sibling::dd[1]')).toHaveText('£30');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
