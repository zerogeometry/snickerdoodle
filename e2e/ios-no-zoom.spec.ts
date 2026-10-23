import { test, expect, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * iPhone Safari ZOOMS THE WHOLE PAGE IN when a text field under 16px is focused, and doesn't zoom
 * back out — pop-ups, the studio and menus end up too big and off screen (founder, 23 Oct). On a
 * touch phone every text field must be at least 16px, and nothing may be wider than the screen.
 */
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

async function fieldSizes(page: Page): Promise<{ name: string; px: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input, textarea, select')]
      .filter((el) => !['range', 'color', 'checkbox', 'radio', 'file', 'hidden'].includes((el as HTMLInputElement).type))
      .map((el) => ({ name: el.getAttribute('aria-label') ?? (el as HTMLInputElement).placeholder ?? el.tagName, px: parseFloat(getComputedStyle(el).fontSize) })),
  );
}
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('touch phone: text fields are 16px or more, and nothing runs off the side', async ({ page }) => {
  test.setTimeout(180_000);
  await quietCookies(page);

  await page.goto('/login');
  for (const f of await fieldSizes(page)) expect(f.px, `login · ${f.name}`).toBeGreaterThanOrEqual(16);
  expect(await noSideways(page)).toBe(true);

  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  expect(await noSideways(page)).toBe(true);

  // the studio's words editor — the field that zoomed the studio off screen
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas[aria-label^="your drawing"]') as HTMLCanvasElement | null;
    return !!c && c.width > 0;
  });
  await page.waitForTimeout(500);
  await page.getByRole('toolbar', { name: 'studio tools' }).getByRole('button', { name: 'add text' }).click();
  // zoomed right out, the words are tiny on screen — the editor must still be ≥ 16px to the browser
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'zoom out' }).click();
  const box = (await page.locator('canvas[aria-label^="your drawing"]').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const words = page.getByRole('textbox', { name: 'your words' });
  await expect(words).toBeFocused();
  expect(parseFloat(await words.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await noSideways(page)).toBe(true);
});
