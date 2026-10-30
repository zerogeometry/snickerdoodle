import { test, expect, type Request } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The base colour reaches EVERY preview of the printed product on the customize page — the big
 * preview AND the thumbnails beneath it (frame colours, cushion shapes, the jigsaw, the greetings
 * card's closed + outside views) — but never the jigsaw's keepsake tin, a display of the lid that
 * doesn't take the colour.
 * Checked on the preview requests themselves, so it holds whether or not this machine has the
 * product photos.
 */
const NAVY = '#26334f';

for (const key of ['framedPrint', 'cushion', 'jigsaw', 'card']) {
  test(`${key}: every thumbnail is previewed on the chosen base colour`, async ({ page }) => {
    test.setTimeout(120_000);
    await quietCookies(page);
    await uploadAndOpenRange(page);
    // the drawing is in (the range has been made from it)
    await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
    // client-side, so the drawing (held in memory) comes too
    await page.waitForFunction(() => Boolean((window as unknown as { next?: { router?: unknown } }).next?.router));
    await page.evaluate((k) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(`/customize/${k}`), key);
    await expect(page).toHaveURL(new RegExp(`/customize/${key}`));
    // ready: the page has drawn its first previews (on the default colour) — only then pick a colour,
    // as a person would; otherwise those first requests land after the click and read as "not navy"
    await customizeReady(page);

    const bodies: { size?: string; view?: string; ground?: string; variantId: string }[] = [];
    const record = (r: Request) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/mockup')) bodies.push(r.postDataJSON());
    };
    await page.getByRole('button', { name: /— change it$/ }).click();
    await page.getByLabel('colour code').fill(NAVY.slice(1));
    page.on('request', record);
    await page.getByRole('button', { name: 'use this colour' }).click();
    // the thumbnails re-ask on the new colour (the main preview too)
    await expect.poll(() => bodies.filter((b) => b.size === 'thumb' && b.ground === NAVY).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);

    const shown = bodies.filter((b) => b.view !== 'tin');
    expect(shown.some((b) => b.size === 'zoom')).toBe(true);
    for (const b of shown) expect(b, `preview ${b.size} ${b.view ?? ''}`).toMatchObject({ ground: NAVY });
    for (const b of bodies.filter((x) => x.view === 'tin')) expect(b.ground).toBeUndefined();
    if (key === 'jigsaw') {
      // the tin thumbnail is there, uncoloured
      await page.getByRole('button', { name: 'the tin' }).click();
      await page.waitForTimeout(800);
      const tin = bodies.filter((x) => x.view === 'tin');
      expect(tin.length).toBeGreaterThan(0);
      for (const b of tin) expect(b.ground).toBeUndefined();
    }
  });
}
