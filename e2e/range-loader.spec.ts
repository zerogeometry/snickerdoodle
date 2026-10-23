import { test, expect } from '@playwright/test';
import { artwork, quietCookies } from './helpers';

/**
 * The "making your range" loader stays until the TOP HALF of the tiles have their photos (founder,
 * 23 Oct), so what's seen first is never still loading: at the reveal no tile on the first screen is
 * still loading (pulsing block or sketch preview) and every photo shown has fully loaded. The bottom
 * half lands just after — walking down, every tile gets its photo within moments. The previews are
 * slowed to behave like the deployed site.
 */
for (const vp of [
  { w: 390, h: 844 },
  { w: 1280, h: 900 },
])
  test(`the range loader stays until the top half has its photos, the rest follow (${vp.w}px)`, async ({
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

    // The first screen at the reveal: complete. Then walk the range: every tile below gets its photo
    // within moments (asked for straight after the top half).
    const look = (scroll: boolean) =>
      page.evaluate((scroll) => {
        const scroller = [
          ...document.querySelectorAll<HTMLElement>('.brand-scroll'),
        ].sort(
          (a, b) =>
            b.querySelectorAll('img').length - a.querySelectorAll('img').length,
        )[0]!;
        const box = scroller.getBoundingClientRect();
        // on screen = inside the range's box AND the window (on a phone the range doesn't scroll on
        // its own — the page does)
        const top = Math.max(box.top, 0);
        const bottom = Math.min(box.bottom, window.innerHeight);
        const onScreen = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.bottom > top && r.top < bottom && r.width > 0;
        };
        const ownScroll = scroller.scrollHeight > scroller.clientHeight + 2;
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
          atEnd: ownScroll
            ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
            : box.bottom <= window.innerHeight + 2,
        };
        if (scroll) {
          if (ownScroll) scroller.scrollBy(0, scroller.clientHeight * 0.8);
          else window.scrollBy(0, window.innerHeight * 0.8);
        }
        return out;
      }, scroll);
    const first = await look(false);
    expect(first.stillLoading, 'a tile on the first screen was still loading at the reveal').toBe(0);
    expect(first.unloaded).toBe(0);
    expect(first.photos.length).toBeGreaterThan(0);

    let photos = 0;
    for (let step = 0; step < 40; step++) {
      await expect
        .poll(async () => {
          const s = await look(false);
          return s.stillLoading + s.unloaded;
        }, { message: `tiles still loading at step ${step}`, timeout: 30_000 })
        .toBe(0);
      const s = await look(true);
      photos += s.photos.length;
      if (s.atEnd) break;
      await page.waitForTimeout(300);
    }
    expect(photos).toBeGreaterThan(0);
  });
