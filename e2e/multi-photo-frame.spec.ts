import { test, expect } from './test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { signInByEmailLink, sql, testEmail } from './harness';
import { basketLines, goClient, rangeReady, waitForAsset } from './shop-db';

/**
 * The MULTI PHOTO FRAME (5 Nov 2026): the drawing in progress fills every square → one square gets its
 * OWN drawing, uploaded into the keepsake box from the card-pack picker → frame colour + size → ONE
 * basket line carrying a drawing per square → reopen it from the basket → checkout at the SERVER's
 * price. The frame is hidden until the founder's photos are in, so this test puts it on show for its
 * own run (Playwright runs one test at a time here) and hides it again.
 */
async function drawing(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect x="200" y="150" width="1200" height="900" rx="160" fill="${fill}"/></svg>`;
  return sharp({ create: { width: 1600, height: 1200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

type FrameLine = { product: string; sku?: string; qty: number; pricePence: number; sub?: string; slots?: Array<{ assetId: string }> };

test('multi photo frame: one drawing in every square → a square of its own from the keepsake box → the four sizes, both ways up → black, 12×12″ → basket → reopen → £62', async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await sql()`update products set visible_in_shop = true where key = 'multiPhotoFrame'`;
  try {
    await quietCookies(page);
    await signInByEmailLink(page, testEmail('mpf'), '/start-creating');
    await uploadAndOpenRange(page, await drawing('#C8402A'));
    await rangeReady(page);
    const main = await waitForAsset(page);

    // the frame's tile opens its builder (a drawing per square — never a quick-add of a blank frame)
    const tile = page.getByRole('button', { name: 'customize multi photo frame', exact: true });
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    await expect(page).toHaveURL(/\/customize\/multiPhotoFrame/);
    await expect(page.getByRole('heading', { level: 1, name: 'multi photo frame' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('group', { name: 'frame size' }).getByRole('button', { pressed: true })).toContainText('12×12″ · 9 drawings · £62');
    await expect(page.getByRole('group', { name: 'frame colour' }).getByRole('button', { pressed: true })).toHaveText('gold');

    // the drawing you came with is square 1; the other eight repeat it — a whole frame already
    await expect(page.getByText('1 of 9 chosen')).toBeVisible();
    await expect(page.getByRole('button', { name: /^square 1: this drawing/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(8);
    await expect(page.getByRole('img', { name: /^your 12×12″ frame in gold: 9 squares, 1 chosen/ })).toBeVisible();

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
    await expect(page.getByText('2 of 9 chosen')).toBeVisible();
    await expect(page.getByRole('button', { name: /^square 4: (?!repeats).*swap it$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(7);
    await expect(page.getByRole('button', { name: /too small to print/ })).toHaveCount(0);

    // the 16×16″ keeps the same picks (16 squares, 2 chosen); back to the 12×12″ in black
    const sizes = page.getByRole('group', { name: 'frame size' });
    await expect(sizes.getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('group', { name: 'which way it hangs' })).toHaveCount(0); // a square frame hangs one way
    await sizes.getByRole('button', { name: /^16×16″/ }).click();
    await expect(page.getByText('2 of 16 chosen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'add to basket · £80' })).toBeVisible();
    // the big ones: 20×30″, 40 squares, landscape (Prodigi's own layout) or portrait
    await expect(sizes.getByRole('button', { name: /^20×30″/ })).toContainText('20×30″ · 40 drawings · £102');
    await expect(sizes.getByRole('button', { name: /^16×24″/ })).toContainText('16×24″ · 24 drawings · £87');
    await sizes.getByRole('button', { name: /^20×30″/ }).click();
    const hangs = page.getByRole('group', { name: 'which way it hangs' });
    await expect(hangs.getByRole('button', { pressed: true })).toHaveText('landscape · 8 across, 5 down');
    await expect(page.getByText('2 of 40 chosen')).toBeVisible();
    await expect(page.getByRole('button', { name: /: repeats this drawing/ })).toHaveCount(38);
    await expect(page.getByRole('img', { name: /^your 20×30″ landscape frame in gold: 40 squares, 2 chosen/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'add to basket · £102' })).toBeVisible();
    await hangs.getByRole('button', { name: /^portrait/ }).click();
    await expect(hangs.getByRole('button', { pressed: true })).toHaveText('portrait · 5 across, 8 down');
    await expect(page.getByRole('img', { name: /^your 20×30″ portrait frame in gold: 40 squares/ })).toBeVisible();
    await sizes.getByRole('button', { name: /^12×12″/ }).click();
    await page.getByRole('group', { name: 'frame colour' }).getByRole('button', { name: 'black' }).click();
    await expect(page.getByRole('group', { name: 'frame colour' }).getByRole('button', { name: 'black' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: /^your 12×12″ frame in black: 9 squares, 2 chosen/ })).toBeVisible();

    // ONE line: the black 12×12″, a drawing per square (square 4 its own, the rest the main drawing)
    await page.getByRole('button', { name: 'add to basket · £62' }).click();
    await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });
    const lines = (await basketLines(page)) as FrameLine[];
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect([line.product, line.qty, line.pricePence, line.sub]).toEqual(['multiPhotoFrame', 1, 6200, '12×12″ · black frame · 2 drawings']);
    expect(line.slots!.map((s) => s.assetId === main)).toEqual([true, true, true, false, true, true, true, true, true]);
    const [variant] = await sql()<{ attributes: Record<string, string> }[]>`select attributes from product_variants where sku = ${line.sku!}`;
    expect(variant!.attributes).toEqual({ size: '12×12″', colour: 'black' });

    // reopen from the basket: the same frame comes back, "update basket" — every square as it prints
    // (the line holds what prints, like the calendar's pages: the repeats are now picks of their own)
    const id = (lines[0] as unknown as { id: string }).id;
    await goClient(page, `/customize/multiPhotoFrame?edit=${encodeURIComponent(id)}`);
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
  } finally {
    await sql()`update products set visible_in_shop = false where key = 'multiPhotoFrame'`;
  }
});
