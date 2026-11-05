import { test, expect, type Page } from './test';
import { artwork, quietCookies } from './helpers';

/**
 * The range reveal (founder, 5 Nov):
 *  - every tile the browser can draw shows the drawing on its product within about a second of the
 *    drawing being stored (an INSTANT preview, drawn from the browser's own copy — nothing sent);
 *  - the "making your collection" loader never lifts before the FIRST SIX tiles have painted
 *    (instant preview or the server's photo);
 *  - the server's photos are asked for by position: the first six at once; the rest six at a time,
 *    in order, ON THEIR OWN once the first six have painted and the range shows — nothing waits for a
 *    scroll (founder, 5 Nov) — and every tile gets its photo;
 *  - a photo swaps in over its instant preview in exactly the same place: no layout shift.
 * Server photos are slowed, like the deployed site.
 */

/** In the page (installed before it loads): the range's tiles, in order, and what each shows. */
function installTiles() {
  const ok = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;
  (window as unknown as { __tiles: () => unknown }).__tiles = () => {
    const scroller = [...document.querySelectorAll('.brand-scroll')].sort((a, b) => b.querySelectorAll('.polaroid').length - a.querySelectorAll('.polaroid').length)[0];
    return [...(scroller?.querySelectorAll('.polaroid') ?? [])].map((t) => {
      const inst = [...t.querySelectorAll('[data-instant]')];
      const photos = [...t.querySelectorAll<HTMLImageElement>('img[alt^="your drawing on"]')];
      return {
        name: t.querySelector('span')?.textContent ?? '',
        instant: inst.length > 0 && inst.every((d) => { const imgs = [...d.querySelectorAll('img')]; return imgs.length >= 2 && imgs.every(ok); }),
        photo: photos.length > 0 && photos.every(ok),
        standIn: !!t.querySelector('[data-standin] img'),
      };
    });
  };
}
const tilesNow = (page: Page) => page.evaluate(() => (window as unknown as { __tiles: () => Tile[] }).__tiles());
type Tile = { name: string; instant: boolean; photo: boolean; standIn: boolean };

async function upload(page: Page) {
  await page.goto('/start-creating');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /upload a drawing/i }).click()]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: await artwork() });
}
const loader = (page: Page) => page.getByRole('status').filter({ hasText: 'making your collection' });

for (const vp of [
  { w: 390, h: 844 },
  { w: 1280, h: 900 },
])
  test(`the loader holds until the first six have painted; then every group follows on its own, no scrolling (${vp.w}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await quietCookies(page);
    await page.addInitScript(installTiles);
    // the server's photos are slow, like the deployed site; each request is one picture
    const asked: number[] = [];
    await page.route('**/api/mockup/batch', async (r) => {
      asked.push(Date.now());
      await new Promise((ok) => setTimeout(ok, 1200));
      await r.continue();
    });
    // the moment the loader goes, what the first six tiles show (snapshot in the same task as its removal)
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const w = window as unknown as { __atReveal?: unknown; __revealAt?: number; __loaderSeen?: boolean; __tiles: () => unknown };
        const up = [...document.querySelectorAll('[role=status]')].some((e) => /making your collection/.test(e.textContent ?? ''));
        if (up) w.__loaderSeen = true;
        else if (w.__loaderSeen && !w.__atReveal) {
          w.__atReveal = w.__tiles();
          w.__revealAt = Date.now();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await upload(page);
    await expect(loader(page)).toBeVisible({ timeout: 30_000 });
    await expect(loader(page)).toHaveCount(0, { timeout: 90_000 });

    const { atReveal, revealAt } = await page.evaluate(() => {
      const w = window as unknown as { __atReveal: Tile[]; __revealAt: number };
      return { atReveal: w.__atReveal, revealAt: w.__revealAt };
    });
    expect(atReveal.length).toBeGreaterThan(6);
    for (const t of atReveal.slice(0, 6)) expect(t.instant || t.photo, `${t.name} had painted nothing when the loader lifted`).toBe(true);
    // before the reveal only the first six were asked for — later groups never compete with them
    expect(asked.filter((t) => t < revealAt).length, 'asked for more than the first six before the range showed').toBeLessThanOrEqual(6);

    // then, WITHOUT ANY SCROLLING, every group is asked for in turn and every tile gets its photo
    const total = atReveal.length;
    await expect.poll(() => asked.length, { timeout: 90_000, message: 'not every group was asked for' }).toBeGreaterThanOrEqual(total - 1); // the family set's four tees are two pictures
    await expect.poll(async () => (await tilesNow(page)).filter((t) => !t.photo).map((t) => t.name), { timeout: 60_000 }).toEqual([]);
    const scrolled = await page.evaluate(() => {
      const sc = [...document.querySelectorAll('.brand-scroll')].sort((a, b) => b.querySelectorAll('.polaroid').length - a.querySelectorAll('.polaroid').length)[0]!;
      return sc.scrollTop + window.scrollY;
    });
    expect(scrolled, 'the test never scrolled').toBe(0);
  });

test('instant previews: the drawing on every product the browser can draw within a second of the drawing being stored', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await quietCookies(page);
  await page.addInitScript(installTiles);
  let storedAt = 0;
  // the server's photos never come: whatever shows is the browser's own
  await page.route('**/api/mockup/batch', () => {
    storedAt ||= Date.now(); // the range asks the moment the drawing is stored
  });
  await upload(page);
  await expect.poll(() => storedAt, { timeout: 30_000 }).toBeGreaterThan(0);
  // the first six include tiles the browser can draw and ones it can't (they show their product photo)
  await expect
    .poll(async () => (await tilesNow(page)).slice(0, 6).filter((t) => t.instant).length, { timeout: 5_000, intervals: [50] })
    .toBeGreaterThanOrEqual(3);
  const firstSixInstantAt = Date.now();
  expect(firstSixInstantAt - storedAt, 'instant previews took more than ~1 s').toBeLessThan(1500);
  // the whole range: every tile shows the drawing, its product photo, or (a layout of pieces) its calm block
  const tiles = await tilesNow(page);
  expect(tiles.filter((t) => t.instant).length).toBeGreaterThanOrEqual(10);
  expect(tiles.filter((t) => t.standIn).length).toBeGreaterThanOrEqual(5);
  // …and with nothing from the server, the loader can't lift on the strength of photos alone: it waits
  // for the tiles it can't draw (the safety timeout aside)
  await expect(loader(page)).toBeVisible();
});

test('a photo swaps in over its instant preview in the same place — no layout shift, the same framing', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await quietCookies(page);
  await page.addInitScript(installTiles);
  // hold the photos until the instant previews are measured
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  await page.route('**/api/mockup/batch', async (r) => {
    await held;
    await r.continue();
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__shift += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await upload(page);
  const box = (sel: string) =>
    page.evaluate((sel) => {
      const scroller = [...document.querySelectorAll('.brand-scroll')].sort((a, b) => b.querySelectorAll('.polaroid').length - a.querySelectorAll('.polaroid').length)[0];
      return [...(scroller?.querySelectorAll('.polaroid') ?? [])].slice(0, 6).map((t) => {
        const el = t.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        if (el instanceof HTMLImageElement) {
          // the picture's own rectangle inside its object-contain box
          const r = el.getBoundingClientRect();
          const k = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
          const w = el.naturalWidth * k, h = el.naturalHeight * k;
          return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, w, h, tile: t.getBoundingClientRect().height };
        }
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, tile: t.getBoundingClientRect().height };
      });
    }, sel);
  await expect.poll(async () => (await box('[data-instant] .relative')).filter(Boolean).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(500);
  const instant = await box('[data-instant] .relative');
  const shiftBefore = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
  release();
  await expect.poll(async () => (await box('img[alt^="your drawing on"]')).filter(Boolean).length, { timeout: 60_000 }).toBe(6);
  await page.waitForTimeout(800);
  const photo = await box('img[alt^="your drawing on"]');
  let compared = 0;
  instant.forEach((a, i) => {
    const b = photo[i];
    if (!a || !b) return;
    compared++;
    // the same rectangle (to within 2px — the photo is the same frame as the instant preview's photo)
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(Math.abs(a.w - b.w)).toBeLessThan(2);
    expect(Math.abs(a.h - b.h)).toBeLessThan(2);
    expect(b.tile).toBe(a.tile); // the tile itself didn't grow or shrink
  });
  expect(compared).toBeGreaterThanOrEqual(3);
  const shiftAfter = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
  expect(shiftAfter - shiftBefore, 'layout shifted when the photos swapped in').toBeLessThan(0.01);
});
