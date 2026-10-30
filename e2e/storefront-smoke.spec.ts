import { test, expect, type Locator, type Page } from './test';
import sharp from 'sharp';

/**
 * Storefront coherence smoke (all LIVE products in one journey).
 *
 * After the mug + catalogue churn, this walks the whole shop the way a shopper does and
 * asserts the three things that must never quietly regress:
 *   1. RENDER  — every live tile composes a REAL in-VPC mockup (a loaded <img>, not the
 *                calm oat block), and so does each product's customize page — so a missing
 *                template / broken seed shows up here.
 *   2. ORDERING — every live product adds to the basket via its customize page (the real
 *                path: the Start-Creating range has no direct "add", only "+ customize").
 *   3. PRICING  — the checkout Subtotal/Total come from the SERVER re-price and equal the
 *                sum of the live default prices (no client-trusted total, no phantom saving
 *                for a plain guest basket).
 *
 * The live set + default prices are asserted explicitly so a price change (or a product
 * silently dropping out of `visibleInShop`) fails loudly and on purpose. Navigation is
 * click-driven (SPA): the uploaded asset lives in an in-memory store, so a full page.goto
 * would drop it — only the basket persists (sessionStorage), which is why checkout uses goto.
 */

const LIVE = [
  { key: 'framedPrint', label: 'framed print', pence: 6500 },
  { key: 'cushion', label: 'cushion', pence: 2200 },
  { key: 'mug', label: 'mug', pence: 1800 },
  { key: 'jigsaw', label: 'jigsaw', pence: 2600 },
  { key: 'blanket', label: 'fleece blanket', pence: 6000 },
  { key: 'card', label: 'greetings card', pence: 550 },
  // the range expansion, live 2026-10-21 (card packs have their own builder spec)
  { key: 'socks', label: 'socks', pence: 2000 },
  { key: 'heightChart', label: 'height chart', pence: 3100 },
  { key: 'wrappingPaper', label: 'wrapping paper', pence: 2300 },
  { key: 'teaTowel', label: 'tea towel', pence: 2700 },
  { key: 'playingCards', label: 'playing cards', pence: 2400 },
] as const;

const SUBTOTAL = LIVE.reduce((s, p) => s + p.pence, 0); // 34550

// Mirror the app's formatPence EXACTLY: whole pounds have no decimals (£65, not £65.00).
const gbp = (pence: number) => {
  const pounds = Math.abs(pence) / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
};

/** A realistic multi-hundred-KB artwork so the ingest + compositor path is exercised
 * honestly (a 1×1 PNG masks the real render/DPI code — the founder's large-file rule). */
async function artwork(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">
    <rect x="280" y="280" width="1440" height="1440" rx="140" fill="#C8623A"/>
    <circle cx="1000" cy="860" r="360" fill="#84BBD0"/>
    <rect x="640" y="1180" width="720" height="360" rx="60" fill="#93B97C"/>
  </svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 251, g: 245, b: 233, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

/** Wait for a MockupPreview <img> to actually LOAD (naturalWidth>0) — proof the in-VPC
 * compositor produced pixels rather than resting on the oat block. */
async function expectComposed(img: Locator, label: string) {
  await expect(img, `${label}: mockup image visible`).toBeVisible({ timeout: 45_000 });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 45_000,
      message: `${label}: mockup image actually loaded`,
    })
    .toBeGreaterThan(0);
}

async function uploadAndOpenRange(page: Page, art: Buffer) {
  await page.goto('/start-creating');
  await expect(page.locator('input[type="checkbox"]'), 'consent is action-based — no tickbox').toHaveCount(0);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /upload a drawing/i }).click(),
  ]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: art });
  await expect(page.getByRole('heading', { name: /your masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
}

test('storefront: every live product renders, adds, and prices to the server total', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await uploadAndOpenRange(page, await artwork());

  // ── 1: each live tile is present and composes a real mockup on the range ──────────────
  for (const p of LIVE) {
    const tile = page.getByRole('button', { name: `customize ${p.label}`, exact: true });
    await expect(tile, `${p.key}: tile present`).toBeVisible();
    await tile.scrollIntoViewIfNeeded();
    await expectComposed(page.locator(`img[alt="your drawing on a ${p.key}"]`).first(), `range/${p.key}`);
  }

  // ── 2: add each via its customize page (the real add path) — deep render + price check ─
  for (const p of LIVE) {
    await page.getByRole('button', { name: `customize ${p.label}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/customize/${p.key}(\\?|$)`));

    await expectComposed(page.locator(`img[alt="your drawing on a ${p.key}"]`).first(), `customize/${p.key}`);

    const addBtn = page.getByRole('button', { name: /add to basket/ });
    await expect(addBtn, `${p.key}: add button`).toBeVisible();
    await expect(addBtn, `${p.key}: add button shows the right price`).toContainText(gbp(p.pence));
    await addBtn.click();

    // customize returns to the range after adding
    await expect(page).toHaveURL(/\/start-creating/);
  }

  await expect(page.getByText(`${LIVE.length} items added to your basket`)).toBeVisible({ timeout: 30_000 });

  // ── 3: checkout Subtotal/Total from the SERVER re-price ───────────────────────────────
  await page.goto('/checkout'); // basket persists via sessionStorage
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  const summary = page.locator('dl').first();
  const rowValue = (label: string) =>
    summary.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::dd[1]`);
  // Subtotal = sum of live defaults; delivery free ⇒ Total == Subtotal. No 5% saving for a
  // plain guest basket (no server-side join/set context).
  await expect(rowValue('Subtotal'), 'server subtotal').toHaveText(gbp(SUBTOTAL));
  await expect(rowValue('Total'), 'server total').toHaveText(gbp(SUBTOTAL));

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
