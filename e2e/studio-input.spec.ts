import { test, expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The Studio by FINGER and by STYLUS (docs/03 + Studio spec): drawing works with either, and
 * "stylus only" is palm rejection — a resting hand (touch) never leaves a mark, only the pen
 * draws, while fingers still move the picture.
 *
 * Real input, not synthetic DOM events: Chromium's DevTools protocol dispatches genuine touch
 * points (pointerType "touch") and pen input (pointerType "pen", with pressure), so pointer
 * capture, coalescing and the browser's own touch handling all run as they do on a device.
 * Both projects run it; the desktop one gets a touchscreen like a touch laptop / tablet.
 */
test.use({ hasTouch: true });

async function openStudio(page: Page) {
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: 'edit in studio' }).click();
  await expect(page).toHaveURL(/\/studio/);
  const canvas = page.getByRole('img', { name: /your drawing — use the tools to edit it/i }).or(page.locator('canvas[aria-label^="your drawing"]')).first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

async function chooseDraw(page: Page) {
  const draw = page.getByRole('button', { name: /^draw$/i }).filter({ visible: true }).first();
  await draw.click();
}

/** A short wavy stroke across the middle of the canvas, as CSS-pixel points in the viewport. */
async function strokePath(canvas: Locator, dy = 0): Promise<[number, number][]> {
  const b = (await canvas.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2 + dy;
  const span = Math.min(b.width, b.height) * 0.3;
  return Array.from({ length: 12 }, (_, i) => [cx - span / 2 + (span * i) / 11, cy + Math.sin(i / 2) * 12] as [number, number]);
}

async function penStroke(cdp: CDPSession, pts: [number, number][]) {
  const [x0, y0] = pts[0]!;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.7 });
  for (const [x, y] of pts.slice(1)) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.7 });
  }
  const [x1, y1] = pts[pts.length - 1]!;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
}

async function fingerStroke(cdp: CDPSession, pts: [number, number][]) {
  const [x0, y0] = pts[0]!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  for (const [x, y] of pts.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const pixels = (canvas: Locator) => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());

/** Every pointer event the canvas actually received, by type — proof the input was real. */
async function recordPointerTypes(canvas: Locator) {
  await canvas.evaluate((c: HTMLCanvasElement) => {
    const w = window as unknown as { __pointerTypes: string[] };
    w.__pointerTypes = [];
    c.addEventListener('pointerdown', (e) => w.__pointerTypes.push(e.pointerType), { capture: true });
  });
}
const pointerTypesSeen = (page: Page) => page.evaluate(() => (window as unknown as { __pointerTypes: string[] }).__pointerTypes);

test('studio: a stylus draws, a finger draws — and with "stylus only" a resting hand leaves no mark', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'real pen + touch input needs Chromium’s DevTools protocol');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const canvas = await openStudio(page);
  const cdp = await page.context().newCDPSession(page);
  const undo = page.getByRole('button', { name: 'undo' });
  await expect(undo).toBeDisabled();
  await chooseDraw(page);
  await recordPointerTypes(canvas);

  // ── stylus draws (pressure-aware) ─────────────────────────────────────────────────────
  let before = await pixels(canvas);
  await penStroke(cdp, await strokePath(canvas, -40));
  await expect(undo, 'a pen line is an undoable stroke').toBeEnabled();
  await expect.poll(() => pixels(canvas), { message: 'the pen line is on the canvas' }).not.toBe(before);

  // ── finger draws too (stylus-only is off by default) ─────────────────────────────────
  before = await pixels(canvas);
  await fingerStroke(cdp, await strokePath(canvas, 40));
  await expect.poll(() => pixels(canvas), { message: 'the finger line is on the canvas' }).not.toBe(before);
  expect(await pointerTypesSeen(page)).toEqual(['pen', 'touch']);

  // clear both strokes so the undo stack tells us exactly what the next input did
  await undo.click();
  await undo.click();
  await expect(undo).toBeDisabled();

  // ── stylus only: palm rejection ──────────────────────────────────────────────────────
  const stylusOnly = page.getByRole('switch', { name: /stylus only/i }).filter({ visible: true }).first();
  if (!(await stylusOnly.isVisible())) {
    // phones keep tool options in a sheet — open it from the active tool
    await chooseDraw(page);
  }
  await stylusOnly.click();
  await expect(stylusOnly).toHaveAttribute('aria-checked', 'true');
  // the options sheet (phones) may cover the canvas — put it away the way a person would
  await page.keyboard.press('Escape').catch(() => {});

  await fingerStroke(cdp, await strokePath(canvas, 20)); // a resting palm / finger drag
  await expect(undo, 'touch leaves no stroke with stylus only on').toBeDisabled();

  await page.getByRole('button', { name: 'fit to screen' }).click(); // fingers moved the picture; put it back
  before = await pixels(canvas);
  await penStroke(cdp, await strokePath(canvas, -20));
  await expect(undo, 'the pen still draws with stylus only on').toBeEnabled();
  await expect.poll(() => pixels(canvas)).not.toBe(before);
  // …and the palm really did land on the canvas (not on a sheet covering it)
  expect(await pointerTypesSeen(page)).toEqual(['pen', 'touch', 'touch', 'pen']);

  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
