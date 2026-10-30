import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from './test';
import { expectAccessible } from './a11y';
import { clearForTest, hasDb, signInByEmailLink, testEmail } from './harness';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Test sweep 29 Oct 2026, tester 09: axe on the shop screens e2e/accessibility.spec.ts doesn't reach —
 * the Studio, the builders (calendar, card pack, Christmas family bundle), more customize pages, the
 * "who's this for?" pop-up, the full catalogue pop-up, the mobile menu, a signed-in family home with a
 * keepsake — at 390px and 1280px.
 */
const push = (page: Page, url: string) =>
  page.evaluate((u) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(u), url);

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop', width: 1280, height: 800 },
]) {
  test(`axe on the shop screens with a drawing (${vp.name})`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await quietCookies(page);
    const failures: string[] = [];
    const check = async (label: string) => {
      await page.waitForTimeout(800);
      try {
        await expectAccessible(page, label);
      } catch (e) {
        failures.push(String((e as Error).message).split('\n').slice(0, 10).join('\n'));
      }
    };

    await uploadAndOpenRange(page);
    await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });

    // the full catalogue pop-up
    await page.getByRole('button', { name: /see the full catalogue/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check('full catalogue pop-up');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // the studio
    await page.getByRole('button', { name: /edit in studio/i }).first().click();
    await expect(page).toHaveURL(/\/studio/);
    await expect(page.locator('canvas[aria-label^="your drawing"]')).toBeVisible({ timeout: 30_000 });
    // (/studio itself: 09-B6, pinned below)

    for (const key of ['calendar', 'cardPack', 'christmasBundle', 'phoneCase', 'kidsTee', 'cushion', 'jigsaw', 'ceramicOrnament']) {
      await push(page, `/customize/${key}`);
      await expect(page).toHaveURL(new RegExp(`/customize/${key}`));
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(1500);
      await check(`/customize/${key}`);
    }

    // add something, then "checkout now" → "who's this for?"
    await push(page, '/customize/mug');
    await page.getByRole('button', { name: /add to basket/i }).first().click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
    await page.getByRole('button', { name: /checkout now/i }).click();
    await expect(page.getByRole('dialog', { name: /who.s this for/i })).toBeVisible();
    await check('who’s this for? pop-up');

    mkdirSync('test-results/sweep-09', { recursive: true });
    writeFileSync(`test-results/sweep-09/shop-axe-${vp.name}.json`, JSON.stringify(failures, null, 2));
    expect(failures, failures.join('\n\n')).toEqual([]);
  });
}

test('axe on the mobile menu, and a signed-in family home with a keepsake', async ({ page }) => {
  test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  // (axe on the open menu: 09-B7, pinned below)
  await page.keyboard.press('Escape');

  const parent = testEmail('t9-home');
  await signInByEmailLink(page, parent, '/start-creating');
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  await clearForTest(parent);
  await page.goto('/home');
  await expect(page.getByRole('button', { name: /create a gift request/ })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'reports/test-sweep-2026-10-29/shots/09/phone-home-with-keepsake.jpg', type: 'jpeg', quality: 62 });
  // a keepsake tile is one button: its name must hold the words you can see (09-B8, pinned below)
  const tile = page.getByRole('button', { name: /choose who can see this keepsake/ }).first();
  await expect(tile).toBeVisible();
  test.info().annotations.push({ type: '09-B8', description: `visible "${(await tile.innerText()).replace(/\s+/g, ' ')}" vs name "${await tile.getAttribute('aria-label')}"` });
});

test('09-B8: /home keepsake tiles — the button’s accessible name includes its visible words (axe label-content-name-mismatch)', async ({ page }) => {
  await quietCookies(page);
  const parent = testEmail('t9-home-b8');
  await signInByEmailLink(page, parent, '/start-creating');
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  await page.goto('/home');
  await expect(page.getByRole('button', { name: /create a gift request/ })).toBeVisible();
  await expectAccessible(page, '/home with a keepsake');
});

test('09-B6: the Studio has a <main id="main"> (the skip link lands somewhere; axe "region" + "skip-link")', async ({ page }) => {
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await expect(page.locator('canvas[aria-label^="your drawing"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main#main')).toHaveCount(1);
  await expectAccessible(page, '/studio');
});

test('09-B7: the open mobile menu passes axe (its <nav> landmarks are named)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await expectAccessible(page, 'mobile menu');
});
