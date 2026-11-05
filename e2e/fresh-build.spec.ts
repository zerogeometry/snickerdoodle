import { test, expect, type Page } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { uploadedAssetId, waitForAsset } from './shop-db';

/**
 * A tab left open across an update (founder, 5 Nov: "on mobile I'm still seeing a version of the site where the
 * automatic backgrounds … aren't working" — the phone had kept the page from before the update alive). When the
 * parent comes back to the tab and the live build is newer, the page reloads onto it, the drawing still there; on
 * the same build it's left alone. Phone and desktop alike. (src/lib/freshBuild.ts)
 */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
};

/** The parent switches away from the tab and back (another app, the home screen). */
async function awayAndBack(page: Page) {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __thisPage?: number }).__thisPage = 1));
const marked = (page: Page) => page.evaluate(() => (window as unknown as { __thisPage?: number }).__thisPage === 1);

for (const size of ['desktop', 'phone'] as const)
  test.describe(size, () => {
    test.use(size === 'phone' ? PHONE : {});

    test('back to a tab from before an update: it reloads onto the new build, the drawing kept', async ({ page }) => {
      test.setTimeout(180_000);
      const live = await (await page.request.get('/api/health')).json();
      test.skip(!live.build || live.build === 'dev', 'needs a server started with a build tag (playwright.config.ts sets APP_BUILD)');
      await quietCookies(page);
      await uploadAndOpenRange(page);
      const assetId = await waitForAsset(page);

      // the site is updated while the tab sits in the background
      await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, db: 'ok', build: `${live.build}-newer` } }));
      await mark(page);
      await Promise.all([page.waitForEvent('load'), awayAndBack(page)]);
      expect(await marked(page)).toBe(false); // a fresh page
      await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
      expect(await uploadedAssetId(page)).toBe(assetId);

      // …and on the build it was served by, coming back changes nothing
      await page.unroute('**/api/health');
      await mark(page);
      const asked = page.waitForResponse((r) => r.url().endsWith('/api/health'));
      await awayAndBack(page);
      expect((await (await asked).json()).build).toBe(live.build);
      await page.waitForTimeout(1500);
      expect(await marked(page)).toBe(true);
    });
  });
