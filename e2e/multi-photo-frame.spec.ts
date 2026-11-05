import { test, expect } from './test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { signInByEmailLink, sql, testEmail } from './harness';
import { basketLines, goClient, rangeReady, waitForAsset } from './shop-db';

/**
 * The MULTI PHOTO FRAME (founder, 5 Nov): in the range as the 6 × 4 in gold → its builder shows the
 * founder's frame photo with the drawing in progress in every square → one square gets its OWN drawing,
 * uploaded into the keepsake box from the card-pack picker → the three frames (9 / 24 / 60 drawings) →
 * the 3 × 3 in black → ONE basket line carrying a drawing per square → reopen it → checkout at the
 * SERVER's price.
 */
async function drawing(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect x="200" y="150" width="1200" height="900" rx="160" fill="${fill}"/></svg>`;
  return sharp({ create: { width: 1600, height: 1200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

type FrameLine = { id: string; product: string; sku?: string; qty: number; pricePence: number; sub?: string; slots?: Array<{ assetId: string }> };

test('multi photo frame: the 6 × 4 from the range → the real frame photo → a square of its own from the keepsake box → 9 / 24 / 60 → the 3 × 3 in black → basket → reopen → £62', async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await quietCookies(page);
  await signInByEmailLink(page, testEmail('mpf'), '/start-creating');
  await uploadAndOpenRange(page, await drawing('#C8402A'));
  await rangeReady(page);
  const main = await waitForAsset(page);

  // on show, high in the range; its tile opens the builder (never a quick-add of a blank frame)
  const tile = page.getByRole('button', { name: 'customize multi photo frame', exact: true });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(page).toHaveURL(/\/customize\/multiPhotoFrame/);
  await expect(page.getByRole('heading', { level: 1, name: 'multi photo frame' })).toBeVisible({ timeout: 30_000 });
  const sizes = page.getByRole('group', { name: 'frame size' });
  await expect(sizes.getByRole('button')).toHaveCount(3);
  await expect(sizes.getByRole('button', { pressed: true })).toContainText('24 drawings · £87'); // the 6 × 4 leads
  await expect(page.getByRole('group', { name: 'frame colour' }).getByRole('button', { pressed: true })).toHaveText('gold');
  await expect(page.getByRole('group', { name: 'which way it hangs' })).toHaveCount(0); // landscape, as the photos are

  // the drawing you came with is square 1; the other 23 repeat it — a whole frame already, shown on the
  // founder's frame photo (composed server-side from the PSD layers — not the drawn stand-in)
  await expect(page.getByText('1 of 24 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^square 1: this drawing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(23);
  await expect(page.getByRole('img', { name: /^your 16×24″ landscape frame in gold: 24 squares, 1 chosen/ })).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

  // square 4 gets its OWN drawing — uploaded into the keepsake box from the picker (as card packs do)
  await page.getByRole('button', { name: /^square 4: repeats this drawing/ }).click();
  const sheet = page.getByRole('dialog', { name: 'pick a drawing for square 4' });
  await expect(sheet).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), sheet.getByRole('button', { name: /upload to keepsake/ }).click()]);
  await chooser.setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: await drawing('#2F5DA8') });
  await expect(sheet.getByRole('list').locator('li')).toHaveCount(2, { timeout: 90_000 });
  await sheet.getByRole('list').locator('li').filter({ hasNotText: 'this drawing' }).getByRole('button').first().click();
  await sheet.getByRole('button', { name: 'put it in square 4' }).click();
  // it steps on to the next empty square — close it there
  await expect(page.getByRole('dialog', { name: 'pick a drawing for square 5' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('2 of 24 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^square 4: (?!repeats).*swap it$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(22);
  await expect(page.getByRole('button', { name: /too small to print/ })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^your 16×24″ landscape frame in gold: 24 squares, 2 chosen/ })).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

  // the 10 × 6 keeps the same picks (60 squares, 2 chosen); then the 3 × 3 in black
  await expect(sizes.getByRole('button', { name: /^60 drawings/ })).toContainText('60 drawings · £125');
  await sizes.getByRole('button', { name: /^60 drawings/ }).click();
  await expect(page.getByText('2 of 60 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(58);
  await expect(page.getByRole('button', { name: 'add to basket · £125' })).toBeVisible();
  await sizes.getByRole('button', { name: /^9 drawings/ }).click();
  await page.getByRole('group', { name: 'frame colour' }).getByRole('button', { name: 'black' }).click();
  await expect(page.getByRole('group', { name: 'frame colour' }).getByRole('button', { name: 'black' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: /^your 12×12″ frame in black: 9 squares, 2 chosen/ })).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

  // ONE line: the black 3 × 3, a drawing per square (square 4 its own, the rest the main drawing)
  await page.getByRole('button', { name: 'add to basket · £62' }).click();
  await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
  const lines = (await basketLines(page)) as unknown as FrameLine[];
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  expect([line.product, line.qty, line.pricePence, line.sub]).toEqual(['multiPhotoFrame', 1, 6200, '12×12″ · black frame · 2 drawings']);
  expect(line.slots!.map((s) => s.assetId === main)).toEqual([true, true, true, false, true, true, true, true, true]);
  const [variant] = await sql()<{ attributes: Record<string, string> }[]>`select attributes from product_variants where sku = ${line.sku!}`;
  expect(variant!.attributes).toEqual({ size: '12×12″', colour: 'black' });

  // reopen from the basket: the same frame comes back, "update basket" — every square as it prints
  // (the line holds what prints, like the calendar's pages: the repeats are now picks of their own)
  await goClient(page, `/customize/multiPhotoFrame?edit=${encodeURIComponent(line.id)}`);
  await expect(page.getByRole('button', { name: 'update basket · £62' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('9 of 9 chosen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^square 4: (?!this drawing).*swap it$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^square \d: this drawing, .*swap it$/ })).toHaveCount(8);
  await expect(page.getByRole('group', { name: 'frame colour' }).getByRole('button', { name: 'black' })).toHaveAttribute('aria-pressed', 'true');

  // checkout: priced by the SERVER, not the basket's display figure
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('multi photo frame', { exact: true })).toBeVisible();
  const summary = page.locator('dl').first();
  await expect(summary.locator('xpath=.//dt[normalize-space()="Subtotal"]/following-sibling::dd[1]')).toHaveText('£62');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
