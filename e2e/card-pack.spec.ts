import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Greetings-card PACK (D22): choose a pack of 5, put the same favourite on every card, and the
 * basket carries ONE pack line (no quantity) at the SERVER's price — £12 for five.
 *
 * The pack is HIDDEN until it graduates (visibleInShop false), so it only appears in the dev
 * curation view (?all=1), which a production server refuses. Against a production build this
 * test skips itself; run it against a dev server to exercise it.
 */
test('card pack: pack of 5 → one drawing on all five → basket → server-priced £12', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page, undefined, '/start-creating?all=1');

  // The pack lives in the full catalogue (no front-of-shop rank).
  await page.getByRole('button', { name: /see the full catalogue/i }).click();
  const catalogue = page.getByRole('dialog');
  await catalogue.getByRole('searchbox', { name: /search the full catalogue/i }).fill('card pack');
  const tile = catalogue.getByRole('button', { name: 'customize card pack', exact: true });
  test.skip((await tile.count()) === 0, 'card packs are hidden — only a dev server shows them (?all=1)');
  await tile.click();

  await expect(page).toHaveURL(/\/customize\/cardPack/);
  await expect(page.getByRole('heading', { name: 'card pack' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pack of 5 · £12' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('blank inside, for your own words')).toBeVisible();
  await expect(page.getByRole('button', { name: /^pick a drawing for card/ })).toHaveCount(5);

  // the thumb-zone action opens the picker on the first empty card
  await page.getByRole('button', { name: 'pick 5 more drawings' }).click();
  const sheet = page.getByRole('dialog', { name: 'pick a drawing for card 1' });
  await sheet.getByRole('button', { name: 'this drawing' }).click();
  await sheet.getByRole('button', { name: 'use it on all 5' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // five fronts, every one print-ready, nothing too small
  await expect(page.getByText('5 of 5 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^card \d: this drawing/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: /too small to print/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'add to basket · £12' }).click();
  await expect(page).toHaveURL(/\/start-creating/);

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('card pack', { exact: true })).toBeVisible();
  await expect(page.getByText('5 cards · blank inside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'edit cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^one more/ })).toHaveCount(0); // a pack has no quantity

  // the SERVER prices it: one pack of five = £12
  const summary = page.locator('dl').first();
  const rowValue = (label: string) => summary.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
  await expect(rowValue('Subtotal')).toHaveText('£12');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
