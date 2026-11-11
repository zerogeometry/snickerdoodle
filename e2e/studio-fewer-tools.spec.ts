import { test, expect, type Page } from './test';
import { quietCookies } from './helpers';
import { openStudioFromCreate, resetRateLimits } from './sweep-01-helpers';

/**
 * "fewer tools" / "all tools" (founder, 11 Nov 2026). The Studio opens on fewer tools — the everyday
 * edits, one row on a phone with no swiping. "all tools" adds the rest and is remembered on the device.
 * On phones compare floats on the picture and start again sits by undo, so the row keeps its room.
 */
const FEWER = ['remove background', 'eraser', 'remove colour', 'add text', 'christmas', 'background'];
const IN_SEASON = '2026-11-20T10:00:00Z';
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'studio tools' });
const toolNames = async (page: Page) => (await toolbar(page).getByRole('button').all()).map((b) => b.getAttribute('aria-label'));

test.beforeEach(async () => resetRateLimits());

test('phone: fewer tools fit one row; compare on the picture; start again by undo; all tools is remembered', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.setFixedTime(new Date(IN_SEASON));
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await openStudioFromCreate(page);

  // the everyday edits, nothing else — in one row that doesn't scroll, every one a 44px target
  expect(await Promise.all(await toolNames(page))).toEqual(FEWER);
  const row = toolbar(page);
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const b of await row.getByRole('button').all()) {
    const bb = (await b.boundingBox())!;
    expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
    expect(bb.x + bb.width).toBeLessThanOrEqual(390);
  }

  // compare: press and hold the eye on the picture → "your original"; let go → back
  const eye = page.getByRole('button', { name: 'compare — hold to see your original' });
  const eb = (await eye.boundingBox())!;
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await expect(page.getByText('your original', { exact: true }).first()).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText('your original', { exact: true })).toHaveCount(0);

  // start again sits with undo/redo up top, and still asks first
  await page.getByRole('banner').getByRole('button', { name: 'start again' }).click();
  const dlg = page.getByRole('dialog', { name: /start again/i });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'keep my edits' }).click();

  // the yellow arrow's sheet: the switch, then every tool
  await page.getByRole('button', { name: 'show what each tool does' }).click();
  const sheet = page.getByRole('dialog', { name: 'tools' });
  await expect(sheet.getByRole('radio', { name: 'fewer tools' })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByRole('button', { name: 'draw', exact: true })).toHaveCount(0);
  await sheet.getByRole('radio', { name: 'all tools' }).click();
  await expect(sheet.getByRole('button', { name: 'draw', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'show icons only' }).click();
  for (const name of ['bring back', 'draw', 'shapes', 'layers', 'crop', 'rotate', 'flip']) await expect(toolbar(page).getByRole('button', { name, exact: true })).toHaveCount(1);

  // remembered on this device
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('canvas')?.width);
  await expect(toolbar(page).getByRole('button', { name: 'crop', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'show what each tool does' }).click();
  await sheet.getByRole('radio', { name: 'fewer tools' }).click();
  await sheet.getByRole('button', { name: 'show icons only' }).click();
  await expect(toolbar(page).getByRole('button', { name: 'crop', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('snickerdoodle.studio.tool-set'))).toBe('fewer');
});

test('desktop: a tool reached from "switch to" stays on the rail; the rail’s own switch shows all tools', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.setFixedTime(new Date(IN_SEASON));
  await page.setViewportSize({ width: 1280, height: 800 });
  await quietCookies(page);
  await openStudioFromCreate(page);
  const rail = toolbar(page);

  // compare + start again stay in the rail whatever the choice
  for (const name of [...FEWER, 'compare', 'start again']) await expect(rail.getByRole('button', { name, exact: true })).toHaveCount(1);
  await expect(rail.getByRole('button', { name: 'bring back', exact: true })).toHaveCount(0);

  // eraser → "switch to: bring back" brings it onto the rail, and it stays after
  await rail.getByRole('button', { name: 'eraser', exact: true }).click();
  await page.getByRole('region', { name: 'tool options' }).getByRole('button', { name: 'bring back' }).click();
  await expect(rail.getByRole('button', { name: 'bring back', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await rail.getByRole('button', { name: 'add text', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'bring back', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // the rail's switch
  await rail.getByRole('button', { name: 'show all tools' }).click();
  await expect(rail.getByRole('button', { name: 'flip', exact: true })).toHaveCount(1);
  await rail.getByRole('button', { name: 'show fewer tools' }).click();
  await expect(rail.getByRole('button', { name: 'flip', exact: true })).toHaveCount(0);
});
