import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * On a phone the range is ONE column: each tile has the product name and the price on their own
 * lines, and "+ customize" on one line. Wider screens keep the 2-up grid.
 */
for (const vp of [{ w: 360, h: 780 }, { w: 390, h: 844 }]) {
  test(`range is one column on a phone (${vp.w}px)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });

    const buttons = page.getByRole('button', { name: '+ customize' });
    expect(await buttons.count()).toBeGreaterThan(1);
    const boxes = await buttons.evaluateAll((els) => els.map((e) => ({ x: Math.round(e.getBoundingClientRect().left / 20), h: (e as HTMLElement).offsetHeight, lines: Math.round(e.scrollHeight / parseFloat(getComputedStyle(e).lineHeight || '16')) })));
    expect(new Set(boxes.map((b) => b.x)).size, 'all tiles in one column').toBe(1);
    for (const b of boxes) expect(b.h, '+ customize on one line').toBeLessThan(56);

    // the name and the price: separate lines
    const tile = page.getByRole('button', { name: 'customize socks', exact: true }).first().locator('xpath=ancestor::div[contains(@class,"polaroid")][1]');
    const name = tile.getByText('socks', { exact: true });
    const price = tile.getByText(/^from £/);
    const [nb, pb] = [await name.boundingBox(), await price.boundingBox()];
    expect(pb!.y + pb!.height / 2, 'price on the line below the name').toBeGreaterThan(nb!.y + nb!.height * 0.9);
  });
}

test('wider screens keep the 2-up range', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // measure the settled layout, not tiles mid pop-in (the animation moves them; it was flaky)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  const xs = await page.getByRole('button', { name: '+ customize' }).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
  // columns = groups of left edges more than 60px apart (the tiles' little tilts move each edge by a
  // few px, so rounding to a grid could split one column in two)
  const sorted = [...xs].sort((a, b) => a - b);
  const columns = sorted.filter((x, i) => i === 0 || x - sorted[i - 1]! > 60).length;
  expect(columns).toBe(2);
});
