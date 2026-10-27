import { expect, type Locator, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from '../../e2e/helpers';
import { latestGiftLinkOf, reviewerClearsUploadsOf, setDisplayName, openMagicLink, testEmail } from '../../e2e/db';

/** Dates the app prints ("27 Oct", "gift request · 27 Oct") — the only per-run text on screen. */
const DATE_TEXT = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

/**
 * Bring a page to rest: every font face loaded, every (lazy) image fetched and decoded, back at
 * the top. Motion is already off (prefers-reduced-motion + the screenshot's animation freeze).
 */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // walk the page so lazy images start, then wait for every one to finish
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, 0);
  });
  // full-page shots paint everything at once: load lazy images now, and wait until each is
  // fetched AND decoded (a "complete" async-decoded image can still paint blank)
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((i) => ((i as HTMLImageElement).loading = 'eager')));
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((i) => i.complete)), { timeout: 30_000, message: 'all images loaded' })
    .toBe(true);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))).then(() => undefined));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** One full-page screenshot assertion, with the per-run bits masked. */
export async function shot(page: Page, name: string, opts: { mask?: Locator[]; fullPage?: boolean } = {}) {
  await settle(page);
  // transient toasts (src/ui/components/Toaster) come and go on their own clock
  const toasts = page.locator('[role="status"].bg-cocoa.rounded-full');
  const mask = [page.getByText(DATE_TEXT), toasts, ...(opts.mask ?? [])];
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: opts.fullPage ?? true, mask });
}

/**
 * A signed-in parent ("Sam") with one kept, review-cleared keepsake and a live gift link —
 * the same brand-safe drawn artwork every run, so the Home / Family / gift-link screens are
 * stable. Returns the gift-link token.
 */
export async function parentWithKeepsakeAndGiftLink(page: Page): Promise<{ email: string; token: string }> {
  const email = testEmail('visual');
  await page.context().clearCookies();
  await quietCookies(page);
  await openMagicLink(page, email, '/trust/privacy'); // lands somewhere that creates nothing
  await setDisplayName(email, 'Sam'); // before the family exists, so it's "Sam's" everywhere
  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: '+ keepsake' }).filter({ visible: true }).first().click();
  await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });
  await reviewerClearsUploadsOf(email);

  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/i }).click();
  const sheet = page.getByRole('dialog');
  const tile = sheet.locator('button[aria-pressed]:has(img)').first();
  await expect(async () => {
    if ((await tile.getAttribute('aria-pressed')) !== 'true') await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await sheet.getByRole('button', { name: /create gift request/i }).click();
  await expect(page.getByText(/now send it to someone special/i)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  return { email, token: (await latestGiftLinkOf(email)).token };
}
