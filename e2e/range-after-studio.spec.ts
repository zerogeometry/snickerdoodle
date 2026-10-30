import { test, expect, type Page } from './test';
import { quietCookies } from './helpers';
import { artwork } from './helpers';

/**
 * On a phone the "making your collection" loader sits right under "your masterpiece, made real", and
 * after saving in the studio the page opens THERE (the drawing + its buttons just above), with the
 * loader under the heading until the range arrives. Desktop keeps its side-by-side layout, unscrolled.
 */
const slowRange = async (page: Page) => {
  await page.route('**/api/mockup/batch', async (r) => {
    await new Promise((ok) => setTimeout(ok, 4000));
    await r.continue();
  });
};
const upload = async (page: Page) => {
  await page.goto('/start-creating');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /upload a drawing/i }).click()]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: await artwork() });
};
/** The studio has its picture drawn (a tap before then is ignored). */
const studioReady = async (page: Page) => {
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(500);
};
const heading = (page: Page) => page.getByRole('heading', { name: 'Your masterpiece, made real.' });
const loader = (page: Page) => page.getByRole('status').filter({ hasText: 'making your collection' });

/** The loader's picture starts within a short gap of the heading's bottom. */
async function expectLoaderUnderHeading(page: Page) {
  const h = (await heading(page).boundingBox())!;
  const firstIcon = await loader(page).locator('.loader-pop, .polaroid').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().top)));
  const polaroid = (await loader(page).locator('.polaroid').boundingBox())!;
  expect(polaroid.y - (h.y + h.height), 'loader right under the heading').toBeLessThan(120);
  expect(firstIcon).toBeGreaterThan(h.y + h.height - 4); // never over the heading
}

test('phone: the loader sits right under the heading', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await slowRange(page);
  await upload(page);
  await expect(loader(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await expectLoaderUnderHeading(page);
});

test('phone: after saving in the studio, the page opens at the heading with the loader under it', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await upload(page);
  await expect(loader(page)).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await studioReady(page);
  await page.getByRole('button', { name: 'remove background' }).last().click();
  await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled({ timeout: 150_000 });

  await slowRange(page);
  await page.getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/start-creating$/, { timeout: 30_000 }); // the hint is tidied away
  await expect(loader(page)).toBeVisible();
  await page.waitForTimeout(800);
  // the heading sits at the top, just under the sticky header; the drawing is scrolled past
  const h = (await heading(page).boundingBox())!;
  expect(h.y).toBeGreaterThan(55);
  expect(h.y).toBeLessThan(110);
  await expectLoaderUnderHeading(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  // the drawing + its buttons are still there, just above
  await expect(page.getByRole('button', { name: /edited · back to studio/i })).toBeAttached();
});

test('desktop: back from the studio stays at the top', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await quietCookies(page);
  await upload(page);
  await expect(loader(page)).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await studioReady(page);
  await page.getByRole('button', { name: 'remove background' }).first().click();
  await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled({ timeout: 150_000 });
  await page.getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/start-creating$/, { timeout: 30_000 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
