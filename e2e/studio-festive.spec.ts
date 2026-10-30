import { test, expect, type Page } from './test';
import { quietCookies } from './helpers';

/**
 * The Studio's christmas drawer (in season only: 1 Nov–6 Jan, UK — the browser's clock decides it
 * here): twelve stickers that add as ordinary layers (move · size · turn · flip), the festive
 * touches as one-tap toggles with undo, and the Christmas greeting fonts in the font picker.
 */
async function openBlankStudio(page: Page, when: string) {
  await page.clock.setFixedTime(new Date(when));
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await page.goto('/start-creating');
  await page.getByRole('button', { name: /design from scratch/i }).click();
  await page.getByRole('group', { name: 'canvas shape' }).getByRole('button').nth(1).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
}

test('out of season there is no christmas tool, and no festive fonts', async ({ page }) => {
  await openBlankStudio(page, '2026-10-25T12:00:00Z');
  const toolbar = page.getByRole('toolbar', { name: 'studio tools' });
  await expect(toolbar.getByRole('button', { name: 'christmas' })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'add text' }).click();
  await expect(page.getByRole('group', { name: 'add text options' }).getByRole('button', { name: 'Emilys Candy' })).toHaveCount(0);
});

test('in season: the christmas drawer adds stickers and festive touches as layers', async ({ page }) => {
  test.setTimeout(120_000);
  await openBlankStudio(page, '2026-12-01T12:00:00Z');
  const toolbar = page.getByRole('toolbar', { name: 'studio tools' });
  await toolbar.getByRole('button', { name: 'christmas' }).click();

  const drawer = page.getByRole('dialog', { name: 'christmas' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('list', { name: 'christmas stickers' }).getByRole('button')).toHaveCount(12);
  await expect(page.locator('body')).not.toContainText(/\bAI\b/);
  for (const b of await drawer.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // festive touches: on, undo, on/off
  const frame = drawer.getByRole('button', { name: 'gold frame' });
  await frame.click();
  await expect(frame).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: 'snowfall' }).click();
  await page.keyboard.press('Escape'); // the drawer closes; undo is in the header
  await page.getByRole('button', { name: 'undo' }).click();
  await toolbar.getByRole('button', { name: 'christmas' }).click();
  await expect(drawer.getByRole('button', { name: 'snowfall' })).toHaveAttribute('aria-pressed', 'false');
  await expect(frame).toHaveAttribute('aria-pressed', 'true');

  // a sticker: added, picked up, flippable and sizeable like any layer
  await drawer.getByRole('button', { name: 'add reindeer sticker' }).click();
  await expect(drawer).toHaveCount(0);
  const editing = page.getByRole('group', { name: 'changing the reindeer sticker' });
  await expect(editing).toBeVisible();
  await editing.getByRole('button', { name: 'flip the reindeer' }).click();
  await expect(editing.getByRole('button', { name: 'flip the reindeer' })).toHaveAttribute('aria-pressed', 'true');
  await editing.getByRole('button', { name: 'bigger reindeer' }).click();
  await expect(page.getByRole('group', { name: 'layers, top first' }).getByRole('button', { name: 'layer: reindeer sticker' })).toBeVisible();

  // the Christmas greeting fonts are in the text tool
  await toolbar.getByRole('button', { name: 'add text' }).click();
  await expect(page.getByRole('group', { name: 'add text options' }).getByRole('button', { name: 'Emilys Candy' })).toBeVisible();
});
