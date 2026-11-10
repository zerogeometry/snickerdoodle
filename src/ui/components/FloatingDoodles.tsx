import type { CSSProperties } from 'react';
import { brandSeason, type BrandSeason } from '@/lib/brand';

/**
 * Ambient crayon doodles drifting gently *across* each section: the brand's own doodles, the same drawings
 * Snickerdoodle Draw teaches (brand-assets doodle sheets → public/textures/floaters-<season>.webp, built by
 * scripts/textures/build.py). In the Christmas season they're the Christmas set: snowmen, baubles, robins.
 * Decorative only (pointer-events none, aria-hidden), behind the content, reduced-motion-safe (.doodle).
 *
 * The sprite is a MASK: each doodle takes its colour from a token, so `tone` recolours the set to suit
 * each section — on oat, on the sky band, and on the dark cocoa band.
 */
type Tone = 'warm' | 'cool' | 'dark';

// Token names only (globals.css) — the doodles colour themselves via CSS custom properties.
const PALETTES: Record<Tone, { colors: string[]; baseOpacity: number }> = {
  warm: { colors: ['berry', 'sunshine-deep', 'cobalt', 'leaf', 'tomato'].map((t) => `var(--color-${t})`), baseOpacity: 0.3 },
  cool: { colors: ['cobalt', 'berry', 'sunshine-deep', 'cobalt-deep', 'green-save'].map((t) => `var(--color-${t})`), baseOpacity: 0.3 },
  dark: { colors: ['paper', 'sunshine', 'honey-band', 'berry-pale', 'sky'].map((t) => `var(--color-${t})`), baseOpacity: 0.42 },
};

/** The sprite: 4 across, 3 down, one doodle per cell (scripts/textures/build.py FLOATERS, same order). */
const COLS = 4;
const ROWS = 3;
const SPRITE: Record<BrandSeason, string> = {
  everyday: '/textures/floaters-everyday.webp',
  christmas: '/textures/floaters-christmas.webp',
};
// everyday: sun, balloons, star, heart, flower, rainbow, kite, hot-air balloon, rocket, house, snail, butterfly
// christmas: snowman, snowflake, tree, present, bauble, bobble hat, robin, penguin, star, moon, mug, socks

/** One doodle: a square of colour shown through its cell of the sprite. */
function Doodle({ cell, color, size, season }: { cell: number; color: string; size: number; season: BrandSeason }) {
  const x = (cell % COLS) * size;
  const y = Math.floor(cell / COLS) * size;
  const mask = `url(${SPRITE[season]}) -${x}px -${y}px / ${COLS * size}px ${ROWS * size}px no-repeat`;
  return <span className="block" style={{ width: size, height: size, background: color, WebkitMask: mask, mask }} />;
}

type Item = {
  cell: number; // which doodle (sprite cell, 0–11)
  top: string;
  left: string;
  s: number; // size (px)
  fx: number; // horizontal drift (px) — the "across the scene" travel
  dist: number; // vertical drift (px)
  dur: number;
  delay: number;
  rot: number;
  spin: number;
  ci: number; // colour index into the tone palette
  op?: number;
};

const LAYOUT: Item[] = [
  { cell: 1, top: '9%', left: '7%', s: 58, fx: 40, dist: -46, dur: 19, delay: -2, rot: -6, spin: 5, ci: 0 },
  { cell: 3, top: '17%', left: '84%', s: 46, fx: -62, dist: -30, dur: 16, delay: -5, rot: 8, spin: 6, ci: 1 },
  { cell: 2, top: '60%', left: '9%', s: 46, fx: 74, dist: -40, dur: 21, delay: -8, rot: -12, spin: 20, ci: 2 },
  { cell: 5, top: '8%', left: '50%', s: 60, fx: 96, dist: -18, dur: 26, delay: -3, rot: 0, spin: 0, ci: 3, op: 0.85 },
  { cell: 6, top: '40%', left: '88%', s: 52, fx: -54, dist: -34, dur: 17, delay: -6, rot: 10, spin: 0, ci: 4 },
  { cell: 0, top: '72%', left: '80%', s: 50, fx: -68, dist: -26, dur: 23, delay: -4, rot: 0, spin: 14, ci: 1 },
  { cell: 7, top: '52%', left: '90%', s: 54, fx: -42, dist: -58, dur: 20, delay: -9, rot: 5, spin: 5, ci: 2 },
  { cell: 9, top: '80%', left: '27%', s: 52, fx: 60, dist: -22, dur: 22, delay: -7, rot: 6, spin: 0, ci: 0 },
  { cell: 11, top: '44%', left: '4%', s: 46, fx: 84, dist: -40, dur: 18, delay: -10, rot: 14, spin: -16, ci: 3 },
  { cell: 4, top: '83%', left: '60%', s: 46, fx: -50, dist: -30, dur: 19, delay: -1, rot: -8, spin: 6, ci: 4, op: 0.9 },
];

export function FloatingDoodles({ tone = 'warm' }: { tone?: Tone }) {
  const pal = PALETTES[tone];
  const season = brandSeason();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {LAYOUT.map((it, i) => {
        const color = pal.colors[it.ci % pal.colors.length] ?? 'currentColor';
        const style = {
          top: it.top,
          left: it.left,
          opacity: pal.baseOpacity * (it.op ?? 1),
          '--float-dur': `${it.dur}s`,
          '--float-delay': `${it.delay}s`,
          '--float-x': `${it.fx}px`,
          '--float-dist': `${it.dist}px`,
          '--float-rot': `${it.rot}deg`,
          '--float-spin': `${it.spin}deg`,
        } as unknown as CSSProperties;
        return (
          <span key={i} className="doodle" style={style}>
            <Doodle cell={it.cell} color={color} size={it.s} season={season} />
          </span>
        );
      })}
    </div>
  );
}
