import { test, expect, type Page } from './test';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { signInByEmailLink, testEmail } from './harness';
import { basketLines, gbp, goClient, rangeReady, shopCatalogue, waitForAsset } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): the CHRISTMAS FAMILY BUNDLE builder (/customize/christmasBundle).
 * Step 1 sizes 2 / 4 / 8 at the server's prices; steps 2–4 start on the drawing in progress (the
 * coasters and every ornament wear the placemats' drawing until given their own); a piece given its
 * own drawing from the keepsake box keeps it, its "undo" puts the placemats' back; slot thumbnails stay
 * put while the keepsake box reloads; the basket line carries exactly those drawings at that size, and
 * reopening it from the basket brings the same set back.
 */
const SHOTS = 'reports/test-sweep-2026-10-29/shots/02';

async function drawing(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600"><rect x="200" y="200" width="1200" height="1200" rx="200" fill="${fill}"/></svg>`;
  return sharp({ create: { width: 1600, height: 1600, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

const piece = (page: Page, name: RegExp) => page.getByRole('button', { name });
const thumbOf = (page: Page, name: RegExp) => piece(page, name).locator('xpath=..').locator('img');
const priceSticker = (page: Page) => page.locator('span.sticker[aria-live="polite"]');

async function thumbsReady(page: Page, names: RegExp[]) {
  for (const n of names) {
    const img = thumbOf(page, n);
    await expect(img, `${n} thumbnail`).toHaveCount(1, { timeout: 30_000 });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
  }
}

for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }] as const) {
  test(`bundle builder: sizes, same-drawing defaults, a piece's own drawing, thumbnails, basket + reopen (${vp.name})`, async ({ page }) => {
    test.setTimeout(420_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const bundle = (await shopCatalogue()).find((p) => p.key === 'christmasBundle')!;
    const price = (n: number) => bundle.variants.find((v) => v.attributes.size?.includes(String(n)))!.pricePence;
    await quietCookies(page);
    await signInByEmailLink(page, testEmail('t2-bundle'), '/start-creating');
    await uploadAndOpenRange(page, await drawing('#C8402A'));
    await rangeReady(page);
    const a = await waitForAsset(page);

    await goClient(page, '/customize/christmasBundle');
    await expect(page.getByRole('heading', { level: 1, name: 'christmas family bundle' })).toBeVisible({ timeout: 30_000 });

    // 1 · how many: 2 / 4 / 8 at the catalogue's prices; the steps follow the size
    const sizes = page.getByRole('radiogroup', { name: 'how many of each' }).getByRole('radio');
    await expect(sizes).toHaveCount(3);
    await expect(sizes.nth(0)).toHaveAttribute('aria-checked', 'true');
    for (const [i, n] of [[0, 2], [1, 4], [2, 8]] as const) {
      await sizes.nth(i).click();
      await expect(sizes.nth(i)).toHaveAttribute('aria-checked', 'true');
      await expect(sizes.nth(i)).toContainText(`a set for ${n}`);
      await expect(sizes.nth(i)).toContainText(gbp(price(n)));
      await expect(priceSticker(page)).toHaveText(gbp(price(n)));
      await expect(page.getByText(`one design on all ${n} placemats`)).toBeVisible();
      await expect(page.getByText(`one design on all ${n} coasters`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'the ornaments' }).getByRole('listitem')).toHaveCount(n);
      await expect(page.getByRole('button', { name: new RegExp(`^add to basket · ${gbp(price(n))}$`) })).toBeVisible();
    }
    await sizes.nth(0).click();

    // 2–4 · the drawing in progress is on the table; the coasters + ornaments wear it until given their own
    await expect(piece(page, /^edit the placemats’ design$/)).toBeVisible();
    await expect(piece(page, /^the coasters wear the placemats’ design/)).toBeVisible();
    await expect(piece(page, /^ornament 1 wears the placemats’ design/)).toBeVisible();
    await expect(piece(page, /^ornament 2 wears the placemats’ design/)).toBeVisible();
    await thumbsReady(page, [/^edit the placemats’ design$/, /^the coasters wear/, /^ornament 1 wears/, /^ornament 2 wears/]);
    await expect(page.getByRole('img', { name: /^your set for 2:/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('status').filter({ hasText: /^(every piece is print-ready|print-ready — a little soft up close)$/ })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/bundle-${vp.name}-defaults.jpg`, type: 'jpeg', quality: 55 });

    // ornament 2 gets its OWN drawing — uploaded into the keepsake box from the picker
    await piece(page, /^ornament 2 wears the placemats’ design/).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('pick a drawing for ornament 2')).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), sheet.getByRole('button', { name: /upload to keepsake/ }).click()]);
    await chooser.setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: await drawing('#2F5DA8') });
    await expect(sheet.getByRole('list').locator('li')).toHaveCount(2, { timeout: 90_000 });
    await sheet.getByRole('list').locator('li').filter({ hasNotText: 'this drawing' }).getByRole('button').first().click();
    await sheet.getByRole('button', { name: 'use it for ornament 2' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(piece(page, /^edit ornament 2’s design$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ornament 2: use the placemats’ design' })).toBeVisible();
    // ornament 1 still wears the placemats'
    await expect(piece(page, /^ornament 1 wears the placemats’ design/)).toBeVisible();

    // thumbnails stay put (the keepsake box reloads behind them): every slot keeps a loaded picture
    const srcs = async () => Promise.all([/^edit the placemats’ design$/, /^the coasters wear/, /^ornament 1 wears/, /^edit ornament 2’s design$/].map((n) => thumbOf(page, n).getAttribute('src')));
    await thumbsReady(page, [/^edit the placemats’ design$/, /^the coasters wear/, /^ornament 1 wears/, /^edit ornament 2’s design$/]);
    const s1 = await srcs();
    expect(s1[3], 'ornament 2 shows a different picture from the placemats').not.toBe(s1[0]);
    await page.waitForTimeout(4000);
    expect(await srcs(), 'slot thumbnails stay put').toEqual(s1);
    await page.screenshot({ path: `${SHOTS}/bundle-${vp.name}-own-ornament.jpg`, type: 'jpeg', quality: 55 });

    // the coasters' undo exists only once they have their own; ornament 2's undo puts the placemats' back
    await page.getByRole('button', { name: 'ornament 2: use the placemats’ design' }).click();
    await expect(piece(page, /^ornament 2 wears the placemats’ design/)).toBeVisible();
    await piece(page, /^ornament 2 wears the placemats’ design/).click();
    await sheet.getByRole('list').locator('li').filter({ hasNotText: 'this drawing' }).getByRole('button').first().click();
    await sheet.getByRole('button', { name: 'use it for ornament 2' }).click();
    await expect(piece(page, /^edit ornament 2’s design$/)).toBeVisible();

    // basket: ONE line at the size's price, the placemats' drawing on the table, ornament 2's own
    await page.getByRole('button', { name: new RegExp(`^add to basket · ${gbp(price(2))}$`) }).click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
    const lines = await basketLines(page);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.product).toBe('christmasBundle');
    expect(line.qty).toBe(1);
    expect(line.pricePence).toBe(price(2));
    expect(line.bundle!.placemat.assetId).toBe(a);
    expect(line.bundle!.coaster, 'the coasters wear the placemats’ (null)').toBeNull();
    expect(line.bundle!.ornaments.map((o) => o.assetId === a)).toEqual([true, false]);

    // reopen from the basket: the same set comes back, "update basket"
    await goClient(page, `/customize/christmasBundle?edit=${encodeURIComponent(line.id)}`);
    await expect(page.getByRole('button', { name: new RegExp(`^update basket · ${gbp(price(2))}$`) })).toBeVisible({ timeout: 30_000 });
    await expect(piece(page, /^ornament 1 wears the placemats’ design/)).toBeVisible();
    await expect(piece(page, /^edit ornament 2’s design$/)).toBeVisible();
    await thumbsReady(page, [/^edit the placemats’ design$/, /^edit ornament 2’s design$/]);

    // change it to a set for 4 → update: the same line, 4 ornaments (2 wears its own; 3 + 4 the placemats')
    await sizes.nth(1).click();
    await expect(page.getByRole('list', { name: 'the ornaments' }).getByRole('listitem')).toHaveCount(4);
    await page.getByRole('button', { name: new RegExp(`^update basket · ${gbp(price(4))}$`) }).click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
    const after = await basketLines(page);
    expect(after).toHaveLength(1);
    expect(after[0]!.pricePence).toBe(price(4));
    expect(after[0]!.sku).toBe(bundle.variants.find((v) => v.attributes.size?.includes('4'))!.sku);
    expect(after[0]!.bundle!.ornaments.map((o) => o.assetId === a)).toEqual([true, false, true, true]);
  });
}
