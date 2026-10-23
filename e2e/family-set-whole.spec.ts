import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The family set tile appears as ONE piece (founder, 23 Oct): never a tee at a time. Whenever its
 * picture is showing, all four tees are fully loaded; before that, one calm placeholder. The
 * previews are slowed so the in-between moment is really there to catch.
 */
for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test(`the family set tile appears whole (${vp.w}px)`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await quietCookies(page);
    let batch = 0;
    await page.route('**/api/mockup/batch', async (r) => {
      await new Promise((ok) => setTimeout(ok, 800 + batch++ * 600));
      await r.continue();
    });
    await uploadAndOpenRange(page);

    const tile = page.getByRole('img', { name: /two grown-up tees and two kids tees/ });
    await tile.scrollIntoViewIfNeeded({ timeout: 90_000 });

    // sample it every 100 ms until it has appeared: never a partial picture
    let appeared = false;
    for (let i = 0; i < 400 && !appeared; i++) {
      const s = await tile.evaluate((el) => {
        const layer = el.querySelector<HTMLElement>('.transition-opacity')!;
        const imgs = [...layer.querySelectorAll<HTMLImageElement>('img')];
        return {
          visible: getComputedStyle(layer).opacity !== '0',
          whole: imgs.length === 4 && imgs.every((i) => i.complete && i.naturalWidth > 0),
        };
      });
      if (s.visible) {
        expect(s.whole, 'the family set showed before all four tees were ready').toBe(true);
        appeared = true;
      } else await page.waitForTimeout(100);
    }
    expect(appeared).toBe(true);
  });
}
