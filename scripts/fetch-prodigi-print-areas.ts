// READ-ONLY: fetch Prodigi's print-area sizes for every Prodigi SKU in the catalogue and write them
// to the fixture the print-spec guard test checks our templates against
// (src/server/__tests__/fixtures/prodigi-print-areas.json). Metadata only — GET /v4.0/products/{sku},
// no image, no order. The API key stays in the environment; nothing secret is written.
//
//   PRODIGI_API_KEY=… npx tsx --conditions=react-server scripts/fetch-prodigi-print-areas.ts
//   (PRODIGI_BASE_URL defaults to the SANDBOX — the print areas are the same as live.) Extra SKUs not
//   yet in the catalogue (a product landing on another branch) can be passed as arguments.
//
// Re-run whenever a product is added or Prodigi changes a spec, then run `npm test`.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { definedPriceList } from '@/server/catalogue';

type Size = { w: number; h: number };
type ApiVariant = { attributes?: Record<string, string>; shipsTo?: string[]; printAreaSizes?: Record<string, { horizontalResolution: number; verticalResolution: number }> };
type ApiProduct = { sku: string; printAreas?: Record<string, { required?: boolean }>; variants?: ApiVariant[] };

const apiKey = process.env.PRODIGI_API_KEY;
if (!apiKey) throw new Error('PRODIGI_API_KEY is not set');
const base = (process.env.PRODIGI_BASE_URL || 'https://api.sandbox.prodigi.com/v4.0').replace(/\/+$/, '');
const out = path.join('src', 'server', '__tests__', 'fixtures', 'prodigi-print-areas.json');

// Prodigi allows 30 product calls per 30 s — keep well under it.
const GAP_MS = 1100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(sku: string): Promise<ApiProduct | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${base}/products/${encodeURIComponent(sku)}`, { headers: { 'X-API-Key': apiKey! } });
    if (res.status === 404) return null;
    if (res.status === 429) {
      await sleep(30_000);
      continue;
    }
    if (!res.ok) throw new Error(`${sku}: HTTP ${res.status}`);
    return ((await res.json()) as { product: ApiProduct }).product;
  }
  throw new Error(`${sku}: still rate-limited`);
}

const skus = [...new Set([...definedPriceList().flatMap((v) => (v.prodigiSku ? [v.prodigiSku] : [])), ...process.argv.slice(2)])].sort();
const products: Record<string, { printAreas: string[]; variants: Array<{ attributes: Record<string, string>; printAreaSizes: Record<string, Size> }> } | null> = {};
for (const [i, sku] of skus.entries()) {
  if (i) await sleep(GAP_MS);
  const p = await get(sku);
  if (!p) {
    products[sku] = null;
    console.warn(`${sku}: NOT FOUND`);
    continue;
  }
  // the routes that ship to GB (we only sell in the UK), one row per distinct (attributes, sizes) —
  // a SKU lists the same variant once per lab
  const seen = new Set<string>();
  const variants = [];
  for (const v of p.variants ?? []) {
    if (!(v.shipsTo ?? []).includes('GB')) continue;
    const printAreaSizes = Object.fromEntries(Object.entries(v.printAreaSizes ?? {}).map(([k, s]) => [k, { w: s.horizontalResolution, h: s.verticalResolution }]));
    const row = { attributes: v.attributes ?? {}, printAreaSizes };
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(row);
  }
  products[sku] = { printAreas: Object.keys(p.printAreas ?? {}), variants };
  console.log(`${sku}: ${variants.length} variant(s)`);
}

// one SKU per block, one variant per line — so a change at Prodigi reads as a small diff
const block = (p: (typeof products)[string]) =>
  p ? `{\n   "printAreas": ${JSON.stringify(p.printAreas)},\n   "variants": [\n${p.variants.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n   ]\n  }` : 'null';
const body = Object.entries(products).map(([sku, p]) => `  ${JSON.stringify(sku)}: ${block(p)}`).join(',\n');
const source = `GET ${new URL(base).host}/v4.0/products/{sku} (GB routes)`;
writeFileSync(out, `{\n "source": ${JSON.stringify(source)},\n "fetchedOn": ${JSON.stringify(new Date().toISOString().slice(0, 10))},\n "products": {\n${body}\n }\n}\n`);
console.log(`wrote ${out} (${skus.length} SKUs)`);
