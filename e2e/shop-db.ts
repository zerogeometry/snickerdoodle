import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { expect, type Page } from '@playwright/test';

/**
 * The SHOP as the e2e server's own database holds it — so a test checks a customize page against
 * the seeded catalogue (labels, every variant's attributes + price), never against numbers typed
 * into the test. Reads DATABASE_URL from the environment, else from .env (the e2e server's own).
 * Read-only: one SELECT.
 */
export type ShopVariant = { id: string; sku: string; attributes: Record<string, string>; pricePence: number; isDefault: boolean };
export type ShopProduct = { key: string; label: string; variants: ShopVariant[] };

/** Bundle-only packs are never offered on their own (src/lib/christmas-bundle.ts BUNDLE_ONLY_SKUS). */
const BUNDLE_ONLY = new Set(['placemat-packof1', 'placemat-packof2', 'placemat-packof6', 'coaster-packof1']);

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('no DATABASE_URL');
  return line.slice('DATABASE_URL='.length).trim();
}

export async function shopCatalogue(): Promise<ShopProduct[]> {
  const sql = postgres(databaseUrl(), { max: 1 });
  try {
    const rows = await sql<{ key: string; label: string; id: string; sku: string; attributes: Record<string, string> | null; price_pence: number; is_default: boolean }[]>`
      select p.key, p.label, v.id, v.sku, v.attributes, v.price_pence, v.is_default
      from products p join product_variants v on v.product_id = p.id
      where p.visible_in_shop and p.active and v.active
      order by p.sort_order, v.sort_order`;
    const out = new Map<string, ShopProduct>();
    for (const r of rows) {
      if (BUNDLE_ONLY.has(r.sku)) continue;
      const p = out.get(r.key) ?? { key: r.key, label: r.label, variants: [] };
      p.variants.push({ id: r.id, sku: r.sku, attributes: r.attributes ?? {}, pricePence: r.price_pence, isDefault: r.is_default });
      out.set(r.key, p);
    }
    return [...out.values()];
  } finally {
    await sql.end();
  }
}

/** The drawing is stored (it has an asset id) once the range has finished making. */
export const rangeReady = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 90_000 });

/** Client-side navigation (keeps this tab's in-memory placement store, like a real tap). */
export async function goClient(page: Page, url: string) {
  await page.evaluate((u) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(u), url);
}

export type BasketLine = {
  id: string; product: string; sku?: string; variantId?: string; qty: number; pricePence: number; sub?: string;
  artwork?: { assetId: string; transform: { scale: number; offsetX: number; offsetY: number; rotationDeg: number }; sourceObjectId?: string };
  back?: string; ground?: string; cards?: unknown[]; pages?: unknown[]; bundle?: { placemat: { assetId: string }; coaster: { assetId: string } | null; ornaments: { assetId: string }[] };
};
export const basketLines = (page: Page): Promise<BasketLine[]> =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('sd_basket') ?? '{"state":{"items":[]}}').state.items);

/** This tab's uploaded drawing's asset id (src/lib/uploadSession.ts keeps it per tab). */
export const uploadedAssetId = (page: Page): Promise<string | null> =>
  page.evaluate(() => (JSON.parse(sessionStorage.getItem('sd_upload') ?? 'null')?.state?.upload?.assetId as string | undefined) ?? null);

/** The pressed chip in a customize option group (Size / Colour / Orientation / Case / Finish), or null. */
export async function pressedIn(page: Page, group: string): Promise<string | null> {
  const g = optionGroup(page, group);
  if ((await g.count()) === 0) return null;
  const on = g.locator('button[aria-pressed="true"]');
  return (await on.count()) ? (await on.first().innerText()).split('\n')[0]!.trim() : null;
}
export const optionGroup = (page: Page, group: string) =>
  page.locator('div.mt-5', { has: page.locator(':scope > p', { hasText: new RegExp(`^${group}$`) }) });

export const gbp = (pence: number) => {
  const pounds = Math.abs(pence) / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
};

/** Wait for the upload to be stored (ingest done → this tab's drawing has its asset id). */
export async function waitForAsset(page: Page): Promise<string> {
  await expect.poll(() => uploadedAssetId(page), { message: 'the drawing is stored', timeout: 120_000 }).toMatch(/^[0-9a-f-]{36}$/);
  return (await uploadedAssetId(page))!;
}
