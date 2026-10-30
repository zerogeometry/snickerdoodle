import { test, expect, type Page } from './test';
import { createHash } from 'node:crypto';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The Studio by finger AND by stylus (CLAUDE.md e2e list), on a phone: with the draw tool a finger
 * draws, and so does a pen (pointerType 'pen', with pressure). With "stylus only" on — for a child's
 * hand resting on the tablet — a finger no longer draws (it moves the picture), and the pen still does.
 */
async function openStudio(page: Page) {
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas[aria-label^="your drawing"]') as HTMLCanvasElement | null;
    return !!c && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(500);
}

/** A line across the middle of the picture, drawn with REAL input (Chrome DevTools Protocol): a pen
 * (pointerType 'pen', pressure rising along the line) or a finger (a touch). Synthetic DOM events
 * won't do — the Studio captures the pointer, which only works for a pointer the browser knows. */
async function stroke(page: Page, pointerType: 'pen' | 'touch', dy = 0) {
  const r = (await page.locator('canvas[aria-label^="your drawing"]').boundingBox())!;
  const y = r.y + r.height / 2 + dy;
  const xs = Array.from({ length: 13 }, (_, i) => r.x + r.width * (0.3 + i * 0.03));
  const cdp = await page.context().newCDPSession(page);
  if (pointerType === 'pen') {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: xs[0]!, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.4 });
    for (const [i, x] of xs.slice(1).entries()) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.4 + i * 0.04 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xs.at(-1)!, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  } else {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xs[0]!, y }] });
    for (const x of xs.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await cdp.detach();
}

/** A fingerprint of the picture as drawn. */
const picture = async (page: Page) =>
  createHash('sha1')
    .update(await page.locator('canvas[aria-label^="your drawing"]').screenshot())
    .digest('hex');

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('studio: a finger draws, a stylus draws; "stylus only" leaves fingers to move the picture', async ({ page }) => {
    test.setTimeout(180_000);
    await openStudio(page);
    const undo = page.getByRole('button', { name: 'undo' });
    await expect(undo).toBeDisabled();
    await page.getByRole('toolbar', { name: 'studio tools' }).getByRole('button', { name: 'draw' }).click();
    // what the browser actually reports to the Studio (so this can't pass on mouse events)
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { __pointers: string[] }).__pointers = []);
      document.querySelector('canvas[aria-label^="your drawing"]')!.addEventListener('pointerdown', (e) => seen.push((e as PointerEvent).pointerType));
    });

    // a finger draws
    const before = await picture(page);
    await stroke(page, 'touch', -40);
    await expect(undo).toBeEnabled();
    await expect.poll(() => picture(page)).not.toBe(before);

    // a stylus draws too
    const afterFinger = await picture(page);
    await stroke(page, 'pen', 40);
    await expect.poll(() => picture(page)).not.toBe(afterFinger);

    // back to a clean picture, then "stylus only"
    await undo.click();
    await undo.click();
    await expect(undo).toBeDisabled();
    await page.getByRole('button', { name: /^stylus only/ }).click();
    await expect(page.getByRole('button', { name: /^stylus only/ })).toHaveAttribute('aria-pressed', 'true');

    await stroke(page, 'touch', -40); // a resting hand / finger: no line
    await page.waitForTimeout(300);
    await expect(undo).toBeDisabled();

    await stroke(page, 'pen', 40); // the pen still draws
    await expect(undo).toBeEnabled();
    expect(await page.evaluate(() => (window as unknown as { __pointers: string[] }).__pointers)).toEqual(['touch', 'pen', 'touch', 'pen']);
  });
});
