import { test, expect, type Page } from './test';
import { hasDb, signInByEmailLink, testEmail } from './harness';
import {
  assetRow,
  derivatives,
  isPaper,
  isRed,
  objectBytes,
  regionColour,
  resetRateLimits,
  studioReady,
  tabUpload,
  uploadArt,
} from './sweep-01-helpers';

/**
 * Test sweep 29 Oct — tester 01. The founder's bug, fixed today: "lift a drawing's background, put it
 * back, then edit in the Studio → the old cut-out came back". Checked from every place a background
 * can be lifted and put back (the create page's one-tap button, the bundle builder's picker), as a
 * guest and signed in. The tell-tale: when the Studio opens, NOTHING is see-through (its "background"
 * tool stays disabled until something is), and a saved design keeps the paper.
 *
 * Also: per-piece edits in the Christmas family bundle — editing one piece in the Studio must not change
 * the other pieces showing the same drawing.
 */

test.skip(!hasDb, 'needs the local test database');
test.beforeEach(async () => resetRateLimits());

const nav = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' }).or(page.getByRole('navigation', { name: 'studio tools' }));
const bgTool = (page: Page) => nav(page).getByRole('button', { name: 'background', exact: true });
const cutoutRow = async (assetId: string) => (await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/cutout'));
const designRow = async (assetId: string) => (await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/design'));

async function liftThenPutBackOnCreatePage(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: 'remove background', exact: true }).click();
  await expect(page.getByRole('button', { name: 'put the background back' })).toBeVisible({ timeout: 150_000 });
  const lifted = await tabUpload(page);
  expect(lifted?.cutout?.oneTap, 'the one-tap cut-out is in use').toBe(true);
  const assetId = lifted!.assetId!;
  expect(await cutoutRow(assetId), 'the cut-out is stored').toBeTruthy();
  await page.getByRole('button', { name: 'put the background back' }).click();
  await expect(page.getByRole('button', { name: 'remove background', exact: true })).toBeVisible();
  const back = await tabUpload(page);
  expect(back?.cutout && !back.cutout.trim ? back.cutout : null, 'no cut-out in use any more').toBeNull();
  return assetId;
}

/** In the Studio: nothing see-through (so no old cut-out came back). Flip it and save. */
async function studioShowsPaperThenFlipAndSave(page: Page) {
  await studioReady(page);
  await expect(bgTool(page), 'nothing is see-through: the background tool waits').toHaveAttribute('aria-disabled', 'true');
  await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await expect(bgTool(page)).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
}

async function designKeepsThePaper(assetId: string) {
  const design = await designRow(assetId);
  expect(design, 'the flip made a design').toBeTruthy();
  const png = await objectBytes(design!.key);
  expect(isPaper(await regionColour(png, { x: 0.45, y: 0.02, w: 0.1, h: 0.04 })), 'the paper is still there in the print file').toBe(true);
  expect(isRed(await regionColour(png, { x: 0.72, y: 0.15, w: 0.1, h: 0.1 })), 'and it is flipped').toBe(true);
  expect(await cutoutRow(assetId), 'no cut-out left behind on the server').toBeUndefined();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`create page, guest (${viewport.width}px): lift → put back → studio → the old cut-out never comes back`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    await uploadArt(page);
    const assetId = await liftThenPutBackOnCreatePage(page);
    // (observed: the one-tap put-back only stops USING the cut-out — the server copy stays until a save)
    test.info().annotations.push({ type: 'cutout-after-create-page-put-back', description: (await cutoutRow(assetId)) ? 'still stored' : 'deleted' });
    await page.getByRole('button', { name: /edit in studio/i }).first().click();
    await studioShowsPaperThenFlipAndSave(page);
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 60_000 });
    await designKeepsThePaper(assetId);
    // and the Studio, opened again, still shows the paper
    await page.getByRole('button', { name: /back to studio|edit in studio/i }).first().click();
    await studioReady(page);
    await expect(bgTool(page)).toHaveAttribute('aria-disabled', 'true');
  });
}

test('create page, signed in: lift → put back → keep → studio from the card-pack picker → no old cut-out', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const email = testEmail('t1-cutout');
  await signInByEmailLink(page, email, '/start-creating');
  await uploadArt(page);
  const assetId = await liftThenPutBackOnCreatePage(page);
  await page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  expect((await assetRow(assetId))?.kept_in_home).toBe(true);
  expect((await assetRow(assetId))?.studio_doc, 'never saved in the Studio').toBeNull();

  // the Studio straight from the create page
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await studioReady(page);
  await expect(bgTool(page)).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/start-creating/);

  // the card pack's picker: the keepsake's Studio edit is a COPY, and the copy carries no old cut-out
  await page.goto('/customize/cardPack');
  await page.getByRole('button', { name: /pick|choose|add a drawing|card 1/i }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  const item = sheet.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });
  await item.getByRole('button', { name: 'edit in studio' }).click();
  await studioReady(page);
  const copy = await tabUpload(page);
  expect(copy?.assetId, 'the Studio edits a copy').not.toBe(assetId);
  const detour = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_studio_detour') ?? 'null'));
  expect(detour?.copyOf, 'a copy of the keepsake, made for this trip').toBe(assetId);
  expect(detour?.returnTo).toBe('/customize/cardPack?resume=1');
  expect(await cutoutRow(copy!.assetId!), 'no cut-out rode into the copy').toBeUndefined();
  await expect(bgTool(page)).toHaveAttribute('aria-disabled', 'true');
  await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/customize\/cardPack/, { timeout: 60_000 });
  await designKeepsThePaper(copy!.assetId!);
  // the keepsake it came from is untouched
  expect((await assetRow(assetId))?.studio_doc).toBeNull();
  expect(await designRow(assetId)).toBeUndefined();
});

/** The bundle builder for the drawing in progress (client-side, from the range). */
async function openBundle(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: 'customize christmas family bundle', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/christmasBundle/);
  await expect(page.getByRole('heading', { name: 'christmas family bundle' })).toBeVisible();
}
const bundleDraft = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_bundle_draft_v2') ?? 'null')) as Promise<{
    placemat: { assetId: string; sourceObjectId?: string } | null;
    coaster: { assetId: string; sourceObjectId?: string } | null;
    ornaments: Array<{ assetId: string; sourceObjectId?: string } | null>;
  } | null>;
const thisDrawing = (page: Page) => page.getByRole('dialog').getByRole('listitem').filter({ has: page.getByRole('button', { name: 'this drawing' }) });

test('bundle picker, guest: lift → put it back → studio → no old cut-out (and the lifted copy is deleted)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadArt(page);
  await openBundle(page);
  await page.getByRole('button', { name: /pick a design for the placemats|edit the placemats’ design/ }).click();
  await thisDrawing(page).getByRole('button', { name: 'remove background' }).click();
  await expect(thisDrawing(page).getByRole('button', { name: 'put it back' })).toBeVisible({ timeout: 150_000 });
  const lifted = await tabUpload(page);
  const assetId = lifted!.assetId!;
  expect(await cutoutRow(assetId)).toBeTruthy();
  await thisDrawing(page).getByRole('button', { name: 'put it back' }).click();
  await expect(thisDrawing(page).getByRole('button', { name: 'remove background' })).toBeVisible();
  await expect.poll(() => cutoutRow(assetId), { message: 'the lifted copy is deleted on the server' }).toBeUndefined();
  await thisDrawing(page).getByRole('button', { name: 'edit in studio' }).click();
  await studioShowsPaperThenFlipAndSave(page);
  await expect(page).toHaveURL(/\/customize\/christmasBundle/, { timeout: 60_000 });
  await designKeepsThePaper(assetId);
});

test('bundle, signed in: a Studio edit of ONE ornament leaves the placemats (same drawing) alone', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInByEmailLink(page, testEmail('t1-bundle'), '/start-creating');
  await uploadArt(page);
  await openBundle(page);
  const start = await bundleDraft(page);
  const A = start?.placemat?.assetId ?? (await tabUpload(page))!.assetId!;

  await page.getByRole('button', { name: /ornament 1 wears the placemats’ design|edit ornament 1’s design/ }).click();
  await expect(page.getByRole('dialog', { name: /pick a drawing for ornament 1/ })).toBeVisible();
  await thisDrawing(page).getByRole('button', { name: 'edit in studio' }).click();
  await studioReady(page);
  const copy = (await tabUpload(page))!;
  expect(copy.assetId, 'signed in: the piece is edited as a copy').not.toBe(A);
  await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/customize\/christmasBundle/, { timeout: 60_000 });
  await expect(page.getByText('ornament 1 updated ✓')).toBeVisible({ timeout: 30_000 });

  const d = (await bundleDraft(page))!;
  expect(d.ornaments[0]?.assetId, 'ornament 1 holds the edited copy').toBe(copy.assetId);
  expect(d.placemat?.assetId, 'the placemats still hold the drawing itself').toBe(A);
  expect(d.placemat?.sourceObjectId ?? null, 'with no edit on it').toBeNull();
  expect((await assetRow(A))?.studio_doc, 'the drawing itself is untouched').toBeNull();
  expect((await assetRow(copy.assetId!))?.studio_doc).toBeTruthy();
  // ?resume=1 tidied away once used
  await expect(page).toHaveURL(/\/customize\/christmasBundle$/);
});

test('bundle, guest: a Studio edit of one ornament — what happens to the placemats', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await uploadArt(page);
  await openBundle(page);
  const A = (await tabUpload(page))!.assetId!;
  await page.getByRole('button', { name: /ornament 1 wears the placemats’ design|edit ornament 1’s design/ }).click();
  await thisDrawing(page).getByRole('button', { name: 'edit in studio' }).click();
  await studioReady(page);
  expect((await tabUpload(page))!.assetId, 'a guest edits the drawing itself (nothing can be kept)').toBe(A);
  await nav(page).getByRole('button', { name: 'flip', exact: true }).click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/customize\/christmasBundle/, { timeout: 60_000 });
  const d = (await bundleDraft(page))!;
  // RECORDED as 01-B2 in the report: a guest's edit lands on the drawing itself, so every piece wearing it changes
  test.info().annotations.push({ type: 'guest-bundle-draft', description: JSON.stringify(d) });
  const placematLook = d.placemat?.sourceObjectId ?? null;
  const design = await designRow(A);
  expect(design).toBeTruthy();
  expect(placematLook, 'guest: the placemats show the edited design too (edit in place)').toBe(design!.id);
});
