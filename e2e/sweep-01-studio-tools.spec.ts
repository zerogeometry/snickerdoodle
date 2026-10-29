import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import {
  assetRow,
  derivatives,
  drag,
  isBlue,
  isPaper,
  isRed,

  objectBytes,
  openStudioFromCreate,
  pictureBox,
  regionColour,
  resetRateLimits,
  stageHash,
  tabUpload,
} from './sweep-01-helpers';

/**
 * Test sweep 29 Oct — tester 01: every Studio tool, one by one. Each one applies (the picture on the
 * stage changes), undo takes it back to exactly what was there, redo puts it back again; and a saved
 * design reaches the file products are printed from (the 'design' derivative), matching what the
 * Studio showed. The untouched original is never changed (its sha256 is checked before and after).
 */

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' }).or(page.getByRole('navigation', { name: 'studio tools' }));
const tool = (page: Page, label: string) => toolbar(page).getByRole('button', { name: label, exact: true });
/** A background colour swatch — in the desktop panel's group, or the phone tray's row. */
const bgSwatch = (page: Page, name: string) =>
  page.getByRole('group', { name: 'background colour' }).getByRole('button', { name, exact: true }).or(page.getByRole('button', { name: `background colour: ${name}`, exact: true }));
/** A fingerprint of just the picture's area on screen (no zoom buttons, no tool-name line). */
const picHash = async (page: Page, b: { x: number; y: number; side: number }) =>
  createHash('sha1').update(await page.screenshot({ clip: { x: b.x + 4, y: b.y + 4, width: b.side - 8, height: b.side - 8 } })).digest('hex');
const undoBtn = (page: Page) => page.getByRole('button', { name: 'undo' });
const redoBtn = (page: Page) => page.getByRole('button', { name: 'redo' });

/** Do an edit; check it changed the stage, that undo restores the exact picture and redo the edit.
 * `steps`: how many undo steps the edit is (typing words is its own step after adding the box). */
async function appliesAndUndoes(page: Page, what: string, edit: () => Promise<void>, steps = 1, opts: { looseRedo?: boolean; settle?: () => Promise<void> } = {}) {
  // settle: put down whatever layer is picked up (selection isn't an edit, so it isn't in the history)
  const hash = async () => {
    await opts.settle?.();
    await page.mouse.move(2, 2); // no hover marks in the fingerprints
    return stageHash(page);
  };
  const before = await hash();
  await edit();
  await expect.poll(hash, { message: `${what}: the picture changes` }).not.toBe(before);
  const after = await hash();
  for (let i = 0; i < steps; i++) await undoBtn(page).click();
  await expect.poll(hash, { message: `${what}: undo puts it back exactly` }).toBe(before);
  for (let i = 0; i < steps; i++) await redoBtn(page).click();
  // (redo brings back the edit; a layer just isn't picked up any more — its selection box may differ)
  if (opts.looseRedo) await expect.poll(hash, { message: `${what}: redo brings the edit back` }).not.toBe(before);
  else await expect.poll(hash, { message: `${what}: redo brings the edit back` }).toBe(after);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async () => resetRateLimits());

  test('image tools: flip, rotate, crop, remove colour, eraser, bring back, background, compare, start again', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openStudioFromCreate(page);
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeDisabled();
    const pristine = await stageHash(page);
    const pristinePic = await picHash(page, await pictureBox(page));

    // flip
    await tool(page, 'flip').click();
    await appliesAndUndoes(page, 'flip sideways', () => page.getByRole('button', { name: 'sideways' }).click());
    await undoBtn(page).click();
    await appliesAndUndoes(page, 'flip upside down', () => page.getByRole('button', { name: 'upside down' }).click());
    await undoBtn(page).click();
    await expect.poll(() => stageHash(page)).toBe(pristine);

    // rotate: ] nudges a degree, shift+] a tenth; the slider too
    await tool(page, 'rotate').click();
    await appliesAndUndoes(page, 'rotate by keys', async () => {
      for (let i = 0; i < 10; i++) await page.keyboard.press(']');
    });
    await undoBtn(page).click();
    await expect.poll(() => stageHash(page)).toBe(pristine);

    // crop: drag the top-left corner in
    await tool(page, 'crop').click();
    const pic = await pictureBox(page);
    await appliesAndUndoes(page, 'crop by corner', async () => {
      await page.mouse.move(pic.x + 2, pic.y + 2);
      await page.mouse.down();
      await page.mouse.move(pic.x + pic.side * 0.3, pic.y + pic.side * 0.3, { steps: 10 });
      await page.mouse.up();
    });
    await page.getByRole('button', { name: 'reset' }).click();
    await page.getByRole('button', { name: 'done cropping' }).click();
    // (reset is itself an undoable step)
    await expect(undoBtn(page)).toBeEnabled();

    // a clean slate for the transparency tools
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect.poll(() => stageHash(page)).toBe(pristine);

    // background needs something see-through first
    await expect(tool(page, 'background')).toHaveAttribute('aria-disabled', 'true');

    // remove colour: tap the cream paper — it goes everywhere
    await tool(page, 'remove colour').click();
    const pic2 = await pictureBox(page);
    await appliesAndUndoes(page, 'remove colour', () => page.mouse.click(pic2.x + pic2.side * 0.9, pic2.y + pic2.side * 0.08));
    await expect(tool(page, 'background')).not.toHaveAttribute('aria-disabled', 'true');

    // background colour fill
    await tool(page, 'background').click();
    await appliesAndUndoes(page, 'background colour', () =>
      bgSwatch(page, 'black').click(),
    );
    await undoBtn(page).click();

    // eraser: brush across the red square; bring back: brush it back
    await tool(page, 'eraser').click();
    await appliesAndUndoes(page, 'eraser', () => drag(page, [0.42, 0.3], [0.48, 0.32]));
    // (drag uses stage fractions; check it hit the picture by the stage change above)
    await tool(page, 'bring back').click();
    await appliesAndUndoes(page, 'bring back', async () => {
      const p = await pictureBox(page).catch(() => pic2);
      await page.mouse.move(p.x + p.side * 0.9, p.y + p.side * 0.08);
      await page.mouse.down();
      await page.mouse.move(p.x + p.side * 0.95, p.y + p.side * 0.12, { steps: 8 });
      await page.mouse.up();
    });

    const picStart = await pictureBox(page).catch(() => pic2);
    const editedPic = await picHash(page, picStart);
    // compare: hold space → the original shows; let go → back to the edit
    const edited = await stageHash(page);
    await page.mouse.move(2, 2);
    await page.keyboard.down(' ');
    await expect.poll(() => stageHash(page), { message: 'compare shows the original' }).not.toBe(edited);
    await page.keyboard.up(' ');
    await expect.poll(() => stageHash(page), { message: 'letting go of compare' }).toBe(edited);

    // start again: asks first, clears every edit, and is undoable
    await tool(page, 'start again').click();
    const dlg = page.getByRole('dialog', { name: /start again/i });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('your original upload is never changed');
    await dlg.getByRole('button', { name: 'yes, back to the original' }).click();
    await expect.poll(() => picHash(page, picStart), { message: 'start again = the untouched drawing' }).toBe(pristinePic);
    await undoBtn(page).click();
    await expect.poll(() => picHash(page, picStart)).toBe(editedPic);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('added things: words, a pen line, a shape — moved, duplicated, reordered, deleted by key; undo/redo throughout', async ({ page }) => {
    test.setTimeout(240_000);
    await openStudioFromCreate(page);
    const pic = await pictureBox(page);

    // words: tap → type → tap away
    await tool(page, 'add text').click();
    await appliesAndUndoes(page, 'add words', async () => {
      await page.mouse.click(pic.x + pic.side * 0.5, pic.y + pic.side * 0.45);
      await expect(page.getByLabel('your words', { exact: true })).toBeFocused();
      await page.keyboard.type('Ada, 5');
      await page.mouse.click(pic.x + pic.side * 0.95, pic.y + pic.side * 0.95);
    }, 2, { looseRedo: true });

    // pen line
    await tool(page, 'draw').click();
    await appliesAndUndoes(page, 'draw a line', async () => {
      await page.mouse.move(pic.x + pic.side * 0.2, pic.y + pic.side * 0.8);
      await page.mouse.down();
      await page.mouse.move(pic.x + pic.side * 0.6, pic.y + pic.side * 0.75, { steps: 15 });
      await page.mouse.up();
    });

    // a shape
    await tool(page, 'shapes').click();
    await appliesAndUndoes(page, 'add a heart', () => page.getByRole('button', { name: 'add a heart' }).first().click(), 1, { looseRedo: true });

    // layers: (adding a shape switches to layers) pick the heart up again (it was added in the middle of
    // the view) — duplicate, reorder, delete by key
    await expect(tool(page, 'layers')).toHaveAttribute('aria-pressed', 'true');
    const st = (await page.locator('canvas[aria-label^="your drawing"]').boundingBox())!;
    const pickHeart = () => page.mouse.click(st.x + st.width / 2, st.y + st.height / 2);
    // a tap on the empty stage beside the picture puts a layer down
    const putDown = { settle: () => page.mouse.click(st.x + 8, st.y + st.height - 8), looseRedo: false };
    // (desktop panel: "this layer" → duplicate · forward · back · delete; the phone tray says "send back")
    const layerBtn = (label: string) => page.getByRole('group', { name: 'this layer' }).getByRole('button', { name: label, exact: true });
    // back, twice: under the pen line, then under the words it overlaps
    await appliesAndUndoes(page, 'send back (twice)', async () => {
      await pickHeart();
      await layerBtn('back').click();
      await layerBtn('back').click();
    }, 2, putDown);
    await appliesAndUndoes(page, 'duplicate', async () => {
      await pickHeart();
      await layerBtn('duplicate').click();
    }, 1, putDown);
    await appliesAndUndoes(page, 'delete by key', async () => {
      await pickHeart();
      await page.keyboard.press('Delete');
    }, 1, putDown);

    // moving a layer by drag (the pen line, low on the left)
    await appliesAndUndoes(page, 'move the pen line', async () => {
      await page.mouse.move(pic.x + pic.side * 0.4, pic.y + pic.side * 0.775);
      await page.mouse.down();
      await page.mouse.move(pic.x + pic.side * 0.4, pic.y + pic.side * 0.6, { steps: 10 });
      await page.mouse.up();
    }, 1, putDown);
  });

  test('a saved design reaches the print file as the Studio showed it — and the original never changes', async ({ page }) => {
    test.setTimeout(300_000);
    await openStudioFromCreate(page);
    const u0 = await tabUpload(page);
    expect(u0?.assetId, 'the drawing is stored once the Studio opens').toBeTruthy();
    const assetId = u0!.assetId!;
    const original = (await derivatives(assetId)).find((d) => d.object_class === 'ORIGINAL')!;
    expect(original).toBeTruthy();

    // paper removed (tap the cream), filled black, then flipped sideways (the red square goes top-RIGHT)
    await tool(page, 'remove colour').click();
    const pic = await pictureBox(page);
    await page.mouse.click(pic.x + pic.side * 0.9, pic.y + pic.side * 0.08);
    await tool(page, 'background').click();
    await bgSwatch(page, 'black').click();
    await tool(page, 'flip').click();
    await page.getByRole('button', { name: 'sideways' }).click();
    await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 60_000 });

    const row = await assetRow(assetId);
    expect(row?.studio_doc, 'the recipe is saved').toBeTruthy();
    expect((row!.studio_doc as { flipH?: boolean }).flipH).toBe(true);
    const objs = await derivatives(assetId);
    const design = objs.find((d) => d.key.endsWith('/derivatives/design'));
    expect(design, 'a design derivative is stored').toBeTruthy();
    const png = await objectBytes(design!.key);
    // the print file: red top-right, blue bottom-left (mirrored), the paper replaced by the fill colour
    expect(isRed(await regionColour(png, { x: 0.72, y: 0.15, w: 0.1, h: 0.1 })), 'red square now top-right').toBe(true);
    expect(isRed(await regionColour(png, { x: 0.15, y: 0.15, w: 0.1, h: 0.1 })), 'nothing red top-left').toBe(false);
    expect(isBlue(await regionColour(png, { x: 0.22, y: 0.65, w: 0.1, h: 0.1 })), 'blue disc now bottom-left').toBe(true);
    const corner = await regionColour(png, { x: 0.45, y: 0.02, w: 0.1, h: 0.04 });
    expect(isPaper(corner), 'cream paper replaced by the fill').toBe(false);
    expect(corner.a > 200 && corner.r < 40 && corner.g < 40 && corner.b < 40, `the fill is black (${JSON.stringify(corner)})`).toBe(true);
    // the tab now renders products from that design
    const u1 = await tabUpload(page);
    expect(u1?.cutout?.sourceObjectId).toBe(design!.id);
    // the original is untouched
    const after = (await derivatives(assetId)).find((d) => d.object_class === 'ORIGINAL')!;
    expect(after.id).toBe(original.id);
    expect(after.sha256).toBe(original.sha256);
    const origBytes = await objectBytes(original.key);
    expect(isRed(await regionColour(origBytes, { x: 0.15, y: 0.15, w: 0.1, h: 0.1 })), 'the original still has red top-left').toBe(true);
  });
});

