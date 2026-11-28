// READ-ONLY: fetch Prodigi's own one-line DESCRIPTION (and product size) for every Prodigi SKU in the
// catalogue, into the fixture the print-warnings guard test reads
// (src/server/__tests__/fixtures/prodigi-product-notes.json). GET /v4.0/products/{sku} only — no image, no
// order, no prices (only `description` and `productDimensions` are kept). The key stays in the environment.
//
// Why: the 28 Nov 2026 mug sample. Prodigi's print-area SIZE for the two-tone mug (2480×1122) looked like a
// full wrap, so the size check passed — but its DESCRIPTION said "[NOT top-to-bottom printing]". The words
// are where Prodigi says a product prints less than it looks; the guard test reads them.
//
//   PRODIGI_API_KEY=… npx tsx --conditions=react-server scripts/fetch-prodigi-product-notes.ts [EXTRA-SKU …]
//   (PRODIGI_BASE_URL defaults to the SANDBOX.) Re-run with scripts/fetch-prodigi-print-areas.ts whenever a
//   product is added, then `npm test` — a new warning fails the guard until someone has looked at it.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { definedPriceList } from '@/server/catalogue';

type ApiProduct = { sku: string; description?: string; productDimensions?: { width: number; height: number; units: string } };

const apiKey = process.env.PRODIGI_API_KEY;
if (!apiKey) throw new Error('PRODIGI_API_KEY is not set');
const base = (process.env.PRODIGI_BASE_URL || 'https://api.sandbox.prodigi.com/v4.0').replace(/\/+$/, '');
const out = path.join('src', 'server', '__tests__', 'fixtures', 'prodigi-product-notes.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(sku: string): Promise<ApiProduct | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${base}/products/${encodeURIComponent(sku)}`, { headers: { 'X-API-Key': apiKey! } });
    if (res.status === 404) return null;
    if (res.status === 429) { await sleep(30_000); continue; }
    if (!res.ok) throw new Error(`${sku}: HTTP ${res.status}`);
    return ((await res.json()) as { product: ApiProduct }).product;
  }
  throw new Error(`${sku}: still rate-limited`);
}

const skus = [...new Set([...definedPriceList().flatMap((v) => (v.prodigiSku ? [v.prodigiSku] : [])), ...process.argv.slice(2)])].sort();
const products: Record<string, { description: string; productDimensions: ApiProduct['productDimensions'] | null } | null> = {};
for (const [i, sku] of skus.entries()) {
  if (i) await sleep(1100); // Prodigi allows 30 product calls per 30 s
  const p = await get(sku);
  products[sku] = p ? { description: p.description ?? '', productDimensions: p.productDimensions ?? null } : null;
  console.log(`${sku}: ${p ? p.description : 'NOT FOUND'}`);
}
const body = Object.entries(products).map(([sku, p]) => `  ${JSON.stringify(sku)}: ${JSON.stringify(p)}`).join(',\n');
writeFileSync(out, `{\n "source": ${JSON.stringify(`GET ${new URL(base).host}/v4.0/products/{sku} (description + productDimensions only)`)},\n "fetchedOn": ${JSON.stringify(new Date().toISOString().slice(0, 10))},\n "products": {\n${body}\n }\n}\n`);
console.log(`wrote ${out} (${skus.length} SKUs)`);
