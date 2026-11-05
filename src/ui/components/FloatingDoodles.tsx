import type { CSSProperties } from 'react';
import { DOODLE_PATHS } from './doodlePaths';

/**
 * Ambient crayon doodles — hearts, stars, clouds, squiggles, suns, balloons, a
 * little house — drifting gently *across* each section. Drawn like a child would
 * (founder, 5 Nov: wobbly, imperfect, uneven line weight — not clean icons). Decorative only
 * (pointer-events none, aria-hidden), behind the content, reduced-motion-safe.
 *
 * `tone` recolours the set to suit each section's background, so the same playful
 * motion reads well on oat, on the sky band, and on the dark cinnamon/cocoa bands.
 */
type Tone = 'warm' | 'cool' | 'dark';

// Token names only (globals.css) — the doodles colour themselves via CSS custom properties.
const PALETTES: Record<Tone, { colors: string[]; baseOpacity: number }> = {
  warm: { colors: ['berry', 'sunshine', 'sky', 'leaf', 'tomato'].map((t) => `var(--color-${t})`), baseOpacity: 0.24 },
  cool: { colors: ['paper', 'sunshine', 'berry', 'cobalt-deep', 'green-save'].map((t) => `var(--color-${t})`), baseOpacity: 0.34 },
  dark: { colors: ['paper', 'sunshine', 'honey-band', 'berry-pale', 'sky'].map((t) => `var(--color-${t})`), baseOpacity: 0.5 },
};

/** Native size (px) of each doodle at scale 1 — unchanged from the clean set they replace. */
const SIZE: Record<keyof typeof DOODLE_PATHS, [number, number]> = {
  heart: [44, 44],
  star: [40, 40],
  cloud: [58, 40],
  squiggle: [64, 24],
  sun: [42, 42],
  balloon: [34, 52],
  house: [46, 42],
};

/** One doodle as crayon strokes (wobbly, uneven weight — drawn by scripts/brand/doodle-paths.mjs). */
function Doodle({ shape, color, scale }: { shape: keyof typeof DOODLE_PATHS; color: string; scale: number }) {
  const { vb, strokes } = DOODLE_PATHS[shape];
  const [w, h] = SIZE[shape];
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${vb[0]} ${vb[1]}`} overflow="visible">
      <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
        {strokes.map((st) => (
          <path key={st.w} d={st.d} strokeWidth={st.w} />
        ))}
      </g>
    </svg>
  );
}

type Item = {
  shape: keyof typeof DOODLE_PATHS;
  top: string;
  left: string;
  s: number;
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
  { shape: 'balloon', top: '9%', left: '7%', s: 1.15, fx: 40, dist: -46, dur: 19, delay: -2, rot: -6, spin: 5, ci: 0 },
  { shape: 'heart', top: '17%', left: '84%', s: 1, fx: -62, dist: -30, dur: 16, delay: -5, rot: 8, spin: 6, ci: 1 },
  { shape: 'star', top: '60%', left: '9%', s: 1, fx: 74, dist: -40, dur: 21, delay: -8, rot: -12, spin: 20, ci: 2 },
  { shape: 'cloud', top: '8%', left: '50%', s: 1.15, fx: 96, dist: -18, dur: 26, delay: -3, rot: 0, spin: 0, ci: 3, op: 0.85 },
  { shape: 'squiggle', top: '40%', left: '88%', s: 1, fx: -54, dist: -34, dur: 17, delay: -6, rot: 10, spin: 0, ci: 4 },
  { shape: 'sun', top: '72%', left: '80%', s: 1, fx: -68, dist: -26, dur: 23, delay: -4, rot: 0, spin: 14, ci: 1 },
  { shape: 'balloon', top: '52%', left: '90%', s: 0.95, fx: -42, dist: -58, dur: 20, delay: -9, rot: 5, spin: 5, ci: 2 },
  { shape: 'house', top: '80%', left: '27%', s: 1, fx: 60, dist: -22, dur: 22, delay: -7, rot: 6, spin: 0, ci: 0 },
  { shape: 'star', top: '44%', left: '4%', s: 0.85, fx: 84, dist: -40, dur: 18, delay: -10, rot: 14, spin: -16, ci: 3 },
  { shape: 'heart', top: '83%', left: '60%', s: 0.9, fx: -50, dist: -30, dur: 19, delay: -1, rot: -8, spin: 6, ci: 4, op: 0.9 },
];

export function FloatingDoodles({ tone = 'warm' }: { tone?: Tone }) {
  const pal = PALETTES[tone];
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
            <Doodle shape={it.shape} color={color} scale={it.s} />
          </span>
        );
      })}
    </div>
  );
}
