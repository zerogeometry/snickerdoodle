import { test, expect, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The phone Studio (founder, 22 Oct): the picture gets the screen. No "where to start" pane and no
 * options pane — the zoom controls float top-right over the picture, a quiet line at the top says
 * which tool is in use, and a tool's options rise as one slim row from behind the bottom toolbar.
 */
async function openStudio(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await expect(page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio/i }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(500);
}

test('phones: the picture gets the screen; options rise as a row over it', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page);

  // no panes: nothing between the picture and the toolbar
  await expect(page.getByRole('heading', { name: /where to start/i })).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', { name: 'studio tools' });
  const bar = (await toolbar.boundingBox())!;
  const stage = (await page.locator('canvas[aria-label^="your drawing"]').boundingBox())!;
  expect(stage.height).toBeGreaterThan(844 * 0.7); // the stage runs from the header to the toolbar
  expect(stage.y + stage.height).toBeGreaterThan(bar.y - 20);

  // zoom: a column, top-right, over the picture
  const zoomIn = (await page.getByRole('button', { name: 'zoom in' }).boundingBox())!;
  const zoomOut = (await page.getByRole('button', { name: 'zoom out' }).boundingBox())!;
  expect(zoomIn.x).toBeGreaterThan(300);
  expect(zoomOut.y).toBeGreaterThan(zoomIn.y + 40); // stacked, not side by side
  expect(zoomIn.y).toBeLessThan(stage.y + 80);

  // a tool: its name over the top of the picture, its options in one row just above the toolbar
  await toolbar.getByRole('button', { name: 'add text' }).click();
  const row = page.getByRole('group', { name: 'add text options' });
  await expect(row).toBeVisible();
  // (the desktop panel carries the same words, hidden on a phone — the visible one is over the picture)
  await expect(page.locator('span', { hasText: 'tap the picture where you’d like words' }).first()).toBeVisible();
  // it rises from behind the toolbar — measure once it's settled
  await expect.poll(async () => Math.round((await row.boundingBox())!.y), { timeout: 3000 }).toBeLessThan(bar.y - 40);
  await page.waitForTimeout(400);
  const r = (await row.boundingBox())!;
  expect(r.height).toBeLessThan(80); // a slim row, not a pane
  expect(r.y + r.height).toBeLessThanOrEqual(bar.y + 2);
  expect(r.y + r.height).toBeGreaterThan(bar.y - 30);
  // it scrolls sideways (fonts → colours → textures)
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // words are typed right there in the box on the picture: tap → type → tap away
  const box = (await page.locator('canvas[aria-label^="your drawing"]').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  const words = page.getByRole('textbox', { name: 'your words' });
  await expect(words).toBeFocused();
  await page.keyboard.type('Lily, 4'); // the placeholder was selected, so this replaces it
  await expect(words).toHaveValue('Lily, 4');
  const w = (await words.boundingBox())!;
  expect(w.y).toBeGreaterThan(box.y); // on the picture, not in the toolbar
  expect(w.y + w.height).toBeLessThan(bar.y - 60);
  await page.mouse.click(box.x + 20, box.y + 40);
  // finished: nothing is being typed into (the editor steps out of sight, and out of the a11y tree)
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('TEXTAREA');

  // tapping the tool again puts the row away
  await toolbar.getByRole('button', { name: 'add text' }).click();
  await expect(row).toHaveCount(0);
});
