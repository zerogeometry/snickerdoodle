// One-off: compute founder-approved retail prices for the catalogue from the captured
// Prodigi cost sheets (.prodigi-assets/pricing/). For each SKU it picks the CHEAPEST LANDED
// (cost + Standard shipping) production source that ships to GB, converts to GBP, applies the
// PRICING.md formula, and writes a review table to .prodigi-assets/PRICE-LIST.md.
//
// Run: node scripts/price-catalogue.mjs
// Formula MIRRORS src/pricing/retail.ts (the tested canonical).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = '.prodigi-assets/pricing';
// FX to GBP (approx, mid-2026 — slightly conservative to protect margin; refine later).
const FX = { GBP: 1, EUR: 0.87, USD: 0.8 };
const HIGH_SHIP_PENCE = 1200; // flag products whose cheapest GB route still ships dear

// ── formula (mirror of src/pricing/retail.ts) ───────────────────────────────
const RETAIL = { marginRate: 0.25, vatRate: 0.2, stripePct: 0.015, stripeFixedPence: 20 };
const roundUpToX9 = (p) => Math.floor(Math.ceil(p - 1e-6) / 10) * 10 + 9;
function computeRetail(costP, shipP) {
  const denom = 1 - RETAIL.marginRate - RETAIL.stripePct * (1 + RETAIL.vatRate);
  return roundUpToX9(((costP + shipP + RETAIL.stripeFixedPence) / denom) * (1 + RETAIL.vatRate));
}
const gbp = (p) => '£' + (p / 100).toFixed(2);

// ── CSV (handles quoted commas + variable columns) ──────────────────────────
function parseLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = parseLine(l); const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

// ── load GB+Standard rows, keep ALL source options per SKU ──────────────────
const toGbpPence = (v, cur) => { const n = parseFloat(v); if (!Number.isFinite(n)) return NaN; return Math.round(n * 100 * (FX[cur] ?? 1)); };
const bySku = new Map();
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.csv')) continue;
  for (const r of parseCsv(readFileSync(path.join(DIR, f), 'utf8'))) {
    if (r['Destination country'] !== 'GB') continue;
    if ((r['Shipping method'] || '').toLowerCase() !== 'standard') continue;
    const sku = r['SKU']; if (!sku) continue;
    const cost = toGbpPence(r['Product price'], r['Product currency']);
    const ship = toGbpPence(r['Shipping price'], r['Shipping currency']);
    if (!Number.isFinite(cost)) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push({ cost, ship: Number.isFinite(ship) ? ship : 0, src: r['Source country'], cur: r['Product currency'] });
  }
}
// per SKU: the cheapest LANDED (cost+ship) source variant, and the range across colour/size.
function variantsForSku(sku) {
  const rows = bySku.get(sku); if (!rows?.length) return null;
  // group identical (cost,ship,src) — but for range we just need landed extremes among cheapest-source.
  // Pick the source country with the lowest median landed, then report its cost/ship spread.
  // Simpler + safe: per row landed = cost+ship; choose the row-set sharing the min source's shipping.
  const minLanded = Math.min(...rows.map((r) => r.cost + r.ship));
  const bestSrc = rows.find((r) => r.cost + r.ship === minLanded).src;
  const best = rows.filter((r) => r.src === bestSrc);
  return {
    minCost: Math.min(...best.map((r) => r.cost)),
    maxCost: Math.max(...best.map((r) => r.cost)),
    ship: Math.min(...best.map((r) => r.ship)),
    maxShip: Math.max(...best.map((r) => r.ship)),
    src: bestSrc, cur: best[0].cur,
  };
}

// ── the founder's product list (from the Google sheet) ──────────────────────
const PRODUCTS = [
  { name: 'Stretched canvas', skus: ['GLOBAL-CAN-12X16', 'GLOBAL-CAN-16X20', 'GLOBAL-CAN-24X32', 'GLOBAL-CAN-28X40', 'GLOBAL-CAN-30X40'] },
  { name: 'Eco canvas', skus: ['ECO-CAN-8X8', 'ECO-CAN-16X16', 'ECO-CAN-8X12', 'ECO-CAN-16X24', 'ECO-CAN-20X30'] },
  { name: 'Classic frame', skus: ['GLOBAL-CFP-11X14', 'GLOBAL-CFP-12X16', 'GLOBAL-CFP-18X24', 'GLOBAL-CFP-24X32', 'GLOBAL-CFP-28X40'] },
  { name: 'Glow-in-dark framed poster', skus: ['FRA-CLA-GITD-6X6', 'FRA-CLA-GITD-A4', 'FRA-CLA-GITD-10X10', 'FRA-CLA-GITD-12X16', 'FRA-CLA-GITD-30X40', 'FRA-CLA-GITD-40X40'] },
  { name: 'Kiss-cut sticker', skus: ['M-STI-3X4', 'M-STI-5_5X5_5', 'M-STI-8_5X8_5', 'M-STI-14X14'] },
  { name: 'Wall sticker', skus: ['WALL-STKR-A4', 'WALL-STKR-400X500', 'WALL-STKR-600X600', 'WALL-STKR-800X800', 'WALL-STKR-A0', 'WALL-STKR-1000X4000'] },
  { name: 'Magnets', skus: ['MAG-1-10X10', 'MAG-1-15X15', 'MAG-4-10X10', 'MAG-4-15X15', 'MAG-9-15X15'] },
  { name: 'Mousemat', skus: ['GLOBAL-MOUSEMAT'] },
  { name: 'Large mug 15oz', skus: ['H-MUG-15OZ-W'] },
  { name: 'Coloured mug 11oz', skus: ['H-MUG-11OZ-BLA', 'H-MUG-11OZ-BLU', 'H-MUG-11OZ-RED', 'H-MUG-11OZ-YLW', 'H-MUG-11OZ-PNK', 'H-MUG-11OZ-LIGR'] },
  { name: 'Travel mug', skus: ['H-MUG-METAL-16OZ-B'] },
  { name: 'Insulated water bottle', skus: ['650ML-WATER-BOTTLE'] },
  { name: 'Cushion', skus: ['GLOBAL-CUSH-24X24-SUE', 'GLOBAL-CUSH-24X24-LIN', 'GLOBAL-CUSH-18R-SCSSS', 'GLOBAL-CUSH-SH-SCSSS', 'GLOBAL-CUSH-12X12-LIN-DUAL', 'GLOBAL-CUSH-22X22-SUE-DUAL'] },
  { name: 'Tea towel', skus: ['H-TEATOWEL-SUB'] },
  { name: 'Adults apron', skus: ['H-APR-AA-BTIE', 'H-APR-AA-WTIE'] },
  { name: "Children's apron", skus: ['H-APR-CA-BTIE', 'H-APR-CA-WTIE'] },
  { name: 'Pillow case', skus: ['GLOBAL-PLWCASE-TAUPE-30X22-STD', 'GLOBAL-PLWCASE-TAUPE-38X22-KING'] },
  { name: 'Duvet cover', skus: ['GLOBAL-DUVET-WHI-70X93', 'GLOBAL-DUVET-NAT-70X93', 'GLOBAL-DUVET-WHI-90X90', 'GLOBAL-DUVET-NAT-90X90', 'GLOBAL-DUVET-WHI-106X90', 'GLOBAL-DUVET-NAT-106X90'] },
  { name: 'Curtains', skus: ['GLOBAL-CURT-BLKOUT-50X84', 'GLOBAL-CURT-SHEER-50X84'] },
  { name: 'Clock', skus: ['WALL-CLOCK-10X10'] },
  { name: 'Fleece blanket', skus: ['H-BLA-PBLWHITE', 'H-BLA-PBLPINK', 'H-BLA-PBMWHITE', 'H-BLA-PBMPINK', 'H-BLA-PBMBLUE'] },
  { name: 'Dog bandana', skus: ['PET-BANDANA-SML', 'PET-BANDANA-MED', 'PET-BANDANA-LRG'] },
  { name: "Kid's towel", skus: ['H-TOW-PTM'] },
  { name: 'Adults towel', skus: ['H-TOW-PTL'] },
  { name: 'Ceramic Xmas ornament', skus: ['XMAS-PORC-BAUB'] },
  { name: 'Christmas baubles', skus: ['XMAS-PLAS-BAUB'] },
  { name: 'Christmas sack', skus: ['XMAS-SACK'] },
  { name: 'Greetings cards', skus: ['GLOBAL-GRE-GLOS-6X4-BLA', 'GLOBAL-GRE-GLOS-6X6-BLA', 'GLOBAL-GRE-GLOS-7X5-BLA', 'GLOBAL-GRE-MOH-7X5-BLA', 'GLOBAL-GRE-GLOS-6X4-DIR', 'GLOBAL-GRE-MOH-7X5-DIR'] },
  { name: 'Invitations', skus: ['CLASSIC-INV-GLOS-6X6', 'CLASSIC-INV-GLOS-6X6-10'] },
  { name: 'Wrapping paper', skus: ['WRAP-1-50X70', 'WRAP-1-75X90', 'WRAP-3-50X70', 'WRAP-3-75X90', 'WRAP-ROL-70X100'] },
  { name: 'Calendars', skus: ['CALENDAR-A4-L-DATED', 'CALENDAR-A5-L-DATED'] },
  { name: "Men's organic cotton tee", skus: ['TEE-SS-STTM559'] },
  { name: "Men's organic cotton hoodie", skus: ['HOOD-SS-STSU812'] },
  { name: "Women's cotton tee", skus: ['GLOBAL-TEE-BC-6004'] },
  { name: "Women's hoodie", skus: ['HOOD-AWD-JH001F'] },
  { name: 'Baby bodysuit (long sleeve)', skus: ['GLOBAL-BB-RS-4411'] },
  { name: 'Baby bodysuit (short sleeve)', skus: ['GLOBAL-BB-RS-4424'] },
  { name: 'Baby cotton tee', skus: ['GLOBAL-TEE-RS-3322'] },
  { name: 'Baby bib', skus: ['GLOBAL-BIB-RS-1004'] },
  { name: 'Kids organic cotton tee', skus: ['TEE-SS-STTK909'] },
  { name: 'Kids hoodie', skus: ['HOOD-SS-STSK911', 'STSK911'] },
  { name: 'Kids sweatshirt', skus: ['SWEAT-SS-STSK913'] },
  { name: 'Cotton tote bag', skus: ['H-BAG-LTOTE'] },
  { name: 'Canvas tote bag', skus: ['H-BAG-CTB'] },
  { name: 'Ankle socks', skus: ['GLOBAL-ANKLE-SOCKS'] },
  { name: 'Tube socks', skus: ['GLOBAL-TUBE-SOCKS'] },
];

const lines = ['# Computed retail price list (for approval)', '',
  'Free Standard delivery baked in · 25% margin on ex-VAT · +20% VAT · rounded to .x9. Cheapest GB-landed source per SKU; FX→GBP USD ' + FX.USD + ', EUR ' + FX.EUR + '.', '',
  '| Product | SKUs | Source | Prodigi cost (ex-VAT) | Std ship | **Retail (inc VAT)** | flag |',
  '|---|--:|--|--|--:|--|--|'];
const missing = [], flagged = [];
for (const p of PRODUCTS) {
  const vs = p.skus.map(variantsForSku).filter(Boolean);
  if (!vs.length) { missing.push(p.name); lines.push(`| ${p.name} | 0 | — | — | — | _no cost data_ | |`); continue; }
  const minCost = Math.min(...vs.map((v) => v.minCost)), maxCost = Math.max(...vs.map((v) => v.maxCost));
  const ship = Math.min(...vs.map((v) => v.ship)), maxShip = Math.max(...vs.map((v) => v.maxShip));
  const srcs = [...new Set(vs.map((v) => v.src))].join('/');
  const rFrom = computeRetail(minCost, ship), rTo = computeRetail(maxCost, maxShip);
  let flag = '';
  if (maxShip >= HIGH_SHIP_PENCE) { flag = `⚠ ship ${gbp(maxShip)} (${srcs})`; flagged.push(`${p.name} (${srcs}, ship ${gbp(maxShip)})`); }
  const costStr = minCost === maxCost ? gbp(minCost) : `${gbp(minCost)}–${gbp(maxCost)}`;
  const retStr = rFrom === rTo ? `**${gbp(rFrom)}**` : `**${gbp(rFrom)}–${gbp(rTo)}**`;
  lines.push(`| ${p.name} | ${vs.length} | ${srcs} | ${costStr} | ${gbp(ship)} | ${retStr} | ${flag} |`);
}
lines.push('', `_${PRODUCTS.length - missing.length}/${PRODUCTS.length} priced. No cost data: ${missing.join(', ') || 'none'}._`);
if (flagged.length) lines.push('', '**⚠ High-shipping (non-GB sourced — economics questionable):** ' + flagged.join('; ') + '.');

writeFileSync('.prodigi-assets/PRICE-LIST.md', lines.join('\n'));
console.log(lines.join('\n'));
