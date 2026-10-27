import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Never silently under-resolve (Studio spec §15, docs/04): a small picture on a big product
 * shows a plain warning, the order can't go ahead blurry, and the fix is offered RIGHT THERE —
 * ⚠ → one tap "upscale to print quality" (self-hosted, the original untouched) → ✓.
 * Asserted as behaviour (warning → offered fix → ✓ → can order), with role/text selectors
 * tolerant of copy tweaks, so the Studio / Positioner can keep evolving around it.
 */

/** A drawn (brand-safe) square picture of `px` pixels. */
async function drawing(px: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}">
    <rect x="${px * 0.14}" y="${px * 0.14}" width="${px * 0.72}" height="${px * 0.72}" rx="${px * 0.07}" fill="#C8623A"/>
    <circle cx="${px / 2}" cy="${px * 0.43}" r="${px * 0.18}" fill="#84BBD0"/>
  </svg>`;
  return sharp({ create: { width: px, height: px, channels: 4, background: { r: 251, g: 245, b: 233, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

const biggestSize = (page: Page) => page.getByRole('button', { name: /24×32/ }).filter({ visible: true }).first();
const addToBasket = (page: Page) => page.getByRole('button', { name: /add to basket/i }).filter({ visible: true }).first();
const blocked = (page: Page) => page.getByText(/too small to print well|image quality too low/i).filter({ visible: true }).first();
/** The placement editor's print-readiness pill. */
const pill = (page: Page) => page.getByRole('status').filter({ hasText: /print-ready|too small|a little small|soft up close|sharpens it up/i }).first();
const upscale = (page: Page) => page.getByRole('button', { name: /upscale to print quality/i }).filter({ visible: true });
const saveAndReturn = (page: Page) => page.getByRole('button', { name: /save & return/i }).filter({ visible: true }).first();

async function framedPrintAtBiggestSize(page: Page, px: number) {
  await quietCookies(page);
  await uploadAndOpenRange(page, await drawing(px));
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint/);
  await biggestSize(page).click();
}

async function openPlacementEditor(page: Page) {
  await page.getByRole('button', { name: /edit placement/i }).click();
  await expect(page).toHaveURL(/\/studio\/position\?draft=/);
  await expect(pill(page)).toBeVisible();
}

/** ⚠ "a little small" → one tap upscale → ✓ print-ready, and saving is allowed. */
async function upscaleToPrintQuality(page: Page) {
  await expect(pill(page)).toContainText(/a little small|sharpens it up/i);
  await expect(upscale(page), 'the one-tap upscale sits in the warning').toBeVisible();
  await upscale(page).click();
  await expect(pill(page)).toContainText(/print-ready/i, { timeout: 60_000 });
  await expect(upscale(page)).toHaveCount(0);
  await expect(saveAndReturn(page)).toBeEnabled();
}

async function saveAndOrder(page: Page) {
  await saveAndReturn(page).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint/);
  await expect(blocked(page)).toHaveCount(0);
  await expect(addToBasket(page)).toBeEnabled();
  await addToBasket(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });
}

test('low-res: a little small for the size → ⚠ → one-tap “upscale to print quality” → ✓ → ordered', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await framedPrintAtBiggestSize(page, 1200);
  await openPlacementEditor(page);
  await upscaleToPrintQuality(page);
  await saveAndOrder(page);
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});

test('low-res: too small to print → warning, add disabled → fit a size that prints → upscale → ✓ → ordered', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await framedPrintAtBiggestSize(page, 700);

  // the product page: an honest warning, and a blurry print can't be added
  await expect(blocked(page)).toBeVisible();
  await expect(addToBasket(page), 'a blurry print can’t be added').toBeDisabled();

  // a smaller size offered in the warning, if one prints — otherwise the placement editor
  const sizeFix = page.getByRole('status').filter({ hasText: /too small to print well/i }).getByRole('button');
  if (await sizeFix.count()) {
    await sizeFix.first().click();
    await expect(blocked(page)).toHaveCount(0);
    await expect(addToBasket(page)).toBeEnabled();
    return;
  }
  await openPlacementEditor(page);
  await expect(saveAndReturn(page), 'saving is held back while it’s too small').toBeDisabled();
  await page.getByRole('button', { name: /fit a size that prints well|zoom out to (fix|print-ready)/i }).filter({ visible: true }).first().click();
  // fitted: now it's "a little small" (or straight to ✓) — finish with the upscale if offered
  await expect(pill(page)).not.toContainText(/too small/i);
  if (await upscale(page).count()) await upscaleToPrintQuality(page);
  await expect(pill(page)).toContainText(/print-ready|soft up close/i);
  await saveAndOrder(page);
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
