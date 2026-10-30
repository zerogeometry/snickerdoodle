import { test, expect, type Page } from './test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * A refresh keeps the drawing for the tab (founder, 24 Oct): it's held in sessionStorage — this tab
 * only, gone when the tab closes, never localStorage — so reloading the range or a customize page
 * brings the same drawing back (with its stored asset, so editing still works). "create another"
 * forgets it. A new tab starts empty.
 */
const notLoaded = (page: Page) => page.getByText('Your drawing isn’t loaded');

test('upload → refresh customize → the drawing is still there (this tab only)', async ({ page, context }) => {
  test.setTimeout(180_000);
  const hydration: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat/i.test(m.text())) hydration.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (/hydrat/i.test(String(e))) hydration.push(String(e));
  });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });

  await page.evaluate(() => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push('/customize/mug'));
  await expect(page).toHaveURL(/\/customize\/mug/);
  await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /edit placement/i })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(notLoaded(page)).toHaveCount(0);
  // the stored drawing came back with its asset: editing the placement still opens
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position\?draft=/);
  await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });

  // the range page too
  await page.goto('/start-creating');
  await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible();
  await expect(page.getByRole('img', { name: 'your drawing' })).toBeVisible();

  // tab-scoped: sessionStorage has it, localStorage never does
  const where = await page.evaluate(() => ({
    session: Object.keys(sessionStorage).filter((k) => (sessionStorage.getItem(k) ?? '').includes('data:image/')),
    local: Object.keys(localStorage).filter((k) => (localStorage.getItem(k) ?? '').includes('data:image/')),
  }));
  expect(where.session).toEqual(['sd_upload']);
  expect(where.local).toEqual([]);

  // a new tab starts with nothing
  const other = await context.newPage();
  await other.goto('/customize/mug');
  await expect(notLoaded(other)).toBeVisible();
  await other.close();

  // "create another" forgets it: a refresh is back to the empty upload page
  await page.getByRole('button', { name: 'create another' }).click();
  await expect(page.getByRole('heading', { name: /upload your little one/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /upload your little one/i })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('sd_upload'))).toBeNull();
  expect(hydration).toEqual([]); // the server render and the first client render always agree
});
