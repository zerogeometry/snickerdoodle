// Itemised catalogue price breakdown from the captured Prodigi cost sheets
// (.prodigi-assets/pricing/). For each SKU it uses the CHEAPEST LANDED (cost + Standard
// shipping) GB source, converts USD/EUR→GBP, and for every distinct price point emits the
// full margin decomposition. Writes .prodigi-assets/PRICE-BREAKDOWN.md.
//
// Run: node scripts/price-catalogue.mjs   ·   Formula mirrors src/pricing/retail.ts.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = '.prodigi-assets/pricing';
const FX = { GBP: 1, EUR: 0.87, USD: 0.8 };

// ── formula ─────────────────────────────────────────────────────────────────
const R = { marginRate: 0.25, vatRate: 0.2, stripePct: 0.015, stripeFixedPence: 20 };
const K = R.stripePct * (1 + R.vatRate);       // Stripe % effect on ex-VAT (0.018)
const roundUpToX9 = (p) => Math.floor(Math.ceil(p - 1e-6) / 10) * 10 + 9;
// Model A: 25% margin on everything (cost + shipping + fees).
const retailA = (C, S) => roundUpToX9(((C + S + R.stripeFixedPence) / (1 - R.marginRate - K)) * (1 + R.vatRate));
// Model B: shipping recovered at cost (no margin on it), 25% margin on the item only.
const retailB = (C, S) => roundUpToX9((((C + R.stripeFixedPence) / (1 - R.marginRate - K)) + S / (1 - K)) * (1 + R.vatRate));
const f = (p) => (p / 100).toFixed(2);

// ── CSV ─────────────────────────────────────────────────────────────────────
function parseLine(line) { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; }
function parseCsv(t) { const L = t.split(/\r?\n/).filter((l) => l.trim()); const h = parseLine(L[0]).map((x) => x.trim()); return L.slice(1).map((l) => { const cs = parseLine(l); const r = {}; h.forEach((x, i) => (r[x] = (cs[i] ?? '').trim())); return r; }); }

// ── load GB+Standard rows per SKU ───────────────────────────────────────────
const toGbp = (v, cur) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100 * (FX[cur] ?? 1)) : NaN; };
const bySku = new Map();
for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.csv')) continue;
  for (const r of parseCsv(readFileSync(path.join(DIR, file), 'utf8'))) {
    if (r['Destination country'] !== 'GB' || (r['Shipping method'] || '').toLowerCase() !== 'standard') continue;
    const sku = r['SKU']; if (!sku) continue;
    const cost = toGbp(r['Product price'], r['Product currency']); if (!Number.isFinite(cost)) continue;
    const ship = toGbp(r['Shipping price'], r['Shipping currency']);
    const label = r['Size (inches)'] || r['Size'] || r['Size (cm)'] || r['Color'] || '';
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push({ cost, ship: Number.isFinite(ship) ? ship : 0, src: r['Source country'], label });
  }
}
// cheapest-landed source's rows for a SKU
function rowsForSku(sku) {
  const rows = bySku.get(sku); if (!rows?.length) return [];
  const minLanded = Math.min(...rows.map((r) => r.cost + r.ship));
  const src = rows.find((r) => r.cost + r.ship === minLanded).src;
  return rows.filter((r) => r.src === src);
}

const PRODUCTS = [
  { name: 'Stretched canvas', skus: ['GLOBAL-CAN-12X16', 'GLOBAL-CAN-16X20', 'GLOBAL-CAN-24X32', 'GLOBAL-CAN-28X40', 'GLOBAL-CAN-30X40'] },
  { name: 'Eco canvas', skus: ['ECO-CAN-8X8', 'ECO-CAN-16X16', 'ECO-CAN-8X12', 'ECO-CAN-16X24', 'ECO-CAN-20X30'] },
  { name: 'Classic frame', skus: ['GLOBAL-CFP-11X14', 'GLOBAL-CFP-12X16', 'GLOBAL-CFP-18X24', 'GLOBAL-CFP-24X32', 'GLOBAL-CFP-28X40'] },
  { name: 'Glow framed poster', skus: ['FRA-CLA-GITD-6X6', 'FRA-CLA-GITD-A4', 'FRA-CLA-GITD-10X10', 'FRA-CLA-GITD-12X16', 'FRA-CLA-GITD-30X40', 'FRA-CLA-GITD-40X40'] },
  { name: 'Kiss-cut sticker', skus: ['M-STI-3X4', 'M-STI-5_5X5_5', 'M-STI-8_5X8_5', 'M-STI-14X14'] },
  { name: 'Magnets', skus: ['MAG-1-10X10', 'MAG-1-15X15', 'MAG-4-10X10', 'MAG-4-15X15', 'MAG-9-15X15'] },
  { name: 'Mousemat', skus: ['GLOBAL-MOUSEMAT'] },
  { name: 'Large mug 15oz', skus: ['H-MUG-15OZ-W'] },
  { name: 'Coloured mug 11oz', skus: ['H-MUG-11OZ-BLA', 'H-MUG-11OZ-BLU', 'H-MUG-11OZ-RED', 'H-MUG-11OZ-YLW', 'H-MUG-11OZ-PNK', 'H-MUG-11OZ-LIGR'] },
  { name: 'Travel mug', skus: ['H-MUG-METAL-16OZ-B'] },
  { name: 'Water bottle', skus: ['650ML-WATER-BOTTLE'] },
  { name: 'Cushion', skus: ['GLOBAL-CUSH-24X24-SUE', 'GLOBAL-CUSH-24X24-LIN', 'GLOBAL-CUSH-18R-SCSSS', 'GLOBAL-CUSH-SH-SCSSS', 'GLOBAL-CUSH-12X12-LIN-DUAL', 'GLOBAL-CUSH-22X22-SUE-DUAL'] },
  { name: 'Tea towel', skus: ['H-TEATOWEL-SUB'] },
  { name: 'Adults apron', skus: ['H-APR-AA-BTIE', 'H-APR-AA-WTIE'] },
  { name: "Children's apron", skus: ['H-APR-CA-BTIE', 'H-APR-CA-WTIE'] },
  { name: 'Pillow case', skus: ['GLOBAL-PLWCASE-TAUPE-30X22-STD', 'GLOBAL-PLWCASE-TAUPE-38X22-KING'] },
  { name: 'Duvet cover', skus: ['GLOBAL-DUVET-WHI-70X93', 'GLOBAL-DUVET-NAT-70X93', 'GLOBAL-DUVET-WHI-90X90', 'GLOBAL-DUVET-NAT-90X90', 'GLOBAL-DUVET-WHI-106X90', 'GLOBAL-DUVET-NAT-106X90'] },
  { name: 'Curtains', skus: ['GLOBAL-CURT-BLKOUT-50X84', 'GLOBAL-CURT-SHEER-50X84'] },
  { name: 'Clock', skus: ['WALL-CLOCK-10X10'] },
  { name: 'Fleece blanket', skus: ['H-BLA-PBLWHITE', 'H-BLA-PBLPINK', 'H-BLA-PBMWHITE', 'H-BLA-PBMPINK', 'H-BLA-PBMBLUE'] },
  { name: "Kid's towel", skus: ['H-TOW-PTM'] },
  { name: 'Adults towel', skus: ['H-TOW-PTL'] },
  { name: 'Ceramic Xmas ornament', skus: ['XMAS-PORC-BAUB'] },
  { name: 'Christmas baubles', skus: ['XMAS-PLAS-BAUB'] },
  { name: 'Christmas sack', skus: ['XMAS-SACK'] },
  { name: 'Greetings cards', skus: ['GLOBAL-GRE-GLOS-6X4-BLA', 'GLOBAL-GRE-GLOS-6X6-BLA', 'GLOBAL-GRE-GLOS-7X5-BLA', 'GLOBAL-GRE-MOH-7X5-BLA', 'GLOBAL-GRE-GLOS-6X4-DIR', 'GLOBAL-GRE-MOH-7X5-DIR'] },
  { name: 'Wrapping paper', skus: ['WRAP-1-50X70', 'WRAP-1-75X90', 'WRAP-3-50X70', 'WRAP-3-75X90', 'WRAP-ROL-70X100'] },
  { name: "Men's tee", skus: ['TEE-SS-STTM559'] },
  { name: "Men's hoodie", skus: ['HOOD-SS-STSU812'] },
  { name: "Women's tee", skus: ['GLOBAL-TEE-BC-6004'] },
  { name: "Women's hoodie", skus: ['HOOD-AWD-JH001F'] },
  { name: 'Baby bodysuit (LS)', skus: ['GLOBAL-BB-RS-4411'] },
  { name: 'Baby bodysuit (SS)', skus: ['GLOBAL-BB-RS-4424'] },
  { name: 'Baby tee', skus: ['GLOBAL-TEE-RS-3322'] },
  { name: 'Kids tee', skus: ['TEE-SS-STTK909'] },
  { name: 'Kids hoodie', skus: ['HOOD-SS-STSK911', 'STSK911'] },
  { name: 'Cotton tote', skus: ['H-BAG-LTOTE'] },
  { name: 'Canvas tote', skus: ['H-BAG-CTB'] },
  { name: 'Ankle socks', skus: ['GLOBAL-ANKLE-SOCKS'] },
  { name: 'Tube socks', skus: ['GLOBAL-TUBE-SOCKS'] },
];

// ── itemise: one row per distinct (cost, ship) price point ──────────────────
const out = [
  '# Itemised price + margin breakdown (for approval)',
  '',
  'All £, VAT-inclusive retail. Model A = 25% margin on everything (current). Fees = Stripe (1.5% of retail + £0.20). ',
  'Total cost = item + shipping + fees. Profit split proportionally (item vs shipping). "No-ship-margin" = shipping passed at cost, 25% only on the item.',
  '',
  '| Product | variants | item £ | ship £ | fees £ | total cost £ | **retail £** | ship profit £ | item profit £ | margin % | no-ship-margin retail £ |',
  '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
];
let sumProfit = 0, sumShipProfit = 0, n = 0;
for (const p of PRODUCTS) {
  const rows = p.skus.flatMap(rowsForSku);
  if (!rows.length) { out.push(`| ${p.name} | 0 | — | — | — | — | _no data_ | | | | |`); continue; }
  const groups = new Map();
  for (const r of rows) { const k = r.cost + '|' + r.ship; if (!groups.has(k)) groups.set(k, { cost: r.cost, ship: r.ship, labels: new Set(), count: 0 }); const g = groups.get(k); g.labels.add(r.label); g.count++; }
  const pts = [...groups.values()].sort((a, b) => (a.cost + a.ship) - (b.cost + b.ship));
  pts.forEach((g, i) => {
    const P = retailA(g.cost, g.ship), rev = P / 1.2, stripe = R.stripePct * P + R.stripeFixedPence;
    const totalCost = g.cost + g.ship + stripe, profit = rev - totalCost, base = g.cost + g.ship + R.stripeFixedPence;
    const shipProfit = profit * (g.ship / base), itemProfit = profit - shipProfit, margin = profit / rev;
    sumProfit += profit; sumShipProfit += shipProfit; n++;
    const sizes = [...g.labels].filter(Boolean).join(', ').slice(0, 28);
    out.push(`| ${i === 0 ? p.name : '↳'}${sizes ? ' _' + sizes + '_' : ''} | ${g.count} | ${f(g.cost)} | ${f(g.ship)} | ${f(stripe)} | ${f(totalCost)} | **${f(P)}** | ${f(shipProfit)} | ${f(itemProfit)} | ${(margin * 100).toFixed(1)} | ${f(retailB(g.cost, g.ship))} |`);
  });
}
out.push('', `_${n} distinct price points. Avg profit £${f(sumProfit / n)}/item, of which £${f(sumShipProfit / n)} is shipping markup (${(sumShipProfit / sumProfit * 100).toFixed(0)}% of profit comes from marking up shipping — the lever you flagged)._`);

writeFileSync('.prodigi-assets/PRICE-BREAKDOWN.md', out.join('\n'));
console.log(out.join('\n'));
