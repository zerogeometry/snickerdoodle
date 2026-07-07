import { and, eq } from 'drizzle-orm';
import { printTemplates, productVariants, products } from '@/db/schema';
import type { DbHandle } from './db';

/**
 * Pure DB loading of the printable product variants for the placement editor — kept
 * SEPARATE from studio.ts (which pulls in the session/next-auth chain) so it is unit-
 * testable on its own.
 */
export interface StudioTemplate {
  printWidthPx: number;
  printHeightPx: number;
  bleedMm: number;
  safeInsetMm: number;
  requiredDpi: number;
}
export interface StudioVariant {
  id: string;
  productKey: string;
  label: string;
  pricePence: number;
  template: StudioTemplate;
}

type VariantRow = { v: typeof productVariants.$inferSelect; p: typeof products.$inferSelect; t: typeof printTemplates.$inferSelect };

/** A frame's variant carries a size/colour/orientation — surface them so the pill in
 * the (single-product) editor names the EXACT creation being placed, e.g.
 * "framed print · 12×16" · black · landscape". */
function variantLabel(p: typeof products.$inferSelect, v: typeof productVariants.$inferSelect): string {
  const a = (v.attributes ?? {}) as Record<string, string>;
  const bits = [a.size, a.colour, a.orientation === 'landscape' ? 'landscape' : null].filter(Boolean);
  return bits.length ? `${p.label} · ${bits.join(' · ')}` : p.label;
}

function toStudioVariant({ v, p, t }: VariantRow): StudioVariant {
  return {
    id: v.id,
    productKey: p.key,
    label: variantLabel(p, v),
    pricePence: v.pricePence,
    template: {
      printWidthPx: t.printWidthPx,
      printHeightPx: t.printHeightPx,
      bleedMm: t.bleedMm,
      safeInsetMm: t.safeInsetMm,
      requiredDpi: t.requiredDpi,
    },
  };
}

/** The printable product variants (those with a print template) — shared by the
 * member and guest-draft editors.
 *
 * The editor is ALWAYS scoped to ONE creation (founder call 2026-07-07 — no catalogue
 * in here). When Customize hands us the SPECIFIC variant the shopper chose (its exact
 * size/colour/orientation), we return JUST that one — its own template drives the canvas,
 * so a landscape frame edits on a landscape canvas. Without a focus (e.g. the member
 * home entry) we fall back to one representative (the default) per product. */
export async function loadPrintableVariants(db: DbHandle, focusVariantId?: string): Promise<StudioVariant[]> {
  if (focusVariantId) {
    const [row] = await db
      .select({ v: productVariants, p: products, t: printTemplates })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
      .where(and(eq(productVariants.id, focusVariantId), eq(products.active, true), eq(productVariants.active, true)));
    // A real, printable focus wins outright — the editor is exactly this creation.
    if (row) return [toStudioVariant(row)];
    // Unknown/unprintable id: fall through to the defaults so the editor still opens.
  }
  const vrows = await db
    .select({ v: productVariants, p: products, t: printTemplates })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
    // One representative (the default) per product — the studio places at product
    // level; size/colour are chosen in Customize.
    .where(and(eq(products.active, true), eq(productVariants.active, true), eq(productVariants.isDefault, true)));

  return vrows.map(toStudioVariant);
}
