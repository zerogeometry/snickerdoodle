import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, templateAssets } from '@/db/schema';
import type { DbHandle } from '@/server/db';

/**
 * Print-map registration invariant (founder requirement: preview "the" image on "your"
 * product). For every authored mockup template, the photo quad's aspect ratio — in PIXELS,
 * via the blank's stored dimensions — must equal the variant's REAL print-canvas aspect
 * (print_templates.printWidthMm × printHeightMm). Because the compositor and the print
 * renderer share the same cover-fit + transform maths, aspect equality is exactly the
 * condition under which the preview crop equals the print crop.
 *
 * The mug is exempt: a cylinder's visible band can't share the flat wrap's aspect in the
 * FLAT tier (the Studio positioner stays exact on the full wrap; PERSPECTIVE closes it).
 */
const DB = process.env.DATABASE_URL;
const TOLERANCE = 0.02; // 2%

describe.skipIf(!DB)('mockup print-map registration — quad aspect == print aspect', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;

  beforeAll(() => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
  });
  afterAll(async () =>
    client.end());

  it('every authored flat template is aspect-locked to its print canvas', async () => {
    const rows = await db
      .select({
        sku: productVariants.sku,
        quad: printTemplates.printQuad,
        printWmm: printTemplates.printWidthMm,
        printHmm: printTemplates.printHeightMm,
        blankW: templateAssets.widthPx,
        blankH: templateAssets.heightPx,
      })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .innerJoin(templateAssets, eq(printTemplates.blankObjectId, templateAssets.id))
      .where(eq(productVariants.active, true)); // retired variants keep stale templates; only live ones render

    const flat = rows.filter((r) => r.quad && r.blankW && r.blankH && !r.sku.startsWith('mug'));
    const offenders: string[] = [];
    for (const r of flat) {
      const q = r.quad as [number, number][];
      const quadAspect = ((q[1]![0] - q[0]![0]) * r.blankW!) / ((q[3]![1] - q[0]![1]) * r.blankH!);
      const printAspect = r.printWmm / r.printHmm;
      if (Math.abs(quadAspect / printAspect - 1) > TOLERANCE) {
        offenders.push(`${r.sku}: quad ${quadAspect.toFixed(3)} vs print ${printAspect.toFixed(3)}`);
      }
    }
    expect(offenders).toEqual([]);
    // If templates are authored in this environment, the invariant must have real coverage.
    if (rows.length > 0) expect(flat.length).toBeGreaterThan(0);
  });
});
