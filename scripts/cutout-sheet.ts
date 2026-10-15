/**
 * Background-removal comparison sheet: for each test drawing, the original, then the OLD flood
 * cutout and the NEW ink-lift (soft + firm) composited on the colours art actually gets printed on
 * — white, black, navy, red, kraft. "Works across colours" becomes something you can see.
 *
 *   npx tsx scripts/cutout-sheet.ts [inputDir] [out.png]
 *
 * With no inputDir, it uses built-in synthetic drawings that reproduce the known failure cases
 * (enclosed paper, pencil halo, shadowed paper, pale crayon, kraft paper + white paint). Put real
 * photos in a GIT-IGNORED folder (never commit children's art) and pass it as inputDir.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { removeBackground } from '../src/ml/client';
import { liftInk } from '../src/ml/inkLift';

const CELL = 260;
const LABEL = 22;
const BACKS: [string, string][] = [
  ['white', '#ffffff'],
  ['black', '#111111'],
  ['navy', '#1f2b4d'],
  ['red', '#b3262a'],
  ['kraft', '#c8a57a'],
];

export async function syntheticDrawings(): Promise<{ name: string; buf: Buffer }[]> {
  const W = 900, H = 700;
  const shadow = (paper: string) => `
    <defs>
      <radialGradient id="light" cx="30%" cy="25%" r="95%">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.32"/>
      </radialGradient>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="${paper}"/>`;
  const overlay = `<rect width="${W}" height="${H}" filter="url(#grain)"/><rect width="${W}" height="${H}" fill="url(#light)"/>`;
  const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`);

  const house = svg(`${shadow('#f7f4ec')}
    <path d="M260 330 L450 170 L640 330 Z" fill="#c8402a" stroke="#7a1d10" stroke-width="10" stroke-linejoin="round"/>
    <rect x="300" y="330" width="300" height="230" fill="none" stroke="#2f5da8" stroke-width="12"/>
    <rect x="345" y="380" width="70" height="70" fill="none" stroke="#2f5da8" stroke-width="8"/>
    <rect x="480" y="440" width="70" height="120" fill="none" stroke="#2f5da8" stroke-width="8"/>
    <circle cx="760" cy="140" r="70" fill="#fbe36a"/>
    <path d="M90 600 C 200 560, 300 640, 420 590 S 650 560, 820 610" fill="none" stroke="#7fa65e" stroke-width="14" stroke-linecap="round"/>
    ${overlay}`);

  const pencil = svg(`${shadow('#fbfaf6')}
    <g fill="none" stroke="#55575c" stroke-width="2.2" stroke-linecap="round" opacity="0.85">
      <circle cx="450" cy="230" r="90"/><circle cx="420" cy="215" r="10"/><circle cx="480" cy="215" r="10"/>
      <path d="M410 265 Q450 295 490 265"/><path d="M450 320 L450 520 M450 380 L360 440 M450 380 L540 440 M450 520 L390 640 M450 520 L510 640"/>
    </g>
    <path d="M120 120 L300 120" stroke="#f2b6c8" stroke-width="18" stroke-linecap="round"/>
    <text x="120" y="680" font-family="Comic Sans MS, sans-serif" font-size="56" fill="#3b5bd1">MUMMY</text>
    ${overlay}`);

  const kraft = svg(`${shadow('#b98b57')}
    <circle cx="300" cy="300" r="140" fill="none" stroke="#fdfdf8" stroke-width="22"/>
    <path d="M180 520 Q450 380 720 520" fill="none" stroke="#fdfdf8" stroke-width="18" stroke-linecap="round"/>
    <rect x="560" y="140" width="200" height="200" rx="30" fill="#2b2118"/>
    <circle cx="660" cy="240" r="45" fill="#e8786e"/>
    ${overlay}`);

  return [
    { name: 'house · enclosed paper + shadow', buf: await sharp(house).jpeg({ quality: 82 }).toBuffer() },
    { name: 'pencil · thin lines + pale pink', buf: await sharp(pencil).jpeg({ quality: 82 }).toBuffer() },
    { name: 'kraft paper · white paint', buf: await sharp(kraft).jpeg({ quality: 82 }).toBuffer() },
  ];
}

async function tile(cut: Buffer | null, back: string): Promise<Buffer> {
  const base = sharp({ create: { width: CELL, height: CELL, channels: 4, background: back } });
  if (!cut) {
    const x = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#888">no paper found — needs tap-to-remove</text></svg>`);
    return base.composite([{ input: x }]).png().toBuffer();
  }
  const fitted = await sharp(cut).resize(CELL - 20, CELL - 20, { fit: 'inside' }).png().toBuffer();
  return base.composite([{ input: fitted, gravity: 'centre' }]).png().toBuffer();
}

async function labelBar(text: string, width: number): Promise<Buffer> {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}"><rect width="100%" height="100%" fill="#2b2118"/><text x="8" y="16" font-family="sans-serif" font-size="14" fill="#fff">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`)).png().toBuffer();
}

async function main() {
  const [inputDir, outPath = 'cutout-sheet.png'] = process.argv.slice(2);
  const inputs = inputDir
    ? readdirSync(inputDir)
        .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f))
        .map((f) => ({ name: f, buf: readFileSync(path.join(inputDir, f)) }))
    : await syntheticDrawings();

  const rows: Buffer[] = [];
  const width = CELL * (1 + BACKS.length);
  for (const { name, buf } of inputs) {
    const old = await removeBackground(buf).then((r) => (r.removedFraction > 0 ? r.buffer : null)).catch(() => null);
    const soft = await liftInk(buf, { edge: 'soft' });
    const firm = await liftInk(buf, { edge: 'firm' });
    const orig = await sharp(buf).rotate().resize(CELL - 10, CELL - 10, { fit: 'inside' }).png().toBuffer();
    const origTile = await sharp({ create: { width: CELL, height: CELL, channels: 4, background: '#eeeeee' } }).composite([{ input: orig, gravity: 'centre' }]).png().toBuffer();
    for (const [label, cut] of [['old flood', old], ['new · soft (prints, mugs)', soft?.buffer ?? null], ['new · firm (dark garments)', firm?.buffer ?? null]] as const) {
      const tiles = [origTile, ...(await Promise.all(BACKS.map(([, c]) => tile(cut, c))))];
      const row = await sharp({ create: { width, height: CELL + LABEL, channels: 4, background: '#ffffff' } })
        .composite([
          { input: await labelBar(`${name}  —  ${label}${soft && label !== 'old flood' ? `  ·  paper rgb(${soft.paper.r},${soft.paper.g},${soft.paper.b})` : ''}`, width), left: 0, top: 0 },
          ...tiles.map((t, k) => ({ input: t, left: k * CELL, top: LABEL })),
        ])
        .png()
        .toBuffer();
      rows.push(row);
    }
  }
  const header = await labelBar(`original  |  ${BACKS.map(([n]) => n).join('  |  ')}`, width);
  const H = LABEL + rows.length * (CELL + LABEL);
  await sharp({ create: { width, height: H, channels: 4, background: '#ffffff' } })
    .composite([{ input: header, left: 0, top: 0 }, ...rows.map((r, k) => ({ input: r, left: 0, top: LABEL + k * (CELL + LABEL) }))])
    .png()
    .toFile(outPath);
  console.log('wrote', outPath, `(${inputs.length} drawings)`);
}

if (process.argv[1] && /cutout-sheet\.ts$/.test(process.argv[1])) void main();
