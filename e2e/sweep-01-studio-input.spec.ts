import { test, expect, type Page } from './test';
import { expectAccessible } from './a11y';
import { STAGE, derivatives, openStudioFromCreate, resetRateLimits, stageHash } from './sweep-01-helpers';

/**
 * Test sweep 29 Oct — tester 01: the Studio by finger on a phone (taps, the options row, a two-finger
 * pinch that zooms without editing), by keyboard on a desktop (tool keys, undo/redo keys, zoom keys,
 * visible focus), reduced motion, an axe scan (01-B5), and the Studio's own "remove background"
 * (undo it, save → nothing see-through is left on the server).
 */

test.beforeEach(async () => resetRateLimits());
const nav = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' }).or(page.getByRole('navigation', { name: 'studio tools' }));
const tool = (page: Page, label: string) => nav(page).getByRole('button', { name: label, exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'undo' });

/** Two fingers on the stage, spreading apart (real touch input, via the DevTools protocol). */
async function pinchOut(page: Page) {
  const r = (await page.locator(STAGE).boundingBox())!;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - i * 8, y: cy, id: 1 }, { x: cx + 30 + i * 8, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('phone, by finger', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('taps: flip and a quarter turn from the options row; a pinch zooms and is not an edit; a pinch mid-line drops the line', async ({ page }) => {
    test.setTimeout(240_000);
    await openStudioFromCreate(page);
    await expect(undo(page)).toBeDisabled();

    await tool(page, 'flip').tap();
    await page.getByRole('button', { name: 'sideways' }).tap();
    await expect(undo(page)).toBeEnabled();
    await undo(page).tap();
    await expect(undo(page)).toBeDisabled();

    await tool(page, 'rotate').tap();
    const before = await stageHash(page);
    await page.getByRole('button', { name: 'turn the design a quarter turn clockwise' }).tap();
    await expect(undo(page)).toBeEnabled();
    await expect.poll(() => stageHash(page)).not.toBe(before);
    await undo(page).tap();
    await expect(undo(page)).toBeDisabled();
    await tool(page, 'rotate').tap(); // put the row away

    // pinch: the view zooms; nothing to undo
    const unzoomed = await stageHash(page);
    await pinchOut(page);
    await expect.poll(() => stageHash(page), { message: 'the pinch zoomed in' }).not.toBe(unzoomed);
    await expect(undo(page), 'a pinch is not an edit').toBeDisabled();
    await page.getByRole('button', { name: 'fit to screen' }).tap();

    // draw: a finger starts a line, a second finger lands → it's a pinch, the half line is dropped
    await tool(page, 'draw').tap();
    const r = (await page.locator(STAGE).boundingBox())!;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy, id: 1 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 40 + i * 6, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 10, y: cy, id: 1 }, { x: cx + 60, y: cy + 10, id: 2 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 10 - i * 6, y: cy, id: 1 }, { x: cx + 60 + i * 6, y: cy + 10, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
    await expect(undo(page), 'the half-drawn line went with the pinch').toBeDisabled();

    // a finger alone draws
    await page.getByRole('button', { name: 'fit to screen' }).tap();
    const cdp2 = await page.context().newCDPSession(page);
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 60, y: cy + 40, id: 1 }] });
    for (let i = 1; i <= 10; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 60 + i * 10, y: cy + 40, id: 1 }] });
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp2.detach();
    await expect(undo(page)).toBeEnabled();
  });

  test('phone: every studio control is at least 44px and the header never wraps', async ({ page }) => {
    test.setTimeout(180_000);
    await openStudioFromCreate(page);
    const header = page.getByRole('banner');
    const hb = (await header.boundingBox())!;
    expect(hb.height).toBeLessThan(90);
    for (const b of await nav(page).getByRole('button').all()) {
      const bb = await b.boundingBox();
      if (bb && bb.width > 0) expect(Math.min(bb.width, bb.height), `${await b.getAttribute('aria-label')} is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['undo', 'redo', 'zoom in', 'zoom out', 'fit to screen', 'back to your collection']) {
      const bb = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(Math.min(bb.width, bb.height), `${name} is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    // (axe: see test.fixme 01-B5 below — the editor has no <main> landmark / skip-link target)
  });
});

test.describe('desktop, by keyboard', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('tool keys, undo/redo keys, zoom keys; visible focus; reduced motion', async ({ page }) => {
    test.setTimeout(240_000);
    await openStudioFromCreate(page);
    await page.mouse.move(2, 2);

    // tool keys select their tool
    for (const [key, label] of [['f', 'flip'], ['x', 'crop'], ['r', 'rotate'], ['p', 'draw'], ['h', 'shapes'], ['l', 'layers'], ['e', 'eraser'], ['b', 'bring back'], ['c', 'remove colour']] as const) {
      await page.keyboard.press(key);
      await expect(tool(page, label), `${key} picks ${label}`).toHaveAttribute('aria-pressed', 'true');
    }
    // flip by keyboard only: f, then Tab to "sideways" and Enter
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'sideways' }).focus();
    await page.keyboard.press('Enter');
    await expect(undo(page)).toBeEnabled();
    await page.keyboard.press('Control+z');
    await expect(undo(page)).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(undo(page)).toBeEnabled();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    await expect(undo(page)).toBeEnabled();

    // zoom keys
    const fitted = await stageHash(page);
    await page.keyboard.press('+');
    await expect.poll(() => stageHash(page)).not.toBe(fitted);
    await page.keyboard.press('0');
    await expect.poll(() => stageHash(page)).toBe(fitted);

    // visible focus: Tab onto the toolbar's buttons shows a ring
    await page.getByRole('button', { name: 'back to your collection' }).focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { tag: 'body', ok: false };
        const s = getComputedStyle(el);
        const ok = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || /0px 0px 0px [2-9]/.test(s.boxShadow) || s.boxShadow.includes('rgb') && s.boxShadow !== 'none';
        return { tag: `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)}`, ok, outline: `${s.outlineStyle} ${s.outlineWidth}`, shadow: s.boxShadow };
      });
      expect(ring.ok, `focus is visible on ${JSON.stringify(ring)}`).toBe(true);
    }

    // reduced motion: nothing animates for longer than a blink
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.keyboard.press('t');
    const long = await page.evaluate(() =>
      document
        .getAnimations()
        .map((a) => ({ name: (a as CSSAnimation).animationName ?? a.constructor.name, d: Number(a.effect?.getComputedTiming().duration ?? 0) }))
        .filter((a) => a.d > 5),
    );
    expect(long, 'no animation runs under prefers-reduced-motion').toEqual([]);

  });

  test('the Studio’s own remove background: runs on picking the tool, undo takes it away, and saving then leaves nothing see-through', async ({ page }) => {
    test.setTimeout(300_000);
    await openStudioFromCreate(page);
    const assetId = (await page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_upload') ?? 'null')?.state?.upload?.assetId)) as string;
    await tool(page, 'remove background').click();
    await expect(page.getByText('background removed').locator('visible=true').first()).toBeVisible({ timeout: 150_000 });
    await expect(tool(page, 'background')).not.toHaveAttribute('aria-disabled', 'true');
    const cut = (await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/cutout'));
    test.info().annotations.push({ type: 'cutout-stored-before-save', description: cut ? 'yes — the lift is stored on the server as soon as it runs' : 'no' });
    await undo(page).click();
    await expect(tool(page, 'background')).toHaveAttribute('aria-disabled', 'true');
    // something else to save
    await tool(page, 'flip').click();
    await page.getByRole('button', { name: 'sideways' }).click();
    await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 60_000 });
    expect((await derivatives(assetId)).find((d) => d.key.endsWith('/derivatives/cutout')), 'the un-done lift is not left on the server').toBeUndefined();
  });
});

test.describe('bugs found in the sweep (fixed)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('01-B5: axe — the Studio editor is the <main> landmark, so the skip link has a target (region, skip-link)', async ({ page }) => {
    await openStudioFromCreate(page);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expectAccessible(page, '/studio (desktop)');
  });

  test('01-B5: axe at phone size too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudioFromCreate(page);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expectAccessible(page, '/studio (phone)');
  });

  test('01-B6: Space on a focused Studio button activates it (not "compare")', async ({ page }) => {
    await openStudioFromCreate(page);
    await tool(page, 'flip').focus();
    await page.keyboard.press(' ');
    await expect(tool(page, 'flip')).toHaveAttribute('aria-pressed', 'true');
  });

  test('01-B7: the K key does not open the background tool while it is disabled (nothing see-through yet)', async ({ page }) => {
    await openStudioFromCreate(page);
    await expect(tool(page, 'background')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('k');
    await expect(tool(page, 'background')).not.toHaveAttribute('aria-pressed', 'true');
    await expect(undo(page)).toBeDisabled();
  });

  test('01-B8 + 01-B9: the desktop tools are a toolbar (not navigation) and the layer buttons say "bring forward" / "send back"', async ({ page }) => {
    await openStudioFromCreate(page);
    await expect(page.getByRole('toolbar', { name: 'studio tools' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'studio tools' })).toHaveCount(0);
    await tool(page, 'shapes').click();
    await page.getByRole('button', { name: 'add a heart' }).first().click();
    const layer = page.getByRole('group', { name: 'this layer' });
    await expect(layer.getByRole('button', { name: 'bring forward', exact: true })).toBeVisible();
    await expect(layer.getByRole('button', { name: 'send back', exact: true })).toBeVisible();
    await expect(layer.getByRole('button', { name: /^(back|forward)$/ })).toHaveCount(0);
  });
});
