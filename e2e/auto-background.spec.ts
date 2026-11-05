import sharp from 'sharp';
import { test, expect, type Page, type Request } from './test';
import { customizeReady, quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, goClient, optionGroup, pressedIn, rangeReady, shopCatalogue, waitForAsset, walkRange } from './shop-db';

/**
 * The drawing's own background colour (founder, 5 Nov): on the height chart, socks, tea towel and wrapping paper
 * the printable area behind the drawing defaults to the colour of the paper it was drawn on — on the range tile,
 * the quick add, the customise page and the basket line — and the colour wheel can still change it. A tee
 * defaults to the shirt colour in Prodigi's range nearest that paper. The height chart is the last tile.
 * Checked on the preview requests themselves, so it holds whether or not this machine has the product photos.
 */
const HONEY = '#f6c445';
const NAVY = '#26334f';
const AUTO = ['heightChart', 'socks', 'teaTowel', 'wrappingPaper'];

/** A drawing (shapes, never a child's art) on honey-coloured paper. */
async function honeyArt(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">
    <circle cx="1000" cy="900" r="420" fill="#2f5da8"/><rect x="560" y="1250" width="880" height="320" rx="80" fill="#c8402a"/>
  </svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: HONEY } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

type Body = { variantId: string; size?: string; ground?: string; assetId?: string };
function record(page: Page): Body[] {
  const bodies: Body[] = [];
  page.on('request', (r: Request) => {
    if (r.method() !== 'POST') return;
    if (r.url().endsWith('/api/mockup')) bodies.push(r.postDataJSON());
    else if (r.url().endsWith('/api/mockup/batch')) bodies.push(...((r.postDataJSON() as { items: Body[] }).items)); // the range's prefetch
  });
  return bodies;
}

test('a drawing on honey paper: the height chart + the repeats default to honey, the tee to ochre, and both stay editable', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shop = await shopCatalogue();
  const keyOf = new Map(shop.flatMap((p) => p.variants.map((v) => [v.id, p.key] as const)));
  const colourOf = new Map(shop.flatMap((p) => p.variants.map((v) => [v.id, v.attributes.colour] as const)));
  const bodies = record(page);

  await quietCookies(page);
  await uploadAndOpenRange(page, await honeyArt());
  await rangeReady(page);
  const assetId = await waitForAsset(page);
  // the colour is measured in the browser and kept with the drawing
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_upload') ?? 'null')?.state?.upload?.bg)).toBe(HONEY);

  // the RANGE (walked to its end — its pictures are asked for as the tiles come near): each of the four is
  // asked for on honey — and never on white first (the tile waits a beat)
  await walkRange(page);
  const thumbs = () => bodies.filter((b) => b.size === 'thumb' && b.assetId === assetId);
  for (const k of AUTO.filter((k) => keyOf.size === 0 || [...keyOf.values()].includes(k))) {
    await expect.poll(() => thumbs().filter((b) => keyOf.get(b.variantId) === k && b.ground === HONEY).length, { message: `${k} on honey`, timeout: 60_000 }).toBeGreaterThan(0);
    expect(thumbs().filter((b) => keyOf.get(b.variantId) === k && b.ground !== HONEY), `${k} never drawn on white`).toEqual([]);
  }
  // …the rest stay as they were (a mug has no base colour by default)
  expect(thumbs().filter((b) => keyOf.get(b.variantId) === 'mug').every((b) => !b.ground)).toBe(true);
  // the tee: the nearest of Prodigi's colours to honey
  await expect.poll(() => thumbs().filter((b) => keyOf.get(b.variantId) === 'kidsTee').map((b) => colourOf.get(b.variantId)), { timeout: 60_000 }).toContain('ochre');

  // the height chart is the LAST tile on the range
  const tiles = page.getByRole('button', { name: /^customize / });
  await expect(tiles.last()).toHaveAccessibleName('customize height chart');

  // CUSTOMISE: the socks open on honey, say so, and the wheel still changes it
  await goClient(page, '/customize/socks');
  await expect(page.getByRole('heading', { level: 1, name: 'socks' })).toBeVisible({ timeout: 30_000 });
  await customizeReady(page);
  await expect(page.getByText(/we’ve matched the sock to your paper/)).toBeVisible();
  await page.getByRole('button', { name: /sock colour: /i }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(NAVY);
  await page.getByRole('dialog').getByRole('button', { name: 'use this colour' }).click();
  await expect(page.getByText(/the paper prints too — you’d get paper squares on the/)).toBeVisible();
  await page.getByRole('button', { name: /^(add to basket|update basket) · / }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  expect((await basketLines(page)).find((l) => l.product === 'socks')?.ground).toBe(NAVY);
  // the parent's pick sticks: the socks tile is now drawn on navy
  await rangeReady(page);
  await walkRange(page);
  await expect.poll(() => thumbs().filter((b) => keyOf.get(b.variantId) === 'socks' && b.ground === NAVY).length, { timeout: 60_000 }).toBeGreaterThan(0);

  // the tee's customise page opens on ochre; picking another colour is the parent's own
  await goClient(page, '/customize/kidsTee');
  await expect(page.getByRole('heading', { level: 1, name: 'kids tee' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => pressedIn(page, 'Colour'), { timeout: 30_000 }).toBe('ochre');
  await optionGroup(page, 'Colour').getByRole('button').filter({ hasText: /^white$/ }).first().click();
  await expect.poll(() => pressedIn(page, 'Colour')).toBe('white');

  // the height chart's customise page: honey, into the basket
  await goClient(page, '/customize/heightChart');
  await expect(page.getByRole('heading', { level: 1, name: 'height chart' })).toBeVisible({ timeout: 30_000 });
  await customizeReady(page);
  await page.getByRole('button', { name: /^(add to basket|update basket) · / }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  expect((await basketLines(page)).find((l) => l.product === 'heightChart')?.ground).toBe(HONEY);
  expect(errors).toEqual([]);
});
