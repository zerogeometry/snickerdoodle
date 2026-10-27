/**
 * e2e/visual environment seed — run by e2e/global-setup.ts (in CI, or with E2E_SEED=1) through
 * tsx with the react-server condition, so the real server modules + the `@/` alias apply:
 *
 *   NODE_OPTIONS=--conditions=react-server node node_modules/tsx/dist/cli.mjs e2e/seed.ts
 *
 * 1. The product catalogue, if the database has none yet (a fresh CI / worktree database).
 * 2. A SYNTHETIC mockup template for every live variant that has NO template yet. The real
 *    photoreal templates are authored from Prodigi's blank photos (.prodigi-assets, gitignored —
 *    never in CI), so without this the range would sit on its calm empty blocks and the
 *    compositor would never run. These blanks are DRAWN here (flat shapes, brand-safe, no child
 *    art) and go through the real authoring path (setMockupTemplate). A variant that already has
 *    a template — e.g. the founder's real ones — is never touched.
 *
 * Idempotent. Never run against a deployed database: it refuses anything that isn't local.
 */
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { and, count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { mockupViews, printTemplates, products, productVariants, templateAssets } from '@/db/schema';
import { seedCatalogue } from '@/server/catalogue';
import { setMockupTemplate, setMockupView, type MaterialClass } from '@/server/print/templates';
import { ensureBucket, getS3 } from '@/storage';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('e2e seed: DATABASE_URL is not set');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host)) {
  throw new Error(`e2e seed: refusing to seed a non-local database (${host})`);
}

const MATERIAL: Record<string, MaterialClass> = {
  mug: 'CERAMIC',
  bauble: 'CERAMIC',
  cushion: 'LIGHT_FABRIC',
  blanket: 'LIGHT_FABRIC',
  kidsTee: 'LIGHT_FABRIC',
  adultTee: 'LIGHT_FABRIC',
  babyBodysuit: 'LIGHT_FABRIC',
  apron: 'LIGHT_FABRIC',
  sack: 'LIGHT_FABRIC',
};

/** A flat, drawn "product" on a kraft backdrop with its print area aspect-locked to the canvas. */
async function syntheticBlank(printW: number, printH: number): Promise<{ blank: Buffer; quad: [number, number][] }> {
  const W = 900;
  const H = 900;
  const aspect = printW / printH;
  const max = 0.68;
  const qw = aspect >= 1 ? max : max * aspect;
  const qh = aspect >= 1 ? max / aspect : max;
  const x0 = (1 - qw) / 2;
  const y0 = (1 - qh) / 2;
  const pad = 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#EBDDC6"/>
    <rect x="${x0 * W - pad}" y="${y0 * H - pad}" width="${qw * W + 2 * pad}" height="${qh * H + 2 * pad}" rx="18" fill="#2B2118"/>
    <rect x="${x0 * W}" y="${y0 * H}" width="${qw * W}" height="${qh * H}" fill="#FFFBF2"/>
  </svg>`;
  const blank = await sharp(Buffer.from(svg)).png().toBuffer();
  const quad: [number, number][] = [
    [x0, y0],
    [x0 + qw, y0],
    [x0 + qw, y0 + qh],
    [x0, y0 + qh],
  ];
  return { blank, quad };
}

async function main() {
  const client = postgres(url!, { prepare: false, max: 2 });
  const db = drizzle(client, { schema });
  try {
    const [{ n }] = (await db.select({ n: count() }).from(products)) as [{ n: number }];
    if (Number(n) === 0) {
      const s = await seedCatalogue(db);
      console.log(`e2e seed: catalogue seeded (${s.products} products, ${s.variants} variants)`);
    }

    await ensureBucket();
    const { client: s3, bucket } = getS3();
    const stored = async (key: string | null) => {
      if (!key) return false;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    };

    const templates = await db
      .select({ variantId: printTemplates.variantId, w: printTemplates.printWidthPx, h: printTemplates.printHeightPx, key: products.key, blankKey: templateAssets.key })
      .from(printTemplates)
      .innerJoin(productVariants, eq(productVariants.id, printTemplates.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(templateAssets, eq(templateAssets.id, printTemplates.blankObjectId))
      .where(and(eq(products.active, true), eq(productVariants.active, true)));

    let drawn = 0;
    let lost = 0;
    for (const m of templates) {
      if (await stored(m.blankKey)) continue;
      if (m.blankKey) lost++;
      const { blank, quad } = await syntheticBlank(m.w, m.h);
      await setMockupTemplate(db, { variantId: m.variantId, blank, contentType: 'image/png', printQuad: quad, materialClass: MATERIAL[m.key] ?? 'PAPER' });
      drawn++;
    }
    if (lost) console.warn(`e2e seed: ${lost} mockup templates had lost their blank from storage — redrawn synthetic`);
    if (drawn) console.log(`e2e seed: drew ${drawn} synthetic mockup templates`);

    // The range shows the mug by its centred wrap (an alternate view) — draw that too where absent.
    const mugs = await db
      .select({ variantId: printTemplates.variantId, w: printTemplates.printWidthPx, h: printTemplates.printHeightPx, view: mockupViews.view, blankKey: templateAssets.key })
      .from(printTemplates)
      .innerJoin(productVariants, eq(productVariants.id, printTemplates.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(mockupViews, and(eq(mockupViews.variantId, printTemplates.variantId), eq(mockupViews.view, 'centre')))
      .leftJoin(templateAssets, eq(templateAssets.id, mockupViews.blankObjectId))
      .where(eq(products.key, 'mug'));
    const noCentre = [];
    for (const m of mugs) if (!(await stored(m.blankKey))) noCentre.push(m);
    for (const m of noCentre) {
      const { blank, quad } = await syntheticBlank(m.w, m.h);
      await setMockupView(db, { variantId: m.variantId, view: 'centre', blank, contentType: 'image/png', printQuad: quad, printWidthPx: m.w, printHeightPx: m.h, materialClass: 'CERAMIC' });
    }
    if (noCentre.length) console.log(`e2e seed: drew ${noCentre.length} synthetic mug centre views`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
