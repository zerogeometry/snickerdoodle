import { test, expect, type Page } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The print-accuracy fixes (founder, 16 Nov 2026 — reports/print-accuracy-2026-11-16):
 *  - the cosy edge: the positioner softly shades the band that still prints but tucks into a seam /
 *    curls round / gets cut, and says why in a friendly line — on the products Prodigi's templates
 *    give a safe area for; nowhere else;
 *  - the christmas sack: only Prodigi's 28×32 cm box prints, and the positioner says so.
 * SAFE_AREA_SHOTS=<dir> saves a screenshot of each placement (for the founder's review).
 */
const rangeReady = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
const SHOTS = process.env.SAFE_AREA_SHOTS;

async function openPlacement(page: Page, productKey: string) {
  await page.evaluate((k) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(`/customize/${k}`), productKey);
  await expect(page).toHaveURL(new RegExp(`/customize/${productKey}`));
  await customizeReady(page);
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position/);
  await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
}

const SHADED: Record<string, RegExp> = {
  cushion: /tucks round into the seam/,
  ceramicOrnament: /right at the edge of the ornament/,
  playingCards: /where the cards are cut/,
  card: /where the card is cut/,
  mug: /stay mug-coloured/,
  blanket: /stitched hem/,
};

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1280, height: 900 }]] as const) {
  test.describe(`on a ${label}`, () => {
    test.use({ viewport, ...(label === 'phone' ? { hasTouch: true, isMobile: true } : {}) });

    test('the cosy edge shows where Prodigi’s safe area is — and only there; the sack says only its box prints', async ({ page }) => {
      test.setTimeout(360_000);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await rangeReady(page);
      for (const key of [...Object.keys(SHADED), 'framedPrint', 'sack']) {
        await openPlacement(page, key);
        if (key in SHADED) {
          await expect(page.getByTestId('safe-band').first(), `${key}: shaded edge`).toBeVisible();
          await expect(page.getByText(SHADED[key]!), `${key}: friendly line`).toBeVisible();
        } else {
          await expect(page.getByTestId('safe-band'), `${key}: no shaded edge`).toHaveCount(0);
        }
        if (key === 'sack') await expect(page.getByText(/only the outlined box prints — the sack round it stays plain/)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${key}: no sideways scroll`).toBeLessThanOrEqual(0);
        if (SHOTS) await page.locator('[role="application"]').first().screenshot({ path: `${SHOTS}/${label}-${key}.png` });
        if (SHOTS && label === 'phone') await page.screenshot({ path: `${SHOTS}/${label}-${key}-page.png`, fullPage: false });
        // on the product photo the cosy edge follows the product's own outline (the heart, the disc)
        if (key === 'cushion' || key === 'ceramicOrnament' || key === 'blanket') {
          await page.getByRole('button', { name: /^on the / }).click();
          await page.waitForTimeout(1200);
          await expect(page.getByTestId('safe-band').first(), `${key}: shaded edge on the photo`).toBeVisible();
          if (SHOTS) await page.locator('[role="application"]').first().screenshot({ path: `${SHOTS}/${label}-${key}-photo.png` });
        }
        if (key === 'sack') {
          // on the sack photo the drawing sits in the print box, not over the whole sack
          await page.getByRole('button', { name: /^on the / }).click();
          await page.waitForTimeout(1200);
          if (SHOTS) await page.locator('[role="application"]').first().screenshot({ path: `${SHOTS}/${label}-${key}-photo.png` });
        }
        await page.goBack();
      }
    });
  });
}
