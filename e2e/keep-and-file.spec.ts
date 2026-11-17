import { test, expect, type Page } from './test';
import { artwork, quietCookies, uploadAndOpenRange } from './helpers';
import { hasDb, signInByEmailLink, sql, testEmail } from './harness';

/**
 * Snickerdoodle as a keepsake box (founder, 17 Nov 2026):
 *  - "keep" in the phone's tab bar: the phone's own picker (many at once) → one window to choose whose corner
 *    and who can see → kept, through the usual upload road;
 *  - "add keepsake" on the desktop keepsake page does the same;
 *  - the person button on a keepsake files it in a little one's corner (src/authz: only whoever added it);
 *  - the create page's little heart keeps the drawing on screen (the same keep + toast as "+ keepsake");
 *  - every page change opens at the top.
 */

const toast = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });

/** A signed-in parent with their own family (made on the first visit to /home) and little ones in it. */
async function parentWithLittleOnes(page: Page, names: string[]) {
  const email = testEmail('keep');
  await signInByEmailLink(page, email, '/home');
  await expect(page.getByText(/your family's private keepsake box/i)).toBeVisible();
  const [m] = await sql()`select m.account_id, m.family_id from memberships m join accounts a on a.id = m.account_id
    where a.email = ${email} and m.is_owner and m.status = 'ACTIVE'`;
  const kids: Record<string, string> = {};
  for (const n of names) {
    const [c] = await sql()`insert into children (family_id, first_name, controller_account_id) values (${m!.family_id}, ${n}, ${m!.account_id}) returning id`;
    kids[n] = c!.id as string;
  }
  return { email, accountId: m!.account_id as string, familyId: m!.family_id as string, kids };
}

const keptRows = (accountId: string) =>
  sql()`select id, visibility, child_subject_id, kept_in_home, controller_account_id, uploader_account_id from assets
    where uploader_account_id = ${accountId} order by created_at`;

test.describe('keepsake box', () => {
  test.skip(!hasDb, 'needs the local database');

  test('phone: the keep tab fits, opens the picker for many, files them and keeps them private', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 360, height: 780 });
    await quietCookies(page);
    const me = await parentWithLittleOnes(page, ['Sonny', 'Mabel']);
    await page.goto('/home');

    // five tabs — home · keep · create · family · orders — each a thumb-sized target, no sideways scroll at 360px
    const bar = page.getByRole('navigation', { name: 'Primary' });
    await expect(bar.getByRole('link')).toHaveText(['Home', 'Create', 'Family', 'Orders']);
    const keep = page.getByTestId('keep-tab');
    await expect(keep).toHaveText('Keep');
    const order = await bar.locator('a, button').evaluateAll((els) => els.map((e) => e.textContent?.trim()));
    expect(order).toEqual(['Home', 'Keep', 'Create', 'Family', 'Orders']); // drawn lowercase
    for (const box of await bar.locator('a, button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(page.getByTestId('add-keepsake')).toBeHidden(); // phones use the tab; the big button is desktop's

    // one tap: the phone's own picker, many at once
    const art = await artwork();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), keep.click()]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: art },
      { name: 'two.png', mimeType: 'image/png', buffer: art },
    ]);
    const sheet = page.getByRole('dialog', { name: 'add to your keepsake box' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('2 pictures')).toBeVisible();
    await expect(sheet.getByRole('img', { name: /picture \d/ })).toHaveCount(2);
    // who can see starts at family (never wider); the little ones are there to file under
    await expect(page.getByTestId('keep-visibility')).toHaveValue('FAMILY');
    await expect(page.getByTestId('keep-child').locator('option')).toHaveText(['not yet filed', "Mabel's corner", "Sonny's corner"]);
    await page.getByTestId('keep-child').selectOption({ label: "Sonny's corner" });
    await page.getByTestId('keep-visibility').selectOption('ONLY_ME');
    await page.getByTestId('keep-confirm').click();
    await expect(toast(page, '2 kept in your keepsake box ♥')).toBeVisible({ timeout: 90_000 });
    await expect(sheet).toHaveCount(0);

    // both kept, private, in Sonny's corner — through the usual pipeline (kept, controlled by the parent)
    const rows = await keptRows(me.accountId);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ visibility: 'ONLY_ME', child_subject_id: me.kids.Sonny, kept_in_home: true, controller_account_id: me.accountId });
    }
    await expect(page.getByText("Sonny's corner")).toBeVisible();

    // every page change opens at the top: from the bottom of home, the family tab lands at the top
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await bar.getByRole('link', { name: 'Family' }).click();
    await expect(page).toHaveURL(/\/family$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('desktop: "add keepsake" keeps a picture; the person button files it, and takes it out again', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await quietCookies(page);
    const me = await parentWithLittleOnes(page, ['Ada', 'Ben']);
    await page.goto('/home');
    await expect(page.getByTestId('keep-tab')).toBeHidden(); // the tab bar is the phone's

    const add = page.getByTestId('add-keepsake');
    await expect(add).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.click()]);
    await chooser.setFiles({ name: 'one.png', mimeType: 'image/png', buffer: await artwork() });
    await expect(page.getByRole('dialog', { name: 'add to your keepsake box' }).getByText('1 picture')).toBeVisible();
    await page.getByTestId('keep-confirm').click();
    await expect(toast(page, 'kept in your keepsake box ♥')).toBeVisible({ timeout: 90_000 });
    const [kept] = await keptRows(me.accountId);
    expect(kept).toMatchObject({ visibility: 'FAMILY', child_subject_id: null, kept_in_home: true });

    // the person button: "whose corner?" lists only the little ones it may go to
    await page.getByTestId('file-keepsake').first().click();
    const sheet = page.getByRole('dialog', { name: 'whose corner?' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('radio')).toHaveCount(3); // Ada, Ben, not yet filed
    await sheet.getByText('Ada’s corner').click();
    await page.getByTestId('file-save').click();
    await expect(toast(page, 'filed in Ada’s corner ♥')).toBeVisible();
    await expect(page.getByText("Ada's corner")).toBeVisible();
    expect((await keptRows(me.accountId))[0]).toMatchObject({ child_subject_id: me.kids.Ada, controller_account_id: me.accountId });

    // …and back out to "not yet filed"
    await page.getByTestId('file-keepsake').first().click();
    await expect(sheet.getByText('here now')).toBeVisible();
    await sheet.getByText('not yet filed').click();
    await page.getByTestId('file-save').click();
    await expect(toast(page, 'moved to “not yet filed”')).toBeVisible();
    expect((await keptRows(me.accountId))[0]!.child_subject_id).toBeNull();
  });

  test('phone: the create page’s little heart keeps the drawing — the same keep and toast as "+ keepsake"', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await quietCookies(page);
    const me = await parentWithLittleOnes(page, []);
    await uploadAndOpenRange(page);
    const heart = page.getByTestId('quick-keep');
    const change = page.getByRole('button', { name: 'change image' });
    // on the same line, the heart to the left, a square
    const [h, c] = [(await heart.boundingBox())!, (await change.boundingBox())!];
    expect(Math.abs(h.y - c.y)).toBeLessThan(2);
    expect(h.x + h.width).toBeLessThanOrEqual(c.x);
    expect(Math.abs(h.width - h.height)).toBeLessThan(2);
    await heart.click();
    await expect(toast(page, 'kept in your keepsake box ♥')).toBeVisible({ timeout: 90_000 });
    await expect(heart).toHaveAttribute('aria-label', 'kept in your keepsake box');
    await expect(page.getByRole('button', { name: /kept ♥/ })).toBeAttached(); // "+ keepsake" agrees
    const rows = await keptRows(me.accountId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kept_in_home: true, visibility: 'FAMILY' });
  });
});

test('phone: "create another" from the bottom of the range opens the upload page at the top', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  const another = page.getByRole('button', { name: 'create another' });
  await another.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await another.click();
  await expect(page.getByRole('heading', { name: /upload your little one/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('phone: from the catalogue page, the back link opens the create page at the top', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await page.goto('/catalogue');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await page.getByRole('link', { name: /back to your drawing/i }).click();
  await expect(page).toHaveURL(/\/start-creating$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
