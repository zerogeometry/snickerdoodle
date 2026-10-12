import type { CSSProperties, ReactElement } from 'react';

/**
 * Ambient crayon doodles — hearts, stars, clouds, squiggles, suns, balloons, a
 * little house — drifting gently *across* each section. Decorative only
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

type ShapeFn = (color: string, scale: number) => ReactElement;

const Heart: ShapeFn = (c, s) => (
  <svg width={44 * s} height={44 * s} viewBox="0 0 24 24">
    <path d="M12 21 C5 15 3 11 6 8 C8 6 11 7 12 9 C13 7 16 6 18 8 C21 11 19 15 12 21 Z" fill={c} />
  </svg>
);
const Star: ShapeFn = (c, s) => (
  <svg width={40 * s} height={40 * s} viewBox="0 0 24 24">
    <polygon points="12,2 14.6,9 22,9 16,13.6 18.4,21 12,16.6 5.6,21 8,13.6 2,9 9.4,9" fill={c} />
  </svg>
);
const Cloud: ShapeFn = (c, s) => (
  <svg width={58 * s} height={38 * s} viewBox="0 0 58 38">
    <path d="M15 32 a11 11 0 0 1 0 -22 a13 13 0 0 1 24 -2 a10 10 0 0 1 5 24 Z" fill={c} />
  </svg>
);
const Squiggle: ShapeFn = (c, s) => (
  <svg width={64 * s} height={24 * s} viewBox="0 0 64 24">
    <path d="M2 12 q8 -11 16 0 t16 0 t16 0 t12 0" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const Sun: ShapeFn = (c, s) => (
  <svg width={42 * s} height={42 * s} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" fill={c} />
    <g stroke={c} strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="1" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
      <line x1="4.2" y1="4.2" x2="6" y2="6" />
      <line x1="18" y1="18" x2="19.8" y2="19.8" />
      <line x1="4.2" y1="19.8" x2="6" y2="18" />
      <line x1="18" y1="6" x2="19.8" y2="4.2" />
    </g>
  </svg>
);
const Balloon: ShapeFn = (c, s) => (
  <svg width={34 * s} height={52 * s} viewBox="0 0 34 52">
    <ellipse cx="17" cy="17" rx="14" ry="16" fill={c} />
    <path d="M17 33 l-3 5 h6 z" fill={c} />
    <path d="M17 38 q5 7 0 13" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const House: ShapeFn = (c, s) => (
  <svg width={46 * s} height={42 * s} viewBox="0 0 48 44">
    <rect x="10" y="20" width="22" height="18" fill="none" stroke={c} strokeWidth="2.4" />
    <path d="M6 22 L21 9 L36 22" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="40" cy="10" r="3" fill={c} />
  </svg>
);

const SHAPES = { heart: Heart, star: Star, cloud: Cloud, squiggle: Squiggle, sun: Sun, balloon: Balloon, house: House };

type Item = {
  shape: keyof typeof SHAPES;
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
        const Shape = SHAPES[it.shape];
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
            {Shape(color, it.s)}
          </span>
        );
      })}
    </div>
  );
}
