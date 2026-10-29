// Discount headroom per product — what each sale really earns at TODAY's shelf price, and how
// big a % or £ discount it can carry. Reads live prices + supplier SKUs from the DB and the
// captured Prodigi cost sheets (.prodigi-assets/pricing/, see project-office/briefs/PRICING.md).
// Writes .prodigi-assets/DISCOUNT-HEADROOM.md + a CSV.
//
// Run: node --env-file=.env scripts/discount-headroom.mjs [--write-costs]
//   --write-costs  also stores each variant's landed unit cost (product + baked-in delivery,
//                  ex-VAT) in product_variants.unit_cost_pence — the promo margin guard reads it —
//                  and its first-unit + "plus one" post (post_first_pence / post_extra_pence), which
//                  the multi-buy tiers are derived from (src/pricing/multibuy.ts).
//
// Economics per unit (VAT-registered, prices are VAT-inclusive, free delivery baked in):
//   ex-VAT revenue   R = P / 1.2
//   card fee         F = 1.5% × P + 20p         (Stripe, on the VAT-inclusive charge)
//   contribution     M = R − cost − shipping − F
// A discount d (fraction) or £v off the VAT-inclusive price shrinks R and F proportionally.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const DIR = '.prodigi-assets/pricing';
const FX = { GBP: 1, EUR: 0.87, USD: 0.8 };
const VAT = 0.2, STRIPE_PCT = 0.015, STRIPE_FIXED = 20;
// Shipping tier baked into each product (founder decisions in PRICING.md): jigsaw = Express (tracked).
const SHIP_METHOD = { jigsaw: 'express', phoneCase: 'express' }; // a basket with a phone case ships Express

function parseLine(line) { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; }
function parseCsv(t) { const L = t.split(/\r?\n/).filter((l) => l.trim()); const h = parseLine(L[0]).map((x) => x.trim()); return L.slice(1).map((l) => { const cs = parseLine(l); const r = {}; h.forEach((x, i) => (r[x] = (cs[i] ?? '').trim())); return r; }); }
const toGbp = (v, cur) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100 * (FX[cur] ?? 1)) : NaN; };

const bySku = new Map();
for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.csv')) continue;
  for (const r of parseCsv(readFileSync(path.join(DIR, file), 'utf8'))) {
    if (r['Destination country'] !== 'GB' || !r['SKU']) continue;
    const cost = toGbp(r['Product price'], r['Product currency']);
    if (!Number.isFinite(cost)) continue;
    const ship = toGbp(r['Shipping price'], r['Shipping currency']);
    const extra = toGbp(r['Plus one shipping price'], r['Shipping currency']);
    const list = bySku.get(r['SKU']) ?? [];
    list.push({ cost, ship: Number.isFinite(ship) ? ship : 0, extra: Number.isFinite(extra) ? extra : null, method: (r['Shipping method'] || '').toLowerCase(), src: r['Source country'] });
    bySku.set(r['SKU'], list);
  }
}
// SKUs the sheets don't carry yet — Prodigi SANDBOX quotes to GB, Standard: [cost, first post, plus-one post].
//  - the christmas table packs (27 Oct 2026): uk9 → Royal Mail Tracked 48, £4.30 + £1.00 per extra item;
//  - the DATED 2027 calendar (25 Oct, CHRISTMAS-range-and-postage.md): uk15, £4.35, two for £5.35.
//  - playing cards, kraft wrap rolls, height charts (29 Oct 2026, 1 copy + 2 copies quoted for the plus-one);
//    a height chart always ships in its own parcel, so its plus-one is a full second post.
// (Still missing — so no multi-buy offer or code discount until added: hidden jumpers, bandana.)
const SANDBOX = {
  'H-PLACE-1PK': [900, 430, 100], 'H-PLACE-2PK': [1650, 430, 100], 'H-PLACE-4PK': [3250, 430, 100], 'H-PLACE-6PK': [4850, 430, 100],
  'H-COAST-1PK': [400, 430, 100], 'H-COAST-2PK': [550, 430, 100], 'H-COAST-4PK': [1000, 430, 100], 'H-COAST-6PK': [1500, 430, 100],
  'CALENDAR-A5-L-DATED': [900, 435, 100], 'CALENDAR-A4-L-DATED': [1000, 435, 100],
  'PLAY-CARD': [800, 645, 25],
  'WRAP-KFT-ROL-70X200': [800, 570, 100], 'WRAP-KFT-ROL-70X300': [1100, 570, 100], 'WRAP-KFT-ROL-70X500': [1700, 570, 100],
  'POSTER-HANGER-20-CAN-ROL-SC-8X48': [1200, 675, 675], 'POSTER-HANGER-20-CAN-ROL-SC-8X60': [1400, 675, 675],
  'POSTER-HANGER-30-CAN-ROL-SC-12X48': [1400, 675, 675], 'POSTER-HANGER-30-CAN-ROL-SC-12X60': [1500, 675, 675],
};
for (const [sku, [cost, ship, extra]] of Object.entries(SANDBOX)) if (!bySku.has(sku)) bySku.set(sku, [{ cost, ship, extra, method: 'standard', src: 'GB' }]);
// Phone cases (29 Oct 2026, all 152 GB case SKUs quoted, 0 exceptions): a basket with a case ships EXPRESS
// (resolveShippingMethod in src/fulfillment/submit.ts), lab uk6 → £5.95, +£0.50 per extra case.
// Snap £9.50, tough (…-TCB-CS-…) £11.50 — the same for every phone model.
const PHONE_CASE = /^GLOBAL-TECH-[A-Z0-9]+-(TCB-)?CS-[GM]$/;
function phoneCaseRow(sku) {
  const m = PHONE_CASE.exec(sku);
  return m ? { cost: m[1] ? 1150 : 950, ship: 595, extra: 50, method: 'express', src: 'GB' } : null;
}
/** Cheapest landed GB row for the SKU on the chosen shipping method (ties → GB source). */
function landed(sku, method) {
  if (!bySku.has(sku)) { const c = phoneCaseRow(sku); if (c) bySku.set(sku, [c]); }
  const rows = (bySku.get(sku) ?? []).filter((r) => r.method === method);
  if (!rows.length) return null;
  return rows.reduce((best, r) => (r.cost + r.ship < best.cost + best.ship ? r : best));
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const rows = await sql`
  select p.key, p.label, p.visible_in_shop as shop, v.price_pence as price, v.sku as variant_sku, v.attributes as attrs, pvp.provider_sku as sku
  from products p join product_variants v on v.product_id = p.id
  left join product_variant_providers pvp on pvp.variant_id = v.id
  where p.active and v.active and pvp.provider_sku is not null`;
if (process.argv.includes('--write-costs')) {
  let written = 0;
  for (const r of rows) {
    const l = landed(r.sku, SHIP_METHOD[r.key] ?? 'standard') ?? landed(r.sku, 'budget') ?? landed(r.sku, 'express');
    if (!l) continue;
    // a card PACK is N of the single card's SKU in one parcel (flat card post): N × the card + one post
    const n = r.key === 'cardPack' ? Number(/^pack of (\d+)$/.exec(r.attrs?.size ?? '')?.[1] ?? NaN) : 1;
    if (!Number.isInteger(n) || n < 1) continue;
    const extra = r.key === 'cardPack' ? n * (l.extra ?? 0) : l.extra;
    await sql`update product_variants set unit_cost_pence = ${n * l.cost + l.ship}, post_first_pence = ${l.ship}, post_extra_pence = ${extra} where sku = ${r.variant_sku}`;
    written++;
  }
  console.error(`unit costs written for ${written}/${rows.length} variants`);
}
await sql.end();

const econ = (P, C, S) => {
  const R = P / (1 + VAT), F = STRIPE_PCT * P + STRIPE_FIXED;
  return { R, F, M: R - C - S - F };
};
/** Largest % off (whole %) leaving at least `floor` pence contribution. */
const maxPct = (P, C, S, floor) => {
  let d = 0;
  while (d < 100 && econ(P * (1 - (d + 1) / 100), C, S).M >= floor) d++;
  return d;
};
/** Largest whole-£ voucher leaving at least `floor` pence contribution. */
const maxPounds = (P, C, S, floor) => {
  let v = 0;
  while (v * 100 + 100 < P && econ(P - (v + 1) * 100, C, S).M >= floor) v++;
  return v;
};

// One line per distinct (product, sku, price).
const seen = new Map();
for (const r of rows) {
  const k = `${r.key}|${r.sku}|${r.price}`;
  if (!seen.has(k)) seen.set(k, r);
}
const lines = [];
for (const r of seen.values()) {
  const l = landed(r.sku, SHIP_METHOD[r.key] ?? 'standard') ?? landed(r.sku, 'budget') ?? landed(r.sku, 'express');
  if (!l) { lines.push({ ...r, missing: true }); continue; }
  const { R, F, M } = econ(r.price, l.cost, l.ship);
  lines.push({
    ...r, cost: l.cost, ship: l.ship, R, F, M, marginPct: (M / R) * 100,
    breakEvenPct: maxPct(r.price, l.cost, l.ship, 0),
    pctKeep10: maxPct(r.price, l.cost, l.ship, 0.10 * R),     // keep ≥10% of full-price ex-VAT revenue
    poundsKeep10: maxPounds(r.price, l.cost, l.ship, 0.10 * R),
    m5: econ(r.price - 500, l.cost, l.ship).M, m10: econ(r.price - 1000, l.cost, l.ship).M,
    m10pct: econ(r.price * 0.9, l.cost, l.ship).M, m15pct: econ(r.price * 0.85, l.cost, l.ship).M,
  });
}
lines.sort((a, b) => Number(b.shop) - Number(a.shop) || a.key.localeCompare(b.key) || a.price - b.price);

const f = (p) => (p / 100).toFixed(2);
const sg = (p) => (p < 0 ? `**−£${f(-p)}**` : `£${f(p)}`);
const md = [
  '# Discount headroom per product (live prices × Prodigi costs)',
  '',
  'Contribution = ex-VAT revenue − product − shipping − card fee. VAT is reclaimable/payable, so it is not profit.',
  '"Keep 10%" = the deepest discount that still leaves ≥10% of the full-price ex-VAT revenue as contribution.',
  '',
  '| Product | Supplier SKU | Price | Cost | Ship | Card fee | **Contribution** | Margin | Break-even % off | Max % (keep 10%) | Max £ (keep 10%) | After £5 off | After £10 off | After 10% off | After 15% off |',
  '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
];
const csv = ['product,in_shop,sku,price,cost,ship,card_fee,contribution,margin_pct,breakeven_pct,max_pct_keep10,max_pounds_keep10,after_5_off,after_10_off,after_10pct,after_15pct'];
for (const x of lines) {
  if (x.missing) { md.push(`| ${x.label}${x.shop ? '' : ' _(hidden)_'} | ${x.sku} | £${f(x.price)} | _no cost data_ |||||||||||`); continue; }
  md.push(`| ${x.label}${x.shop ? '' : ' _(hidden)_'} | ${x.sku} | £${f(x.price)} | £${f(x.cost)} | £${f(x.ship)} | £${f(x.F)} | **£${f(x.M)}** | ${x.marginPct.toFixed(0)}% | ${x.breakEvenPct}% | ${x.pctKeep10}% | £${x.poundsKeep10} | ${sg(x.m5)} | ${sg(x.m10)} | ${sg(x.m10pct)} | ${sg(x.m15pct)} |`);
  csv.push([x.key, x.shop, x.sku, f(x.price), f(x.cost), f(x.ship), f(x.F), f(x.M), x.marginPct.toFixed(1), x.breakEvenPct, x.pctKeep10, x.poundsKeep10, f(x.m5), f(x.m10), f(x.m10pct), f(x.m15pct)].join(','));
}
writeFileSync('.prodigi-assets/DISCOUNT-HEADROOM.md', md.join('\n') + '\n');
writeFileSync('.prodigi-assets/discount-headroom.csv', csv.join('\n') + '\n');
console.log(md.join('\n'));
