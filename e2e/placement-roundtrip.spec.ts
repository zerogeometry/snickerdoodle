import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, goClient, optionGroup, rangeReady, shopCatalogue, waitForAsset, type BasketLine } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): the PLACEMENT EDITOR for every product with one, and the placement
 * surviving the whole trip — editor → save & return → the customize preview recomposed WITH that
 * placement → add to basket (the line keeps the exact drawing, variant and placement) → reopen the
 * line from the basket → the editor opens on the very same placement.
 *
 * In the editor: keyboard zoom (+), nudge (arrows), rotate (R) and the honest DPI badge; a mouse
 * drag moves the drawing; a two-finger pinch zooms; F resets; undo steps back.
 */
const BUILDERS = new Set(['cardPack', 'calendar', 'christmasBundle']);
type Tf = { scale: number; offsetX: number; offsetY: number; rotationDeg: number };

const app = (page: Page) => page.locator('[role="application"]');
const zoom = (page: Page) => page.getByRole('slider', { name: 'Zoom', exact: true });
const lr = (page: Page) => page.getByRole('slider', { name: /^Left \/ right/ });
const ud = (page: Page) => page.getByRole('slider', { name: /^Up \/ down/ });
const rotateBtn = (page: Page) => page.getByRole('button', { name: /^rotate \(\d+°\)$/ });

async function editorState(page: Page) {
  return {
    zoom: Number(await zoom(page).inputValue()),
    x: Number(await lr(page).inputValue()),
    y: Number(await ud(page).inputValue()),
    rot: Number(/\((\d+)°\)/.exec(await rotateBtn(page).innerText())![1]),
  };
}

/** The LAST /api/mockup compose the page asked for (its transform) — what the preview shows. */
function lastCompose(page: Page) {
  const box: { tf: Tf | null; variantId: string | null } = { tf: null, variantId: null };
  page.on('request', (req) => {
    if (!req.url().endsWith('/api/mockup') || req.method() !== 'POST') return;
    const b = JSON.parse(req.postData() ?? '{}') as { transform: Tf; variantId: string; size: string };
    if (b.size === 'zoom' || b.size === 'card') {
      box.tf = b.transform;
      box.variantId = b.variantId;
    }
  });
  return box;
}

async function openEditor(page: Page) {
  await page.getByRole('button', { name: /^edit placement$/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  await expect(app(page)).toBeVisible({ timeout: 30_000 });
  await expect(rotateBtn(page)).toBeVisible();
  await page.waitForTimeout(600);
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

const report: Record<string, unknown> = {};

test.describe('placement round-trip, every product', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('editor → save & return → preview → basket → reopen keeps the exact placement', async ({ page }) => {
    test.setTimeout(30 * 60_000);
    mkdirSync('reports/test-sweep-2026-10-29/shots/02', { recursive: true });
    const shop = (await shopCatalogue()).filter((p) => !BUILDERS.has(p.key));
    const compose = lastCompose(page);
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await rangeReady(page);
    const assetId = await waitForAsset(page);

    for (const p of shop) {
      const notes: string[] = [];
      await goClient(page, `/customize/${p.key}`);
      await expect(page.getByRole('heading', { level: 1, name: p.label, exact: true })).toBeVisible({ timeout: 30_000 });
      // a NON-default variant where there is one: the last chip of the first option group
      for (const g of ['Size', 'Colour']) {
        const chips = optionGroup(page, g).getByRole('button');
        if ((await chips.count()) > 1) await chips.last().click();
      }
      await openEditor(page);
      const s0 = await editorState(page);
      const canvas = app(page);
      await canvas.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('+');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('r');
      const s1 = await editorState(page);
      expect(s1.zoom, `${p.key}: + zooms in`).toBeGreaterThan(s0.zoom);
      expect(s1.rot, `${p.key}: R rotates 90°`).toBe((s0.rot + 90) % 360);
      notes.push(`zoom ${s0.zoom}→${s1.zoom} x ${s0.x}→${s1.x} y ${s0.y}→${s1.y} rot ${s0.rot}→${s1.rot}`);
      // the DPI badge says something honest about this placement
      const dpi = page.getByText(/print-ready · \d+ dpi|we'll gently enhance it|a little soft up close|image quality too low|too small to print well/).first();
      await expect(dpi, `${p.key}: dpi badge`).toBeVisible();
      notes.push(`dpi: ${await dpi.innerText()}`);
      await page.screenshot({ path: `reports/test-sweep-2026-10-29/shots/02/placement-${p.key}.jpg`, type: 'jpeg', quality: 55 });

      const save = page.getByRole('button', { name: /save & return/ });
      if (await save.isDisabled()) {
        notes.push('save disabled (BLOCK) after zooming — zoom out to fix');
        await page.getByRole('button', { name: /zoom out to (fix|print-ready)/ }).click();
        await expect(save).toBeEnabled();
      }
      const s2 = await editorState(page);
      await save.click();
      await expect(page).toHaveURL(new RegExp(`/customize/${p.key}$`));
      // the big preview recomposes WITH the saved placement
      await expect.poll(() => compose.tf?.rotationDeg, { message: `${p.key}: preview recomposed with the rotation` }).toBe(s2.rot);
      const shown = compose.tf!;
      notes.push(`preview tf ${JSON.stringify(shown)}`);

      const before = await basketLines(page);
      await page.getByRole('button', { name: /^add to basket · / }).click();
      await expect(page).toHaveURL(/\/start-creating/);
      const after = await basketLines(page);
      const line = after.find((l) => !before.some((b) => b.id === l.id && b.qty === l.qty)) as BasketLine;
      expect(line, `${p.key}: a new basket line`).toBeTruthy();
      expect(line.product).toBe(p.key);
      expect(line.artwork?.assetId, `${p.key}: the exact drawing`).toBe(assetId);
      expect(line.variantId, `${p.key}: the variant the preview showed`).toBe(compose.variantId);
      const t = line.artwork!.transform;
      expect(near(t.scale, shown.scale) && near(t.offsetX, shown.offsetX) && near(t.offsetY, shown.offsetY) && t.rotationDeg === shown.rotationDeg, `${p.key}: basket transform ${JSON.stringify(t)} = preview ${JSON.stringify(shown)}`).toBe(true);
      expect(near(t.offsetX, s2.x, 0.026) && near(t.offsetY, s2.y, 0.026), `${p.key}: basket offsets match the editor sliders`).toBe(true);

      // reopen from the basket → "update basket", same variant, then the editor on the same placement
      await goClient(page, `/customize/${p.key}?edit=${encodeURIComponent(line.id)}`);
      await expect(page.getByRole('button', { name: /^update basket · / })).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => compose.variantId).toBe(line.variantId);
      await expect.poll(() => JSON.stringify(compose.tf)).toBe(JSON.stringify(t));
      await openEditor(page);
      const s3 = await editorState(page);
      expect(s3.rot, `${p.key}: reopened rotation`).toBe(t.rotationDeg);
      expect(near(s3.x, s2.x, 0.026) && near(s3.y, s2.y, 0.026) && near(s3.zoom, s2.zoom, 0.006), `${p.key}: reopened editor ${JSON.stringify(s3)} = saved ${JSON.stringify(s2)}`).toBe(true);
      notes.push(`reopened editor ${JSON.stringify(s3)}`);
      await page.goBack();
      report[p.key] = notes;
    }
    writeFileSync('reports/test-sweep-2026-10-29/shots/02/placement-roundtrip.json', JSON.stringify(report, null, 1));
  });
});

test('editor gestures: drag moves, pinch zooms, F resets, undo steps back (phone, touch)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);
  await goClient(page, '/customize/framedPrint');
  await openEditor(page);
  const s0 = await editorState(page);

  // pinch out (two touch pointers apart) → zooms in
  const pinch = (phase: 'down' | 'move' | 'up', spread: number) =>
    page.evaluate(({ phase, spread }) => {
      const el = document.querySelector('[role="application"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const type = phase === 'down' ? 'pointerdown' : phase === 'move' ? 'pointermove' : 'pointerup';
      for (const [id, sign] of [[21, -1], [22, 1]] as const) el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: cx + sign * spread, clientY: cy, bubbles: true, cancelable: true }));
    }, { phase, spread });
  await pinch('down', 40);
  await pinch('move', 80);
  await pinch('move', 120);
  await pinch('up', 120);
  await expect.poll(async () => (await editorState(page)).zoom, { message: 'pinch out zooms in' }).toBeGreaterThan(s0.zoom);
  const s1 = await editorState(page);

  // one-finger drag (mouse) moves the drawing
  const box = (await app(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => { const s = await editorState(page); return s.x !== s1.x || s.y !== s1.y; }, { message: 'drag moves it' }).toBe(true);

  // undo steps back one change
  await page.getByRole('button', { name: 'undo placement change' }).click();
  await expect.poll(async () => { const s = await editorState(page); return s.x === s1.x && s.y === s1.y; }, { message: 'undo restores the pre-drag position' }).toBe(true);

  // F resets to the product default
  await app(page).focus();
  await page.keyboard.press('f');
  await expect.poll(async () => editorState(page)).toEqual(s0);
});

test('double-tap toggles fit ↔ fill (a contained product); on a frame it snaps back to filled', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);
  const dbl = async () => {
    const b = (await app(page).boundingBox())!;
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  };
  // the sack (a tall print panel) contains (fit) a square drawing by default → double-tap fills → fits again
  await goClient(page, '/customize/sack');
  await openEditor(page);
  const fit = await editorState(page);
  await dbl();
  await expect.poll(async () => (await editorState(page)).zoom, { message: 'double-tap fills' }).not.toBe(fit.zoom);
  await dbl();
  await expect.poll(async () => (await editorState(page)).zoom, { message: 'double-tap fits again' }).toBe(fit.zoom);
  await page.goBack();
  // the frame: zoom in, double-tap → back to filled (its default)
  await goClient(page, '/customize/framedPrint');
  await openEditor(page);
  const filled = await editorState(page);
  await app(page).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('+');
  expect((await editorState(page)).zoom).toBeGreaterThan(filled.zoom);
  await dbl();
  await expect.poll(async () => (await editorState(page)).zoom).toBe(filled.zoom);
});
