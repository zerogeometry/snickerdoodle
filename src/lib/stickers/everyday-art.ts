/**
 * The EVERYDAY sticker set — brand doodles in the Scrapbook style (D12): bold crayon colours and a
 * chunky cocoa ink line, straight on the canvas (no white die-cut border or shadow — founder, 26 Oct).
 * Pure data + SVG text: the Studio preview and the print renderer draw these exact strings
 * (preview == print), in the same square 200 × 200 frame as the Christmas family.
 *
 * Colours are the brand palette (src/app/globals.css @theme) as print colours.
 */
const INK = '#2b2118', PAPER = '#fffbf2', TOMATO = '#c8402a', HONEY = '#f6c445', SKY = '#8fb5d6', BERRY = '#e8786e', LEAF = '#7fa65e', COBALT = '#2f5da8';

export const EVERYDAY_IDS = ['heart', 'happyStar', 'sun', 'rainbow', 'flower', 'crown', 'cloud', 'sparkle', 'squiggle'] as const;
export type EverydayStickerId = (typeof EVERYDAY_IDS)[number];

/** A filled piece (ink-outlined) or a crayon line (ink-edged). Coordinates on a 100×100 box. */
type Part = { d: string; fill: string; ink?: number } | { line: string; colour: string; w: number };

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const eyes = (y: number, dx = 9, cx = 50): Part[] => [
  { d: circle(cx - dx, y, 3.4), fill: INK, ink: 0 },
  { d: circle(cx + dx, y, 3.4), fill: INK, ink: 0 },
];
const smile = (y: number, w = 10, cx = 50): Part => ({ line: `M${cx - w} ${y} Q${cx} ${y + 8} ${cx + w} ${y}`, colour: INK, w: 3.6 });

const PARTS: Record<EverydayStickerId, Part[]> = {
  heart: [
    { d: 'M50 88 C22 68 7 53 7 33 C7 18 18 9 31 9 C40 9 46 14 50 22 C54 14 60 9 69 9 C82 9 93 18 93 33 C93 53 78 68 50 88 Z', fill: BERRY },
    { line: 'M22 32 Q23 22 32 19', colour: PAPER, w: 5 },
  ],
  happyStar: [{ d: 'M50 6 L62 36 L94 37 L68 57 L77 90 L50 71 L23 90 L32 57 L6 37 L38 36 Z', fill: HONEY }, ...eyes(50, 8), smile(60, 7)],
  sun: [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => {
      const r = (a * Math.PI) / 180;
      const p = (k: number) => `${(50 + Math.cos(r) * k).toFixed(1)} ${(50 + Math.sin(r) * k).toFixed(1)}`;
      return { line: `M${p(33)} L${p(44)}`, colour: TOMATO, w: 7 };
    }),
    { d: circle(50, 50, 24), fill: HONEY },
    ...eyes(46, 8),
    smile(56, 8),
  ],
  rainbow: [
    { d: 'M6 72 A44 44 0 0 1 94 72 L82 72 A32 32 0 0 0 18 72 Z', fill: TOMATO },
    { d: 'M18 72 A32 32 0 0 1 82 72 L71 72 A21 21 0 0 0 29 72 Z', fill: HONEY },
    { d: 'M29 72 A21 21 0 0 1 71 72 L61 72 A11 11 0 0 0 39 72 Z', fill: SKY },
    { d: 'M2 80 Q2 68 14 68 Q20 60 28 68 Q34 70 32 80 Z', fill: PAPER },
    { d: 'M68 80 Q66 70 72 68 Q80 60 86 68 Q98 68 98 80 Z', fill: PAPER },
  ],
  flower: [
    { line: 'M50 66 Q46 82 52 96', colour: LEAF, w: 7 },
    ...[0, 72, 144, 216, 288].map((a): Part => {
      const r = ((a - 90) * Math.PI) / 180;
      return { d: circle(+(50 + Math.cos(r) * 21).toFixed(1), +(44 + Math.sin(r) * 21).toFixed(1), 15), fill: BERRY };
    }),
    { d: circle(50, 44, 13), fill: HONEY },
  ],
  crown: [
    { d: 'M14 76 L9 30 L32 50 L50 18 L68 50 L91 30 L86 76 Z', fill: HONEY },
    { d: 'M14 76 H86 V88 H14 Z', fill: HONEY },
    { d: circle(30, 66, 5), fill: BERRY },
    { d: circle(50, 64, 6), fill: SKY },
    { d: circle(70, 66, 5), fill: BERRY },
  ],
  cloud: [
    { d: 'M27 78 Q8 78 8 61 Q8 46 23 44 Q24 27 43 27 Q55 14 70 26 Q91 27 92 48 Q95 62 85 69 Q84 78 72 78 Z', fill: PAPER },
    ...eyes(54, 10),
    { d: circle(30, 62, 4.5), fill: BERRY, ink: 0 },
    { d: circle(70, 62, 4.5), fill: BERRY, ink: 0 },
    smile(60, 6),
  ],
  sparkle: [
    { d: 'M46 8 Q52 44 88 50 Q52 56 46 92 Q40 56 4 50 Q40 44 46 8 Z', fill: HONEY },
    { d: 'M80 6 Q82 17 93 19 Q82 21 80 32 Q78 21 67 19 Q78 17 80 6 Z', fill: SKY },
  ],
  squiggle: [{ line: 'M10 62 C18 30 32 30 38 50 S56 72 64 46 S86 22 92 40', colour: COBALT, w: 11 }],
};

/** Ink line + crayon fill, the 100-box art fitted (with room for the ink) into the 200 frame. */
function svgOf(parts: Part[]): string {
  const art = parts
    .map((p) =>
      'd' in p
        ? `<path d="${p.d}" fill="${p.fill}"${p.ink === 0 ? '' : ` stroke="${INK}" stroke-width="${p.ink ?? 5}" stroke-linejoin="round"`}/>`
        : p.colour === INK || p.colour === PAPER
          ? `<path d="${p.line}" fill="none" stroke="${p.colour}" stroke-width="${p.w}" stroke-linecap="round"/>`
          : `<path d="${p.line}" fill="none" stroke="${INK}" stroke-width="${p.w + 7}" stroke-linecap="round" stroke-linejoin="round"/><path d="${p.line}" fill="none" stroke="${p.colour}" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><g transform="translate(14 14) scale(1.72)">${art}</g></svg>`;
}

export const EVERYDAY_STICKER_SVG = Object.fromEntries(EVERYDAY_IDS.map((id) => [id, svgOf(PARTS[id])])) as Record<EverydayStickerId, string>;
