import { test, expect, type Page } from './test';
import { hasDb, signInByEmailLink, testEmail } from './harness';
import { assetRow, derivatives, objectBytes, resetRateLimits, studioReady, tabUpload, uploadArt } from './sweep-01-helpers';
import { allStudioTools } from './helpers';
import sharp from 'sharp';

/**
 * Founder, 25 Nov: "in the Studio — at least when making a card pack — if you remove a picture's
 * background, the Studio doesn't remember it. It still treats the picture as not cut out, even after
 * the design is saved as a new keepsake and reopened." The card pack's picker → edit in studio →
 * remove background → done (a NEW keepsake) → edit that one in the Studio again: it opens cut out
 * ("background removed", the fill tool ready), and saving it again keeps the cut-out.
 */

test.skip(!hasDb, 'needs the local test database');
test.beforeEach(async () => resetRateLimits());
test.beforeEach(async ({ page }) => allStudioTools(page));

const nav = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' }).or(page.getByRole('navigation', { name: 'studio tools' }));
const tool = (page: Page, name: string) => nav(page).getByRole('button', { name, exact: true });
const cutoutRow = async (assetId: string) => (await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/cutout'));
const designRow = async (assetId: string) => (await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/design'));
// the Studio says so where its tool options show (a phone's tray or a computer's side panel; its tip may say it too)
const removed = (page: Page) => page.getByText('background removed', { exact: true }).filter({ visible: true }).first();
const done = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'done' }).click();
const sheet = (page: Page) => page.getByRole('dialog');
const chosenItem = (page: Page) => sheet(page).getByRole('listitem').filter({ has: page.getByRole('button', { pressed: true }) });

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`card pack (${viewport.width}px): a background removed in the Studio is still removed when the new keepsake is reopened`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    await signInByEmailLink(page, testEmail(`cutout-reopen-${viewport.width}`), '/start-creating');
    await uploadArt(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).click();
    await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
    const keepsake = (await tabUpload(page))!.assetId!;

    // the card pack's picker: edit the keepsake in the Studio (a copy) and remove its background
    await page.goto('/customize/cardPack');
    await page.getByRole('button', { name: /pick|choose|add a drawing|card 1/i }).first().click();
    await expect(sheet(page)).toBeVisible();
    const item = sheet(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
    await item.getByRole('button', { name: 'edit in studio' }).click();
    await studioReady(page);
    const first = (await tabUpload(page))!.assetId!;
    expect(first, 'the Studio edits a copy').not.toBe(keepsake);
    await expect(tool(page, 'background'), 'nothing cut out yet').toHaveAttribute('aria-disabled', 'true');
    await tool(page, 'remove background').click();
    await expect(removed(page)).toBeVisible({ timeout: 150_000 });
    await done(page);
    await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
    expect(await cutoutRow(first), 'the cut-out is saved with the new keepsake').toBeTruthy();
    expect((await assetRow(first))?.kept_in_home, 'saved as a new keepsake').toBe(true);

    // back in the picker, the new keepsake chosen: open it in the Studio again
    await expect(sheet(page)).toBeVisible({ timeout: 30_000 });
    await chosenItem(page).getByRole('button', { name: 'edit in studio' }).click();
    await studioReady(page);
    const second = (await tabUpload(page))!;
    expect(second.assetId, 'again a copy — the saved keepsake is never edited in place').not.toBe(first);
    expect(second.cutout?.trim, 'the drawing in progress is USING its cut-out').toBeFalsy();
    // the bug: it opened as if never cut out
    await expect(tool(page, 'background'), 'something is see-through: the fill tool is ready').not.toHaveAttribute('aria-disabled', 'true');
    await tool(page, 'remove background').click();
    await expect(removed(page), 'the Studio remembers the cut-out').toBeVisible();

    // and saving it again (a flip) keeps the cut-out — the print file is see-through where the paper was
    await tool(page, 'flip').click();
    await page.getByRole('button', { name: 'sideways' }).click();
    await done(page);
    await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
    expect(await cutoutRow(second.assetId!), 'the cut-out survived the second save').toBeTruthy();
    const design = await designRow(second.assetId!);
    expect(design, 'the flip made a design').toBeTruthy();
    const { data, info } = await sharp(await objectBytes(design!.key)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3], 'a corner (paper) is see-through in the print file').toBeLessThan(40);
    expect(info.channels).toBe(4);

    // originals are sacred: the first keepsake, and the one it came from, are as they were
    expect(await cutoutRow(first)).toBeTruthy();
    expect(await designRow(first), 'the first copy was never re-saved').toBeUndefined();
    expect((await assetRow(keepsake))?.studio_doc, 'the keepsake it all came from is untouched').toBeNull();
  });
}

test('card pack: a cut-out keepsake opened in the Studio and left WITHOUT saving is tidied away', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInByEmailLink(page, testEmail('cutout-reopen-unsaved'), '/start-creating');
  await uploadArt(page);
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  await page.goto('/customize/cardPack');
  await page.getByRole('button', { name: /pick|choose|add a drawing|card 1/i }).first().click();
  const item = sheet(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
  await item.getByRole('button', { name: 'remove background' }).click(); // the picker's own: a new keepsake, cut out
  await expect(page.getByText(/saved as a new keepsake/)).toBeVisible({ timeout: 150_000 });
  await expect(chosenItem(page)).toBeVisible();
  const before = await chosenItem(page).getByRole('button', { pressed: true }).getAttribute('aria-label');

  await chosenItem(page).getByRole('button', { name: 'edit in studio' }).click();
  await studioReady(page);
  const copy = (await tabUpload(page))!.assetId!;
  await expect(tool(page, 'background'), 'it opens cut out').not.toHaveAttribute('aria-disabled', 'true');
  await done(page); // nothing changed
  await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
  await expect.poll(async () => (await assetRow(copy)) ?? null, { message: 'the unsaved copy is tidied away', timeout: 30_000 }).toBeNull();
  await expect(chosenItem(page).getByRole('button', { pressed: true })).toHaveAttribute('aria-label', before!);
});
