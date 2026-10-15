import { and, eq } from 'drizzle-orm';
import { productVariantProviders, productVariants, products } from '@/db/schema';
import type { DbHandle } from '../db';
import { prodigiClient, type ProdigiClient, type ProdigiProduct } from './client';

/**
 * Prodigi catalogue sync (D4). Walks every variant mapped to a Prodigi SKU and,
 * against the live API:
 *  1. VALIDATES the SKU exists (flags missing/renamed ones — no silent breakage),
 *  2. ENRICHES the product's technical `specs` from Prodigi's real attributes
 *     (the brand-voice blurb + description stay OURS — only specs come from Prodigi),
 *  3. SNAPSHOTS each variant's Prodigi data (dimensions, ships-to-GB, colours) into
 *     `providerConfig`, and reconciles our colours against Prodigi's colour axis.
 *
 * Metadata only — no image is ever sent. Idempotent; safe to re-run.
 */

const ATTR_LABELS: Record<string, string> = {
  paperType: 'paper',
  substrateWeight: 'weight',
  glaze: 'glaze',
  frame: 'frame',
  mount: 'mount',
  mountColor: 'mount colour',
  style: 'style',
  brand: 'brand',
  edge: 'neck',
  gender: 'fit',
};

/** Technical specs from a Prodigi product: its single-valued attributes (the axes
 * with one allowed value are fixed specs) plus the physical dimensions. The variant
 * axes (size, colour) are NOT specs. */
export function specsFromProdigi(p: ProdigiProduct): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const [key, values] of Object.entries(p.attributes ?? {})) {
    if (key === 'size' || key === 'color' || key === 'colour') continue;
    if (Array.isArray(values) && values.length === 1 && values[0]) {
      specs[ATTR_LABELS[key] ?? key] = values[0];
    }
  }
  const d = p.productDimensions;
  if (d) specs.dimensions = `${d.width}×${d.height} ${d.units}`;
  return specs;
}

export interface SyncEntry {
  internalSku: string;
  providerSku: string;
  productKey: string;
  status: 'ok' | 'missing' | 'error';
  warnings: string[];
}

export interface SyncReport {
  total: number;
  ok: number;
  missing: number;
  errors: number;
  productsEnriched: number;
  entries: SyncEntry[];
}

export async function syncProdigiCatalogue(db: DbHandle, client: ProdigiClient = prodigiClient): Promise<SyncReport> {
  const rows = await db
    .select({
      providerId: productVariantProviders.id,
      providerSku: productVariantProviders.providerSku,
      variantId: productVariants.id,
      internalSku: productVariants.sku,
      isDefault: productVariants.isDefault,
      attributes: productVariants.attributes,
      productId: products.id,
      productKey: products.key,
      productSpecs: products.specs,
      providerConfig: productVariantProviders.providerConfig,
    })
    .from(productVariantProviders)
    .innerJoin(productVariants, eq(productVariants.id, productVariantProviders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariantProviders.provider, 'PRODIGI'),
        eq(productVariantProviders.active, true),
        eq(productVariants.active, true),
        eq(products.active, true),
      ),
    );

  const now = new Date();
  const entries: SyncEntry[] = [];
  // Specs to write per product, taken from that product's DEFAULT variant.
  const productSpecUpdates = new Map<string, Record<string, string>>();
  let productsEnriched = 0;

  for (const r of rows) {
    const warnings: string[] = [];
    // The order-time Prodigi attributes (size/colour for SKUs shared across variants)
    // are the only per-variant disambiguator — PRESERVE them across every sync write.
    const cfg = r.providerConfig as { prodigiAttrs?: Record<string, string>; printTo?: string[] } | null;
    const prodigiAttrs = cfg?.prodigiAttrs;
    // …and which print areas we fill (the order submission reads it): preserved too.
    const printTo = cfg?.printTo;
    const keepAttrs = { ...(prodigiAttrs ? { prodigiAttrs } : {}), ...(printTo ? { printTo } : {}) };

    let product: ProdigiProduct | null = null;
    try {
      product = await client.getProduct(r.providerSku);
    } catch (e) {
      entries.push({ internalSku: r.internalSku, providerSku: r.providerSku, productKey: r.productKey, status: 'error', warnings: [String((e as Error).message)] });
      continue;
    }

    if (!product) {
      // 404 — the SKU doesn't exist (typo/renamed/placeholder). Record it, don't enrich.
      await db
        .update(productVariantProviders)
        .set({ providerConfig: { ...keepAttrs, missing: true, syncedAt: now.toISOString() } })
        .where(eq(productVariantProviders.id, r.providerId));
      entries.push({ internalSku: r.internalSku, providerSku: r.providerSku, productKey: r.productKey, status: 'missing', warnings: ['SKU not found on Prodigi'] });
      continue;
    }

    const shipsToGB = (product.variants ?? []).some((v) => v.shipsTo?.includes('GB'));
    if (!shipsToGB) warnings.push('does not ship to GB');

    // Every REQUIRED print area must get our file, and we must only send areas that exist — or
    // Prodigi rejects the order at submission (how the garments + jigsaw slipped through once).
    const areas = product.printAreas ?? {};
    const sendTo = printTo ?? ['default'];
    for (const [name, a] of Object.entries(areas)) if (a?.required && !sendTo.includes(name)) warnings.push(`required print area "${name}" is not filled — set printTo in the catalogue`);
    for (const name of sendTo) if (!(name in areas)) warnings.push(`print area "${name}" doesn't exist on Prodigi (has: ${Object.keys(areas).join(', ')})`);

    // Resolve Prodigi's colour axis ONCE (either spelling) — used for both the warning
    // and the snapshot, so they can never disagree.
    const prodigiColours = product.attributes?.color ?? product.attributes?.colour ?? [];
    const ourColour = ((r.attributes as Record<string, string> | null)?.colour ?? '').toLowerCase();
    if (ourColour && prodigiColours.length > 0 && !prodigiColours.map((c) => c.toLowerCase()).includes(ourColour)) {
      warnings.push(`colour "${ourColour}" not in Prodigi colours [${prodigiColours.join(', ')}] — needs a colour map`);
    }

    await db
      .update(productVariantProviders)
      .set({
        providerConfig: {
          ...keepAttrs,
          description: product.description,
          productDimensions: product.productDimensions ?? null,
          shipsToGB,
          colours: prodigiColours,
          sizes: product.attributes?.size ?? [],
          printAreas: Object.keys(product.printAreas ?? {}),
          variantCount: (product.variants ?? []).length,
          syncedAt: now.toISOString(),
        },
      })
      .where(eq(productVariantProviders.id, r.providerId));

    // Enrich the product's technical specs from its DEFAULT variant — MERGE over the
    // seeded brand-voice specs (so brand-only lines survive; Prodigi technicals win).
    if (r.isDefault) {
      productSpecUpdates.set(r.productId, { ...((r.productSpecs as Record<string, string>) ?? {}), ...specsFromProdigi(product) });
    }

    entries.push({ internalSku: r.internalSku, providerSku: r.providerSku, productKey: r.productKey, status: 'ok', warnings });
  }

  // Enrich each product's technical specs from its default variant's Prodigi product.
  for (const [productId, specs] of productSpecUpdates) {
    if (Object.keys(specs).length === 0) continue;
    await db.update(products).set({ specs }).where(eq(products.id, productId));
    productsEnriched++;
  }

  return {
    total: entries.length,
    ok: entries.filter((e) => e.status === 'ok').length,
    missing: entries.filter((e) => e.status === 'missing').length,
    errors: entries.filter((e) => e.status === 'error').length,
    productsEnriched,
    entries,
  };
}
