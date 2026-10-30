import { test, expect, type Page } from '@playwright/test';
import { hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { assetRow, derivatives, resetRateLimits, studioReady, tabUpload, uploadArt } from './sweep-01-helpers';

/**
 * Test sweep 29 Oct — tester 01: every way INTO the Studio, and the way back. Each entry is opened, an
 * edit is made, and "done" (or the back gesture) must land where the parent came from, with the edit
 * applied there. Retired / empty routes too.
 */

test.beforeEach(async () => resetRateLimits());
const nav = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' }).or(page.getByRole('navigation', { name: 'studio tools' }));
const flipAndDone = async (page: Page) => {
  await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
};
const rangeReady = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test('retired /studio/<id> goes to the create page; /studio with nothing open says so', async ({ page }) => {
      await page.goto('/studio/00000000-0000-0000-0000-000000000000');
      await expect(page).toHaveURL(/\/start-creating/);
      await page.goto('/studio');
      await expect(page.getByRole('heading', { name: 'nothing in the studio yet' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'upload a drawing' })).toHaveAttribute('href', '/start-creating');
    });

    test('card pack picker → edit in studio → done: back on the card pack, the picker open on that card, the drawing chosen', async ({ page }) => {
      test.setTimeout(240_000);
      await uploadArt(page);
      await rangeReady(page);
      await page.getByRole('button', { name: 'customize card pack', exact: true }).click();
      await page.getByRole('button', { name: 'pick a drawing for card 2' }).click();
      const sheet = page.getByRole('dialog', { name: 'pick a drawing for card 2' });
      await expect(sheet).toBeVisible();
      const item = sheet.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
      await item.getByRole('button', { name: 'edit in studio' }).click();
      await studioReady(page);
      await flipAndDone(page);
      await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
      const back = page.getByRole('dialog', { name: 'pick a drawing for card 2' });
      await expect(back, 'the picker reopens on card 2').toBeVisible({ timeout: 30_000 });
      await expect(back.getByRole('button', { name: 'this drawing' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page, '?resume=1 is tidied away').toHaveURL(/\/customize\/cardPack$/);
      const u = await tabUpload(page);
      expect((await assetRow(u!.assetId!))?.studio_doc, 'the edit was saved').toBeTruthy();
    });

    test('calendar picker → edit in studio → done: back on the calendar with that page’s picker open', async ({ page }) => {
      test.setTimeout(240_000);
      await uploadArt(page);
      await rangeReady(page);
      await page.getByRole('button', { name: 'customize calendar', exact: true }).click();
      // the cover is the drawing; every month repeats it until it gets its own — give February its own
      await page.getByRole('button', { name: / — pick its own drawing$/ }).nth(1).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      const title = (await sheet.getByRole('heading').first().textContent())?.trim();
      const item = sheet.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
      await item.getByRole('button', { name: 'edit in studio' }).click();
      await studioReady(page);
      await flipAndDone(page);
      await expect(page).toHaveURL(/\/customize\/calendar/, { timeout: 60_000 });
      const back = page.getByRole('dialog');
      await expect(back).toBeVisible({ timeout: 30_000 });
      await expect(back.getByRole('heading').first()).toHaveText(title!);
      await expect(back.getByRole('button', { name: 'this drawing' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/\/customize\/calendar$/);
    });

    test('card pack picker → studio → BACK GESTURE with an edit: asks, saves, lands back on the card pack', async ({ page }) => {
      test.setTimeout(240_000);
      await uploadArt(page);
      await rangeReady(page);
      await page.getByRole('button', { name: 'customize card pack', exact: true }).click();
      await page.getByRole('button', { name: 'pick a drawing for card 2' }).click();
      const item = page.getByRole('dialog').getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
      await item.getByRole('button', { name: 'edit in studio' }).click();
      await studioReady(page);
      await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
      await page.getByRole('button', { name: 'sideways' }).click();
      await page.goBack();
      await expect(page.getByRole('dialog', { name: /save your changes/i })).toBeVisible();
      await page.getByRole('button', { name: /save & go back/i }).click();
      await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
      await expect(page.getByRole('dialog', { name: 'pick a drawing for card 2' })).toBeVisible({ timeout: 30_000 });
    });

    test('customise → edit placement → the placement editor → save & return lands back on the product', async ({ page }) => {
      test.setTimeout(240_000);
      await uploadArt(page);
      await rangeReady(page);
      await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
      await expect(page).toHaveURL(/\/customize\/framedPrint/);
      await page.getByRole('button', { name: 'edit placement' }).click();
      await expect(page).toHaveURL(/\/studio\/position\?draft=.*&variant=.*&return=%2Fcustomize%2FframedPrint/);
      await expect(page.getByRole('button', { name: /save & return/ })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /save & return/ }).click();
      await expect(page).toHaveURL(/\/customize\/framedPrint/);
      await expect(page.getByRole('button', { name: /add to basket/ })).toBeVisible();
    });

    test('a dark tee → "lift it off the paper in the studio" → done: where does it land?', async ({ page }) => {
      test.setTimeout(300_000);
      await uploadArt(page);
      await rangeReady(page);
      await page.goto('/customize/kidsTee');
      // a dark colour
      const dark = page.getByRole('button', { name: /^(black|navy|charcoal|dark grey)/i }).first();
      await dark.click();
      const lift = page.getByRole('button', { name: 'lift it off the paper in the studio' });
      await expect(lift).toBeVisible({ timeout: 30_000 });
      await lift.click();
      await studioReady(page);
      await nav(page).getByRole('button', { name: 'remove background', exact: true }).click();
      await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled({ timeout: 150_000 });
      await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
      await page.waitForURL((u) => !u.pathname.startsWith('/studio'), { timeout: 60_000 });
      test.info().annotations.push({ type: 'landed-on', description: new URL(page.url()).pathname });
      // RECORDED as 01-B3 in the report: it lands on the create page, not back on the tee
      await expect(page).toHaveURL(/\/start-creating/);
    });
  });
}

test.describe('signed in', () => {
  test.skip(!hasDb, 'needs the local test database');
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Signed in, a keepsake in the box, then "make this keepsake real" from a fresh create page. */
  async function pickKeepsakeOnCreatePage(page: Page, who: string) {
    await signInByEmailLink(page, testEmail(who), '/start-creating');
    await uploadArt(page);
    await rangeReady(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).click();
    await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
    const K = (await tabUpload(page))!.assetId!;
    // a fresh start (a new tab's worth: nothing in progress), then "make this keepsake real" from the box
    await page.evaluate(() => sessionStorage.removeItem('sd_upload'));
    await page.goto('/start-creating');
    await page.getByRole('button', { name: /^make .* real$/ }).first().click();
    await expect(page.getByRole('button', { name: /edit in studio/i }).first()).toBeVisible({ timeout: 30_000 });
    expect((await tabUpload(page))!.assetId).toBe(K);
    return K;
  }

  test('a keepsake picked on the create page: opening the Studio makes a copy; leaving without saving tidies it away', async ({ page }) => {
    test.setTimeout(360_000);
    const K = await pickKeepsakeOnCreatePage(page, 't1-fork');
    await page.getByRole('button', { name: /edit in studio/i }).first().click();
    await studioReady(page);
    const c1 = (await tabUpload(page))!;
    expect(c1.assetId).not.toBe(K);
    expect(c1.copyOf).toBe(K);
    await page.getByRole('button', { name: 'back to your collection' }).click();
    await expect(page).toHaveURL(/\/start-creating/);
    await expect.poll(async () => (await sql()`select count(*)::int as n from assets where id = ${c1.assetId!}`)[0]!.n, { message: 'the unsaved copy is tidied away' }).toBe(0);
    expect((await tabUpload(page))!.assetId, 'the keepsake is back as the drawing').toBe(K);
    expect((await assetRow(K))?.studio_doc).toBeNull();
  });

  // 01-B1 (P1): the Studio keeps the asset id it MOUNTED with (src/app/studio/page.tsx:113 useState(upload?.assetId))
  // — for a keepsake picked on the create page that is the KEEPSAKE; the copy is made after mount, so the
  // save (and the Studio's own remove background) land on the original keepsake, not the copy.
  test('01-B1: a Studio save of a keepsake picked on the create page lands on the COPY, never the keepsake', async ({ page }) => {
    test.setTimeout(360_000);
    const K = await pickKeepsakeOnCreatePage(page, 't1-fork-save');
    await page.getByRole('button', { name: /edit in studio/i }).first().click();
    await studioReady(page);
    const c2 = (await tabUpload(page))!;
    expect(c2.copyOf).toBe(K);
    await flipAndDone(page);
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 60_000 });
    const copyRow = await assetRow(c2.assetId!);
    expect(copyRow?.kept_in_home).toBe(true);
    expect(copyRow?.studio_doc, 'the copy carries the edit').toBeTruthy();
    expect((await assetRow(K))?.studio_doc, 'the keepsake itself is untouched').toBeNull();
    expect((await derivatives(K)).some((d) => d.key.endsWith('/design'))).toBe(false);
  });

  test('keepsake home → "place one on a product" opens the placement editor', async ({ page }) => {
    test.setTimeout(240_000);
    const email = testEmail('t1-home');
    await signInByEmailLink(page, email, '/start-creating');
    await uploadArt(page);
    await rangeReady(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).click();
    await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
    await page.goto('/home');
    await page.getByRole('link', { name: /place one on a product/ }).click();
    await expect(page).toHaveURL(/\/studio\/position/);
    await page.waitForLoadState('networkidle');
    test.info().annotations.push({ type: 'home-position', description: `${new URL(page.url()).pathname}${new URL(page.url()).search} — ${(await page.locator('main').innerText()).slice(0, 160).replace(/\s+/g, ' ')}` });
    await expect(page.getByRole('button', { name: /add to basket|keep it & check out/ })).toBeVisible({ timeout: 30_000 });
  });
});
