import { and, eq } from 'drizzle-orm';
import { printTemplates, productVariants, products } from '@/db/schema';
import type { DbHandle } from './db';
import { templateGeom } from './print/geometry';

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
  /** The dpi the print is judged at when lower than the file's (TemplateGeom.gateDpi). */
  gateDpi?: number;
}
export interface StudioVariant {
  id: string;
  productKey: string;
  label: string;
  pricePence: number;
  /** portrait | landscape when the product has an orientation axis (frames) — drives
   * the in-editor orientation toggle. Undefined for products without one. */
  orientation?: string;
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
  const a = (v.attributes ?? {}) as Record<string, string>;
  return {
    id: v.id,
    productKey: p.key,
    label: variantLabel(p, v),
    pricePence: v.pricePence,
    orientation: a.orientation,
    template: { ...templateGeom(t), safeInsetMm: t.safeInsetMm },
  };
}

/** The printable product variants (those with a print template) — shared by the
 * member and guest-draft editors.
 *
 * The editor is ALWAYS scoped to ONE creation (founder call 2026-07-07 — no catalogue
 * in here). When Customize hands us the SPECIFIC variant the shopper chose (its exact
 * size/colour/orientation), we return that one PLUS its orientation sibling(s) — same
 * product, same size, same colour, the other orientation — so the editor can offer a
 * portrait/landscape toggle without leaving the creation (each carries its own template,
 * so the canvas aspect is always right). Without a focus (e.g. the member home entry)
 * we fall back to one representative (the default) per product. */
export async function loadPrintableVariants(db: DbHandle, focusVariantId?: string): Promise<StudioVariant[]> {
  if (focusVariantId) {
    const [focus] = await db
      .select({ v: productVariants, p: products, t: printTemplates })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
      .where(and(eq(productVariants.id, focusVariantId), eq(products.active, true), eq(productVariants.active, true)));
    if (focus) {
      const fa = (focus.v.attributes ?? {}) as Record<string, string>;
      if (!fa.orientation) return [toStudioVariant(focus)]; // no orientation axis → just this creation
      // The orientation pair for this exact size+colour (portrait + landscape).
      const rows = await db
        .select({ v: productVariants, p: products, t: printTemplates })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
        .where(and(eq(productVariants.productId, focus.p.id), eq(products.active, true), eq(productVariants.active, true)));
      const sibs = rows.filter((r) => {
        const a = (r.v.attributes ?? {}) as Record<string, string>;
        return a.size === fa.size && a.colour === fa.colour;
      });
      // focus first, then its other-orientation sibling(s)
      const ordered = [focus, ...sibs.filter((s) => s.v.id !== focus.v.id)];
      return ordered.map(toStudioVariant);
    }
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
