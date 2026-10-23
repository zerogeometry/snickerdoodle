import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Zooming out a repeat (socks) with a PINCH re-draws the repeat as you go — more, smaller copies —
 * rather than shrinking a picture of it with empty edges; and what you see when you let go is
 * exactly what you saw mid-pinch.
 */
const pinch = (page: Page, phase: 'down' | 'move' | 'up', spread: number) =>
  page.evaluate(
    ({ phase, spread }) => {
      const el = document.querySelector('[role="application"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const type = phase === 'down' ? 'pointerdown' : phase === 'move' ? 'pointermove' : 'pointerup';
      for (const [id, sign] of [[11, -1], [12, 1]] as const) {
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: cx + sign * spread, clientY: cy, bubbles: true, cancelable: true }));
      }
    },
    { phase, spread },
  );
/** A screenshot of the drawn repeat: a fingerprint, and the share of it that is the drawing's ink. */
async function repeatPixels(page: Page) {
  const png = await page.locator('[role="application"] canvas').screenshot();
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0]!, data[1]!, data[2]!]; // the corner: the sock's base colour
  let ink = 0;
  for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i]! - bg[0]!) + Math.abs(data[i + 1]! - bg[1]!) + Math.abs(data[i + 2]! - bg[2]!) > 60) ink++;
  return { hash: createHash('sha1').update(data).digest('hex'), ink: ink / (info.width * info.height) };
}

test('pinching out a sock repeat re-draws it with more copies as you go', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push('/customize/socks'));
  await expect(page).toHaveURL(/\/customize\/socks/);
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  const canvas = page.locator('[role="application"] canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  const before = await repeatPixels(page);

  await pinch(page, 'down', 120);
  await pinch(page, 'move', 50); // fingers together → zoom out
  await page.waitForTimeout(300);
  const live = await repeatPixels(page);
  expect(live.hash, 'the repeat is re-drawn mid-pinch').not.toBe(before.hash);
  // re-drawn, not shrunk: the repeat element itself isn't CSS-scaled, and the drawing still covers
  // about as much of the sock (more, smaller copies) — a shrunk picture would leave empty edges
  const scaled = await page.evaluate(() => (document.querySelector('[role="application"] canvas')!.parentElement as HTMLElement).style.getPropertyValue('--gk'));
  expect(scaled).toBe('');
  expect(live.ink).toBeGreaterThan(before.ink * 0.6);

  await pinch(page, 'up', 50);
  await page.waitForTimeout(500);
  const after = await repeatPixels(page);
  expect(after.hash, 'what you let go of is what you saw').toBe(live.hash);
});
