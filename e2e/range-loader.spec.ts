import { test, expect } from '@playwright/test';
import { artwork, quietCookies } from './helpers';

/**
 * The "making your range" loader stays until EVERY tile's photo is ready, so the range is revealed
 * whole: at the reveal no tile on screen is still loading (pulsing block or sketch preview) and every
 * photo shown has fully loaded. The previews are slowed to behave like the deployed site.
 */
for (const vp of [
  { w: 390, h: 844 },
  { w: 1280, h: 900 },
])
  test(`the range loader stays until every tile has its photo (${vp.w}px)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await quietCookies(page);
    // photos arrive in waves, like the deployed site (later batches take longer)
    let batch = 0;
    await page.route('**/api/mockup/batch', async (r) => {
      const wait = 1500 + batch++ * 1500;
      await new Promise((ok) => setTimeout(ok, wait));
      await r.continue();
    });
    await page.goto('/start-creating');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload a drawing/i }).click(),
    ]);
    await chooser.setFiles({
      name: 'drawing.png',
      mimeType: 'image/png',
      buffer: await artwork(),
    });

    const loader = page
      .getByRole('status')
      .filter({ hasText: 'making your range' });
    await expect(loader).toBeVisible({ timeout: 30_000 });
    await expect(loader).toHaveCount(0, { timeout: 90_000 });

    // Walk the whole range: every tile, as it comes into view, already has its photo — nothing is
    // still loading. (Its picture was fetched before the reveal, so it paints straight from cache.)
    let photos = 0;
    for (let step = 0; step < 40; step++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const scroller = [
          ...document.querySelectorAll<HTMLElement>('.brand-scroll'),
        ].sort(
          (a, b) =>
            b.querySelectorAll('img').length - a.querySelectorAll('img').length,
        )[0]!;
        const box = scroller.getBoundingClientRect();
        const onScreen = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.bottom > box.top && r.top < box.bottom && r.width > 0;
        };
        const shown = [
          ...scroller.querySelectorAll<HTMLImageElement>(
            'img[alt^="your drawing on"]',
          ),
        ].filter(onScreen);
        const out = {
          photos: shown
            .filter((i) => i.complete && i.naturalWidth > 0)
            .map((i) => i.alt),
          unloaded: shown.filter((i) => !i.complete || i.naturalWidth === 0)
            .length,
          // a pulsing block, or a sketch preview with no photo over it yet
          stillLoading:
            [...scroller.querySelectorAll('.animate-pulse')].filter(onScreen)
              .length +
            [...scroller.querySelectorAll('[data-instant]')].filter(
              (el) =>
                onScreen(el) &&
                !el.parentElement?.querySelector('img[alt^="your drawing on"]'),
            ).length,
          atEnd:
            scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 2,
        };
        scroller.scrollBy(0, scroller.clientHeight * 0.8);
        return out;
      });
      expect(s.stillLoading, `a tile was still loading at step ${step}`).toBe(
        0,
      );
      expect(s.unloaded).toBe(0);
      photos += s.photos.length;
      if (s.atEnd) break;
    }
    expect(photos).toBeGreaterThan(0);
  });
