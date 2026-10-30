import { test, expect, type Request } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Greetings-card PACK (D22): choose a pack of 5, put the same favourite on every card, pick ONE base
 * colour for the pack's fronts, and the basket carries ONE pack line (no quantity) at the SERVER's
 * price — £12 for five; the colour never changes it.
 * The pack is on show (2026-10-21), in the range with everything else.
 */
test('card pack: pack of 5 → one drawing on all five → basket → server-priced £12', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page);

  // The pack sits in the range with the rest of the collection.
  const tile = page.getByRole('button', { name: 'customize card pack', exact: true });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();

  await expect(page).toHaveURL(/\/customize\/cardPack/);
  await expect(page.getByRole('heading', { name: 'card pack' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pack of 5 · £12' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('blank inside, for your own words')).toBeVisible();
  // the drawing you came from is already on card 1 (6a2f3cc, founder 26 Oct); the other four wait
  await expect(page.getByRole('button', { name: /^card 1: this drawing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^pick a drawing for card/ })).toHaveCount(4);

  // the thumb-zone action opens the picker on the first empty card
  await page.getByRole('button', { name: 'pick 4 more drawings' }).click();
  const sheet = page.getByRole('dialog', { name: 'pick a drawing for card 2' });
  await sheet.getByRole('button', { name: 'this drawing' }).click();
  await sheet.getByRole('button', { name: 'use it on all 5' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // five fronts, every one print-ready, nothing too small
  await expect(page.getByText('5 of 5 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^card \d: this drawing/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: /too small to print/ })).toHaveCount(0);

  // one base colour for the whole pack — the same wheel as every other product; every front re-previews on it
  const NAVY = '#26334f';
  const bodies: { ground?: string }[] = [];
  const record = (r: Request) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/mockup')) bodies.push(r.postDataJSON());
  };
  await page.getByRole('button', { name: 'background colour: white — change it' }).click();
  await page.getByLabel('colour code').fill(NAVY.slice(1));
  page.on('request', record);
  await page.getByRole('button', { name: 'use this colour' }).click();
  await expect(page.getByRole('button', { name: 'background colour: navy — change it' })).toBeVisible();
  await expect(page.getByText('fills the whole card front, edge to edge, behind their drawing')).toBeVisible();
  await expect.poll(() => bodies.filter((b) => b.ground === NAVY).length, { timeout: 30_000 }).toBeGreaterThan(0);
  page.off('request', record);
  for (const b of bodies) expect(b.ground).toBe(NAVY);

  await page.getByRole('button', { name: 'add to basket · £12' }).click();
  await expect(page).toHaveURL(/\/start-creating/);

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('card pack', { exact: true })).toBeVisible();
  await expect(page.getByText('5 cards · on navy · blank inside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'edit the cards in your card pack' })).toBeVisible(); // visible text 'edit cards', named for its line
  await expect(page.getByRole('button', { name: /^one more/ })).toHaveCount(0); // a pack has no quantity

  // the SERVER prices it: one pack of five = £12
  const summary = page.locator('dl').first();
  const rowValue = (label: string) => summary.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
  await expect(rowValue('Subtotal')).toHaveText('£12');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
