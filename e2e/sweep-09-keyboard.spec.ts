import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { artwork, quietCookies } from './helpers';

/**
 * Test sweep 29 Oct 2026, tester 09: the shop journey with the KEYBOARD ONLY (no mouse, no taps) —
 * skip link → upload a drawing → customize → add to basket → checkout → the basket and the details
 * form. Every stop on the way must show a visible focus ring (CLAUDE.md non-negotiable 7).
 * (Stops before paying: payment hands over to Stripe.)
 */

type Stop = { tag: string; name: string; ring: boolean };
const stops: Stop[] = [];

/** Is the focused element visibly marked (outline or a box-shadow ring)? */
const focusInfo = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50), ring };
  });

/** Press Tab until `target` has focus (max `limit` presses), recording every stop. */
async function tabTo(page: Page, target: Locator, limit = 120, key = 'Tab') {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    const info = await focusInfo(page);
    if (info) stops.push(info);
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`could not reach ${target} with ${key} in ${limit} presses; last stops: ${JSON.stringify(stops.slice(-25).map((s) => `${s.tag}:${s.name}`))}`);
}

test('keyboard only: upload → customize → basket → checkout, with a visible focus ring at every stop', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await quietCookies(page);

  // the skip link is the first stop and lands on <main>
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  // start creating, from the landing header
  await tabTo(page, page.getByRole('link', { name: 'start creating' }).first());
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/start-creating/);

  // upload a drawing: Enter on the button opens the file picker
  const upload = page.getByRole('button', { name: /upload a drawing/i });
  await expect(upload).toBeVisible();
  const chooserP = page.waitForEvent('filechooser');
  await tabTo(page, upload);
  await page.keyboard.press('Enter');
  const chooser = await chooserP;
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: await artwork() });
  await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });

  // customize the mug — by keyboard it's the tile's "+ customize" button (the picture's "customize mug"
  // button is mouse/touch only, tabIndex -1). 09-B4: that button's name doesn't say which product.
  // (it's named for its product — "+ customize your mug" — 09-B4)
  await expect(page.getByRole('button', { name: '+ customize your mug', exact: true })).toBeVisible({ timeout: 60_000 });
  await tabTo(page, page.getByRole('button', { name: '+ customize your mug', exact: true }), 200);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/customize\/mug/);

  // add to basket (returns to the range)
  const add = page.getByRole('button', { name: /add to basket/i }).first();
  await expect(add).toBeVisible({ timeout: 30_000 });
  await tabTo(page, add, 200);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });

  // checkout now → "who's this for?" → a first name → keep it & checkout
  const checkoutNow = page.getByRole('button', { name: /checkout now/i });
  await expect(checkoutNow).toBeEnabled({ timeout: 30_000 });
  await tabTo(page, checkoutNow, 400); // (the whole range comes first: two stops a tile)
  await page.keyboard.press('Enter');
  const who = page.getByRole('dialog', { name: /who.s this for/i });
  await expect(who).toBeVisible();
  const nameField = who.getByPlaceholder('e.g. Mia');
  await tabTo(page, nameField, 20);
  await page.keyboard.type('Mia');
  await tabTo(page, who.getByRole('button', { name: /keep it & checkout/i }), 20);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();

  // the basket line can be reached (remove / edit) and the details form filled
  await tabTo(page, page.getByRole('button', { name: /remove .* from your basket/i }).first(), 80);
  const email = page.locator('#email-d');
  if (await email.isVisible()) {
    await tabTo(page, email, 80);
    await page.keyboard.type('keyboard-only@example.test');
    await expect(email).toHaveValue('keyboard-only@example.test');
  }

  mkdirSync('test-results/sweep-09', { recursive: true });
  writeFileSync('test-results/sweep-09/keyboard-stops.json', JSON.stringify(stops, null, 2));
  const noRing = stops.filter((s) => !s.ring);
  expect(noRing, `focus stops with no visible ring: ${JSON.stringify(noRing.slice(0, 10))}`).toEqual([]);
});
