import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { artwork, quietCookies, uploadAndOpenRange } from './helpers';
import { goClient, optionGroup, rangeReady, shopCatalogue, waitForAsset } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): the print-quality (low-resolution) warning appears when it should and
 * not otherwise, its one-tap fixes work, and the "gently enhance" (upscale) path renders.
 *  - a big drawing (2000 px): what every product says at its default size;
 *  - a small drawing (500 px): what every product says, the "too small" block + "make it <size>" fix,
 *    the editor's BLOCK (save greyed, "zoom out to fix"), and an enhanced print-file preview.
 */
const BUILDERS = new Set(['cardPack', 'calendar', 'christmasBundle']);
const SHOTS = 'reports/test-sweep-2026-10-29/shots/02';

async function small(px: number): Promise<Buffer> {
  return sharp(await artwork()).resize(px, px).png().toBuffer();
}

/** The customize page's print-quality line (role=status under the options), or '' when there is none. */
async function qualityLine(page: Page): Promise<string> {
  const s = page.getByRole('status').filter({ hasText: /print-ready|it’ll print|too small to print well/ });
  await expect.poll(() => s.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  return (await s.first().innerText()).replace(/\s+/g, ' ').trim();
}

async function sweepDefaults(page: Page) {
  const out: Record<string, string> = {};
  for (const p of (await shopCatalogue()).filter((x) => !BUILDERS.has(x.key))) {
    await goClient(page, `/customize/${p.key}`);
    await expect(page.getByRole('heading', { level: 1, name: p.label, exact: true })).toBeVisible({ timeout: 30_000 });
    out[p.key] = await qualityLine(page).catch(() => '(no quality line)');
  }
  return out;
}

test('a big drawing: every product is print-ready at its default size, no warning', async ({ page }) => {
  test.setTimeout(600_000);
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);
  const lines = await sweepDefaults(page);
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/quality-2000px.json`, JSON.stringify(lines, null, 1));
  const warned = Object.entries(lines).filter(([, l]) => /too small/.test(l));
  expect(warned, `a 2000px drawing warned on: ${warned.map(([k, l]) => `${k}: ${l}`).join(' / ')}`).toEqual([]);
});

test('a small drawing: the warning, the one-tap bigger→smaller fix, the editor block and the enhanced preview', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await quietCookies(page);
  await uploadAndOpenRange(page, await small(500));
  await rangeReady(page);
  await waitForAsset(page);
  const lines = await sweepDefaults(page);
  writeFileSync(`${SHOTS}/quality-500px.json`, JSON.stringify(lines, null, 1));
  expect(Object.values(lines).some((l) => /too small/.test(l)), 'a 500px drawing is too small for something').toBe(true);

  // a size that blocks offers the biggest size that prints. (A frame never gets here at 500px — every
  // frame size blocks together, so it says "try a smaller product".) The heart cushion → 12″ square.
  await goClient(page, '/customize/framedPrint');
  await expect(page.getByText(/this drawing is too small to print well at/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('try a smaller product, or a bigger photo of the drawing.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^add to basket · / })).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/quality-block-framedPrint-phone.jpg`, type: 'jpeg', quality: 55 });
  await goClient(page, '/customize/cushion');
  const sizes = optionGroup(page, 'Size').getByRole('button');
  await expect(sizes.first()).toBeVisible({ timeout: 30_000 });
  await sizes.filter({ hasText: 'heart' }).click();
  await expect(page.getByText(/this drawing is too small to print well at heart/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^add to basket · / })).toBeDisabled();
  const fix = page.getByRole('button', { name: /^make it .+ — prints beautifully$/ });
  await expect(fix).toBeVisible();
  const to = /^make it (.+) — prints beautifully$/.exec((await fix.innerText()).trim())![1]!;
  await fix.click();
  await expect(sizes.filter({ hasText: to }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/this drawing is too small to print well at/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^add to basket · / })).toBeEnabled();

  // the editor: zoom right in until it blocks → save greyed + why, "zoom out to fix" frees it
  await page.getByRole('button', { name: /^edit placement$/i }).click();
  await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[role="application"]').focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('+');
  await expect(page.getByText('image quality too low at this size')).toBeVisible();
  await expect(page.getByRole('button', { name: /save & return/ })).toBeDisabled();
  await expect(page.getByText(/zoom out a touch or upload another/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/quality-editor-block-phone.jpg`, type: 'jpeg', quality: 55 });
  await page.getByRole('button', { name: /^zoom out to (fix|print-ready)$/ }).click();
  await expect(page.getByRole('button', { name: /save & return/ })).toBeEnabled();
  await expect(page.getByText('image quality too low at this size')).toHaveCount(0);

  // the "gently enhance" (upscale) path: the print-file preview of an enhanced placement says so
  const badge = page.getByText(/we'll gently enhance it|a little soft up close|print-ready · \d+ dpi/).first();
  const said = await badge.innerText();
  await page.getByRole('button', { name: 'preview the exact print file' }).click();
  const meta = page.getByText(/^\d+×\d+px · \d+ dpi/);
  await expect(meta).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('img', { name: 'rendered print file' })).toBeVisible();
  const m = (await meta.innerText()).trim();
  writeFileSync(`${SHOTS}/quality-enhanced-render.json`, JSON.stringify({ badge: said, render: m }, null, 1));
  if (/enhance|soft/.test(said)) expect(m, 'an enhanced placement renders enhanced').toContain('gently enhanced');
});

// 02-B2: the "make it <size> — prints beautifully" fix walks product.sizes — for a PHONE CASE those are
// phone MODELS, so a too-small drawing on an iPhone 17 case offers "make it iPhone 13 mini" (a case for
// a phone the parent doesn't have). Expected: no model switch is ever offered (just "try a smaller
// product, or a bigger photo"). src/app/customize/[productKey]/page.tsx:411-424 (largestSize / fitSize).
test.fixme('02-B2: a small drawing on a phone case never offers to switch the phone model', async ({ page }) => {
  await quietCookies(page);
  await uploadAndOpenRange(page, await small(500));
  await rangeReady(page);
  await waitForAsset(page);
  await goClient(page, '/customize/phoneCase');
  await expect(page.getByText(/this drawing is too small to print well at/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^make it .+ — prints beautifully$/ })).toHaveCount(0);
});
