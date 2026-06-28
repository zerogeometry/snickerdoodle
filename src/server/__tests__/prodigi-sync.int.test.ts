import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { productVariantProviders, productVariants, products } from '@/db/schema';
import { syncProdigiCatalogue, type SyncReport } from '@/server/prodigi/sync';
import type { ProdigiClient } from '@/server/prodigi/client';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

// Isolated throwaway product so concurrent seedCatalogue() calls in other int-test
// files can't race us on the shared catalogue. The mock returns generic data for any
// real catalogue SKUs too (harmless); we only assert on our own TEST-* SKUs.
const PK = '__prodigi_sync_test__';

const mockClient: ProdigiClient = {
  async getProduct(sku) {
    if (sku === 'TEST-MISSING') return null;
    const color = sku === 'TEST-COLOUR' ? ['black'] : undefined;
    // ships-to-GB is aggregated across ALL variants: a SKU with one US-only and one
    // GB variant still ships to GB. TEST-USONLY is the negative (no GB anywhere).
    const variants =
      sku === 'TEST-USONLY'
        ? [{ attributes: {}, shipsTo: ['US', 'CA'] }]
        : sku === 'TEST-MIXED-GB'
          ? [{ attributes: {}, shipsTo: ['US'] }, { attributes: {}, shipsTo: ['GB'] }]
          : [{ attributes: {}, shipsTo: ['GB', 'US'] }];
    return {
      sku,
      description: `Desc ${sku}`,
      productDimensions: { width: 10, height: 20, units: 'cm' },
      attributes: { paperType: ['EMA'], substrateWeight: ['200gsm'], ...(color ? { color } : {}) },
      printAreas: { default: { required: true } },
      variants,
    };
  },
};

describe.skipIf(!URL)('prodigi catalogue sync — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let report: SyncReport;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await db.delete(products).where(eq(products.key, PK)); // clean any prior run (cascades)

    const [product] = await db
      .insert(products)
      .values({ key: PK, category: 'PRINT', label: 'sync test', blurb: 'b', description: 'KEEP-THIS-BRAND-DESCRIPTION', specs: { placeholder: 'x' } })
      .returning();

    const variants: { sku: string; attrs: Record<string, string>; sku2: string; provider: 'PRODIGI' | 'MANUAL'; isDefault: boolean; config?: unknown }[] = [
      // PK-ok carries prodigiAttrs (the order-time disambiguator) — it MUST survive the sync.
      { sku: `${PK}-ok`, attrs: { size: 'A4' }, sku2: 'TEST-OK', provider: 'PRODIGI', isDefault: true, config: { prodigiAttrs: { color: 'gold' } } },
      { sku: `${PK}-missing`, attrs: { size: 'A3' }, sku2: 'TEST-MISSING', provider: 'PRODIGI', isDefault: false, config: { prodigiAttrs: { color: 'black' } } },
      { sku: `${PK}-usonly`, attrs: { size: '5x7' }, sku2: 'TEST-USONLY', provider: 'PRODIGI', isDefault: false },
      { sku: `${PK}-colour`, attrs: { colour: 'turquoise' }, sku2: 'TEST-COLOUR', provider: 'PRODIGI', isDefault: false },
      { sku: `${PK}-mixedgb`, attrs: { size: '8x10' }, sku2: 'TEST-MIXED-GB', provider: 'PRODIGI', isDefault: false },
      { sku: `${PK}-manual`, attrs: {}, sku2: 'TEST-MANUAL', provider: 'MANUAL', isDefault: false },
    ];
    let sort = 0;
    for (const v of variants) {
      const [variant] = await db
        .insert(productVariants)
        .values({ productId: product!.id, sku: v.sku, label: v.sku, attributes: v.attrs, pricePence: 1000, isDefault: v.isDefault, sortOrder: sort++ })
        .returning();
      await db
        .insert(productVariantProviders)
        .values({ variantId: variant!.id, provider: v.provider, providerSku: v.sku2, providerConfig: v.config ?? null, isDefault: true });
    }

    report = await syncProdigiCatalogue(db, mockClient);
  });

  afterAll(async () => {
    await db.delete(products).where(eq(products.key, PK)); // cascades variants + providers
    await client.end();
  });

  it('flags a missing SKU (never silently dropped) and marks live ones ok', () => {
    expect(report.entries.find((e) => e.providerSku === 'TEST-MISSING')?.status).toBe('missing');
    expect(report.entries.find((e) => e.providerSku === 'TEST-OK')?.status).toBe('ok');
    expect(report.ok + report.missing + report.errors).toBe(report.total);
  });

  it('warns when a variant does not ship to GB', () => {
    const e = report.entries.find((x) => x.providerSku === 'TEST-USONLY');
    expect(e?.warnings.some((w) => /ship to GB/i.test(w))).toBe(true);
  });

  it('aggregates ships-to-GB across all variants (mixed US + GB → no warning)', () => {
    const e = report.entries.find((x) => x.providerSku === 'TEST-MIXED-GB');
    expect(e?.status).toBe('ok');
    expect(e?.warnings.some((w) => /ship to GB/i.test(w))).toBe(false);
  });

  it('reconciles colours against the Prodigi colour axis', () => {
    const e = report.entries.find((x) => x.providerSku === 'TEST-COLOUR');
    expect(e?.warnings.some((w) => /colour/i.test(w))).toBe(true);
  });

  it('ignores MANUAL-fulfilled variants (add-ons)', () => {
    expect(report.entries.some((e) => e.providerSku === 'TEST-MANUAL')).toBe(false);
  });

  it('enriches product specs from Prodigi but leaves the brand description ours', async () => {
    const [p] = await db.select().from(products).where(eq(products.key, PK));
    expect(p!.specs).toMatchObject({ paper: 'EMA', weight: '200gsm', dimensions: '10×20 cm' });
    expect(p!.description).toBe('KEEP-THIS-BRAND-DESCRIPTION');
  });

  it('snapshots Prodigi data into providerConfig WITHOUT destroying prodigiAttrs', async () => {
    const rows = await db
      .select({ cfg: productVariantProviders.providerConfig })
      .from(productVariantProviders)
      .innerJoin(productVariants, eq(productVariants.id, productVariantProviders.variantId))
      .where(eq(productVariants.sku, `${PK}-ok`));
    const cfg = rows[0]?.cfg as { description?: string; shipsToGB?: boolean; syncedAt?: string; prodigiAttrs?: Record<string, string> } | null;
    expect(cfg?.description).toBe('Desc TEST-OK');
    expect(cfg?.shipsToGB).toBe(true);
    expect(cfg?.syncedAt).toBeTruthy();
    // The order-time disambiguator survives — without it, a shared-SKU variant loses its colour/size.
    expect(cfg?.prodigiAttrs).toEqual({ color: 'gold' });
  });

  it('preserves prodigiAttrs even when the SKU is missing (404)', async () => {
    const rows = await db
      .select({ cfg: productVariantProviders.providerConfig })
      .from(productVariantProviders)
      .innerJoin(productVariants, eq(productVariants.id, productVariantProviders.variantId))
      .where(eq(productVariants.sku, `${PK}-missing`));
    const cfg = rows[0]?.cfg as { missing?: boolean; prodigiAttrs?: Record<string, string> } | null;
    expect(cfg?.missing).toBe(true);
    expect(cfg?.prodigiAttrs).toEqual({ color: 'black' });
  });
});
