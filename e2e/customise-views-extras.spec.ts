import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { basketLines, gbp, goClient, optionGroup, rangeReady, shopCatalogue, waitForAsset } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): every PREVIEW VIEW on the customize page renders the drawing (front +
 * back, the mug's three sides, the card's views, the jigsaw's tin, the cushion's shapes and backs), and
 * the per-product EXTRAS reach the basket: the cushion back (single ↔ double-sided price), the base
 * colour of an edge-to-edge product, and the card's outside span + inside message.
 */
const SHOTS = 'reports/test-sweep-2026-10-29/shots/02';
type Compose = { variantId: string; ok: boolean; view?: string; fill?: string; ground?: string; spanHalf?: string };

function trackComposes(page: Page): Compose[] {
  const seen: Compose[] = [];
  page.on('response', async (res) => {
    if (!res.url().endsWith('/api/mockup') || res.request().method() !== 'POST') return;
    try {
      const b = JSON.parse(res.request().postData() ?? '{}') as Compose;
      const json = (await res.json()) as { ok: boolean };
      seen.push({ variantId: b.variantId, ok: json.ok, view: b.view, fill: b.fill, ground: b.ground, spanHalf: b.spanHalf });
    } catch {
      /* superseded */
    }
  });
  return seen;
}
const composed = (seen: Compose[], pred: (c: Compose) => boolean, message: string) =>
  expect.poll(() => seen.some((c) => c.ok && pred(c)), { message, timeout: 60_000 }).toBe(true);
const addBtn = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });

async function ready(page: Page) {
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  return waitForAsset(page);
}
async function open(page: Page, key: string, label: string) {
  await goClient(page, `/customize/${key}`);
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible({ timeout: 30_000 });
}

for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }] as const) {
  test(`every preview view renders the drawing (${vp.name})`, async ({ page }) => {
    test.setTimeout(600_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const seen = trackComposes(page);
    const log: string[] = [];
    await ready(page);

    // the front / the back: the ornament + the sack (unprinted back = white fill), the bauble (printed both sides)
    for (const [key, label] of [['ceramicOrnament', 'ceramic christmas ornament'], ['christmasBauble', 'christmas bauble'], ['sack', 'christmas sack']] as const) {
      await open(page, key, label);
      await page.getByRole('button', { name: 'show the back' }).click();
      await composed(seen, (c) => c.view === 'back', `${key}: the back composed`);
      await page.screenshot({ path: `${SHOTS}/view-${vp.name}-${key}-back.jpg`, type: 'jpeg', quality: 55 });
      await page.getByRole('button', { name: 'show the front' }).click();
      await expect(page.getByRole('button', { name: 'show the front' })).toHaveAttribute('aria-pressed', 'true');
      log.push(`${key}: front + back composed`);
    }
    // the placemat's back is the founder's photo of the cork underside, as authored
    await open(page, 'placemat', 'placemats');
    const still = page.waitForResponse((r) => r.url().includes('/api/mockup/still') && r.url().includes('view=back'));
    await page.getByRole('button', { name: 'show the back' }).click();
    const sr = await still;
    log.push(`placemat back: /api/mockup/still → ${sr.status()}`);
    expect(sr.status(), 'placemat back photo').toBe(200);
    await expect(page.getByRole('img', { name: /the back of the placemat/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/view-${vp.name}-placemat-back.jpg`, type: 'jpeg', quality: 55 });

    // the mug's three sides
    await open(page, 'mug', 'mug');
    for (const side of ['front', 'back', 'centre'] as const) {
      await page.getByRole('group', { name: 'mug view' }).getByRole('button', { name: `the ${side}` }).click();
      await composed(seen, (c) => c.view === side, `mug ${side}`);
    }
    log.push('mug: centre / front / back composed');

    // the jigsaw: the puzzle + the keepsake tin
    await open(page, 'jigsaw', 'jigsaw');
    await page.getByRole('button', { name: 'the tin', exact: true }).click();
    await composed(seen, (c) => c.view === 'tin', 'jigsaw tin');
    await page.getByRole('button', { name: 'the puzzle', exact: true }).click();
    log.push('jigsaw: puzzle + tin composed');

    // the card: single, the outside (front only / full width)
    await open(page, 'card', 'greetings card');
    await page.getByRole('button', { name: 'outside of the card' }).click();
    await composed(seen, (c) => c.view === 'outside-front', 'card outside (front only)');
    await page.getByRole('button', { name: 'full width', exact: true }).click();
    await composed(seen, (c) => c.view === 'outside-full', 'card outside (full width)');
    await page.getByRole('button', { name: 'single card' }).click();
    await composed(seen, (c) => !c.view && c.spanHalf === 'front', 'closed card, full-width design: its front half');
    await page.getByRole('button', { name: 'front only', exact: true }).click();
    log.push('card: single / outside front-only / outside full-width composed');

    // the cushion: each shape, and on a square, every back (white = single-sided; a colour or both sides = double)
    const cushion = (await shopCatalogue()).find((p) => p.key === 'cushion')!;
    await open(page, 'cushion', 'cushion');
    for (const shape of ['heart', 'round', 'square'] as const) {
      await page.getByRole('button', { name: `${shape} cushion` }).click();
      await page.getByRole('button', { name: 'show the back' }).click();
      await composed(seen, (c) => !!c.fill, `cushion ${shape}: back composed`);
      await page.getByRole('button', { name: 'show the front' }).click();
    }
    await optionGroup(page, 'Size').getByRole('button', { name: '12″ square' }).click();
    const sq = (sides: string) => cushion.variants.find((v) => v.attributes.size === '12″ square' && v.attributes.sides === sides)!;
    await expect(page.getByText('white back · single-sided')).toBeVisible();
    await expect(addBtn(page)).toHaveText(new RegExp(`${gbp(sq('single').pricePence)}$`));
    const backs = page.getByRole('button', { name: /^(?!show the ).+ back$/ });
    const nBacks = await backs.count();
    expect(nBacks, 'cushion back swatches').toBeGreaterThan(1);
    for (let i = 0; i < nBacks; i++) {
      const name = (await backs.nth(i).getAttribute('aria-label'))!;
      await backs.nth(i).click();
      const dbl = name !== 'white back';
      await expect(addBtn(page), `${name}: price`).toHaveText(new RegExp(`${gbp(sq(dbl ? 'double' : 'single').pricePence)}$`));
      await composed(seen, (c) => c.variantId === sq(dbl ? 'double' : 'single').id && !!c.fill, `${name}: back composed`);
    }
    await page.getByRole('button', { name: 'image both sides' }).click();
    await expect(page.getByText('your image, printed on both sides · double-sided')).toBeVisible();
    await expect(addBtn(page)).toHaveText(new RegExp(`${gbp(sq('double').pricePence)}$`));
    log.push(`cushion: 3 shapes' backs + ${nBacks} back colours + both sides; single/double prices`);
    writeFileSync(`${SHOTS}/views-${vp.name}.json`, JSON.stringify(log, null, 1));
  });
}

test('extras reach the basket: cushion back, base colour, card span + message — and come back on reopen', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const seen = trackComposes(page);
  await ready(page);

  // cushion: a 12″ square, image on both sides → the DUAL sku, back 'both'
  await open(page, 'cushion', 'cushion');
  await optionGroup(page, 'Size').getByRole('button', { name: '12″ square' }).click();
  await page.getByRole('button', { name: 'image both sides' }).click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  let line = (await basketLines(page)).find((l) => l.product === 'cushion')!;
  expect(line.sku).toMatch(/double/);
  expect(line.back).toBeTruthy();
  expect(line.sub).toContain('both sides');

  // socks: a base colour typed as a code → the compose and the line carry it
  await open(page, 'socks', 'socks');
  await page.getByRole('button', { name: /sock colour: white/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('#2f5da8');
  await dialog.getByRole('button', { name: 'use this colour' }).click();
  await composed(seen, (c) => c.ground === '#2f5da8', 'socks on #2f5da8');
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  line = (await basketLines(page)).find((l) => l.product === 'socks')!;
  expect(line.ground).toBe('#2f5da8');
  // reopen → the colour comes back
  await goClient(page, `/customize/socks?edit=${encodeURIComponent(line.id)}`);
  await expect(page.getByRole('button', { name: /sock colour: /i })).not.toHaveText(/white/, { timeout: 30_000 });
  await composed(seen, (c) => c.ground === '#2f5da8', 'reopened socks on #2f5da8');

  // card: full width + a message
  await open(page, 'card', 'greetings card');
  await page.getByRole('button', { name: 'full width', exact: true }).click();
  await page.getByRole('button', { name: 'add a message', exact: true }).click();
  await page.getByPlaceholder('Happy Birthday!').fill('Merry Christmas Gran');
  await page.getByPlaceholder('love, Mabel x').fill('love from us x');
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const card = (await basketLines(page)).find((l) => l.product === 'card')! as unknown as { id: string; message?: { greeting: string; signature: string }; cardImageSpan?: string; sub?: string };
  expect(card.message?.greeting).toBe('Merry Christmas Gran');
  expect(card.cardImageSpan).toBe('full');
  expect(card.sub).toContain('with a message');
});

// 02-B3: a card line's inside message + outside span are NOT re-seeded when the line is reopened from the
// basket (the ?edit seed copies size/colour/back/ground into the selection but not message /
// cardImageSpan — src/app/customize/[productKey]/page.tsx:178-186). The page shows whatever card was
// customised LAST in this tab, so "update basket" on an older card silently swaps its message.
// CONFIRMED 29 Oct: the reopened "for Gran" card showed "leave it blank" + "front only"; "update basket"
// then folded it into the blank card — 2 cards became 1 and the message was gone (B3-card-reopen.json).
// Fixed: the seed brings back the line's message + span too (selectionForLine, src/lib/basket-line.ts).
test('02-B3: reopening a card from the basket brings back ITS message and span', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  // card 1: full width + "for Gran"
  await open(page, 'card', 'greetings card');
  await page.getByRole('button', { name: 'full width', exact: true }).click();
  await page.getByRole('button', { name: 'add a message', exact: true }).click();
  await page.getByPlaceholder('Happy Birthday!').fill('for Gran');
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  // card 2 (same drawing): front only, left blank
  await open(page, 'card', 'greetings card');
  await page.getByRole('button', { name: 'front only', exact: true }).click();
  await page.getByRole('button', { name: 'leave it blank', exact: true }).click();
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const cards = (await basketLines(page)).filter((l) => l.product === 'card') as unknown as Array<{ id: string; message?: { greeting: string }; cardImageSpan?: string }>;
  expect(cards).toHaveLength(2);
  const gran = cards.find((c) => c.message?.greeting === 'for Gran')!;
  // reopen card 1
  await goClient(page, `/customize/card?edit=${encodeURIComponent(gran.id)}`);
  await expect(addBtn(page)).toHaveText(/update basket/, { timeout: 30_000 });
  const shows = {
    message: await page.getByRole('button', { name: 'add a message', exact: true }).getAttribute('aria-pressed'),
    full: await page.getByRole('button', { name: 'full width', exact: true }).getAttribute('aria-pressed'),
  };
  // and what "update basket" would do to it
  await addBtn(page).click();
  await expect(page).toHaveURL(/\/start-creating/);
  const after = (await basketLines(page)).filter((l) => l.product === 'card') as unknown as Array<{ message?: { greeting: string }; cardImageSpan?: string }>;
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/B3-card-reopen.json`, JSON.stringify({ reopenedShows: shows, before: cards, after }, null, 1));
  test.info().annotations.push({ type: '02-B3', description: JSON.stringify({ shows, after }) });
  expect.soft(shows.message, 'reopened card shows its message').toBe('true');
  expect.soft(shows.full, 'reopened card shows full width').toBe('true');
  expect(after.some((c) => c.message?.greeting === 'for Gran'), 'the message survives "update basket"').toBe(true);
});
