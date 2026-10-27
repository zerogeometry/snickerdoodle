import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Never silently under-resolve (Studio spec §15, docs/04): a small picture on a big product
 * shows a plain warning, the order can't go ahead blurry, and the fix is offered RIGHT THERE —
 * one tap and it's print-ready. Asserted as behaviour (warning → offered fix → ✓ → can order),
 * not by exact wording or which fix is offered: the Positioner's one-tap fixes are evolving
 * (e.g. a one-tap enhance), and any honest fix must pass this.
 */

/** A small (but not tiny) drawing: accepted on upload, too small for a big frame as placed. */
async function smallDrawing(px = 700): Promise<Buffer> {
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
const lowResWarning = (page: Page) => page.getByText(/too small to print well|image quality too low/i).filter({ visible: true }).first();

test('low-res: small drawing on a big frame → DPI warning → the offered one-tap fix → ✓ → it can be ordered', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await uploadAndOpenRange(page, await smallDrawing());
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint/);

  // ── the product page: the honest warning, and the order can't go ahead blurry ─────────
  await biggestSize(page).click();
  await expect(lowResWarning(page)).toBeVisible();
  await expect(addToBasket(page), 'a blurry print can’t be added').toBeDisabled();

  // the fix: a smaller size that prints, offered in the warning — or, when no size would (as
  // for a frame, where every size needs the same pixels), the placement editor, where the
  // picture is fitted to print well
  const sizeFix = page.getByRole('status').filter({ hasText: /too small to print well/i }).getByRole('button');
  if (await sizeFix.count()) {
    await sizeFix.first().click();
  } else {
    await page.getByRole('button', { name: /edit placement/i }).click();
    await expect(page).toHaveURL(/\/studio\/position\?draft=/);

    // ── the placement editor: the DPI badge warns, saving is held back, the fix is beside it
    await expect(lowResWarning(page)).toBeVisible();
    const save = page.getByRole('button', { name: /save & return/i }).filter({ visible: true }).first();
    await expect(save).toBeDisabled();
    const fix = page.getByRole('button', { name: /zoom out to (fix|print-ready)|enhance|sharpen|upscale/i }).filter({ visible: true }).first();
    await expect(fix, 'the fix is offered with the warning, never a dead end').toBeVisible();
    await fix.click();

    // ✓ — print-ready, or "gently enhanced / lovely from a step back" (still an honest print)
    await expect(lowResWarning(page)).toHaveCount(0);
    await expect(page.getByText(/print-ready|gently enhance|soft up close/i).filter({ visible: true }).first()).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page).toHaveURL(/\/customize\/framedPrint/);
  }

  // back on the product: no warning, a ✓, and it goes in the basket
  await expect(lowResWarning(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /print-ready|it’ll print/i })).toBeVisible();
  await expect(addToBasket(page)).toBeEnabled();
  await addToBasket(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
