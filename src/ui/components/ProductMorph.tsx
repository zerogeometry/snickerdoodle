import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../cn';

/**
 * The hero product-morph: Olivia's drawing crossfades through products and back,
 * floating freely on the page (no frame). Pure CSS (compositor-driven), staggered
 * per frame, reduced-motion-safe (freezes on the drawing).
 *
 * Each frame shares the 220×220 canvas, is drawn centred at a consistent (large)
 * scale, and gets a slight playful tilt so it never sits dead straight.
 */

// picture → t-shirt → mug → sticker → tote → (loops back to picture)
const FRAMES: ReactNode[] = [
  // 0 · the drawing, on a sheet of paper
  <>
    <rect x="40" y="28" width="140" height="164" rx="6" fill="var(--color-paper)" stroke="var(--color-line)" strokeWidth="2.5" />
    <rect x="80" y="112" width="60" height="54" fill="none" stroke="var(--color-tomato)" strokeWidth="4.5" />
    <path d="M70 114 L110 80 L150 114" fill="none" stroke="var(--color-berry)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="100" y="136" width="20" height="30" fill="none" stroke="var(--color-sky)" strokeWidth="3.5" />
    <circle cx="146" cy="70" r="11" fill="var(--color-sunshine)" />
    <path d="M62 170 q14 -8 28 0 t28 0 t28 0" fill="none" stroke="var(--color-leaf)" strokeWidth="4" strokeLinecap="round" />
  </>,
  // 1 · t-shirt (the big one)
  <>
    <path
      d="M40 88 L78 68 L98 56 Q110 50 122 56 L142 68 L180 88 L165 112 L140 102 L140 182 L80 182 L80 102 L55 112 Z"
      fill="var(--color-paper)"
      stroke="var(--color-leaf)"
      strokeWidth="4.5"
      strokeLinejoin="round"
    />
    <rect x="90" y="133" width="40" height="30" fill="none" stroke="var(--color-tomato)" strokeWidth="3.4" />
    <path d="M88 134 L110 117 L132 134" fill="none" stroke="var(--color-berry)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="104" y="147" width="12" height="16" fill="none" stroke="var(--color-sky)" strokeWidth="2.6" />
  </>,
  // 2 · mug
  <>
    <rect x="72" y="66" width="76" height="104" rx="12" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4.5" />
    <path d="M148 92 C176 92 176 144 148 144" fill="none" stroke="var(--color-tomato)" strokeWidth="4.5" />
    <rect x="90" y="112" width="40" height="34" fill="none" stroke="var(--color-tomato)" strokeWidth="3.4" />
    <path d="M86 114 L110 88 L134 114" fill="none" stroke="var(--color-berry)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="104" y="130" width="12" height="16" fill="none" stroke="var(--color-sky)" strokeWidth="2.6" />
    <circle cx="136" cy="90" r="6" fill="var(--color-sunshine)" />
  </>,
  // 3 · sticker (round, die-cut)
  <>
    <circle cx="110" cy="110" r="66" fill="var(--color-paper)" stroke="var(--color-sunshine)" strokeWidth="4.5" />
    <rect x="86" y="118" width="48" height="40" fill="none" stroke="var(--color-tomato)" strokeWidth="3.6" />
    <path d="M80 120 L110 92 L140 120" fill="none" stroke="var(--color-berry)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="102" y="136" width="16" height="22" fill="none" stroke="var(--color-sky)" strokeWidth="3" />
    <circle cx="140" cy="84" r="8" fill="var(--color-sunshine)" />
  </>,
  // 4 · tote bag
  <>
    <rect x="66" y="86" width="88" height="96" rx="3" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4.5" strokeLinejoin="round" />
    <path d="M86 86 v-12 a26 26 0 0 1 52 0 v12" fill="none" stroke="var(--color-tomato)" strokeWidth="4.5" />
    <rect x="92" y="130" width="36" height="32" fill="none" stroke="var(--color-tomato)" strokeWidth="3.4" />
    <path d="M88 131 L110 114 L132 131" fill="none" stroke="var(--color-berry)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="104" y="146" width="12" height="16" fill="none" stroke="var(--color-sky)" strokeWidth="2.6" />
    <circle cx="134" cy="108" r="6" fill="var(--color-sunshine)" />
  </>,
];

const TILTS = [-3, 2.5, -2, 3, -2.5];

export function ProductMorph({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative mx-auto aspect-square w-full max-w-[340px] hero-bob', className)}
      style={{ filter: 'drop-shadow(0 14px 22px color-mix(in srgb, var(--color-cocoa) 10%, transparent))' }}
      role="img"
      aria-label="Olivia's drawing, made real — a t-shirt, a mug, a sticker, a tote bag, and back again."
    >
      {FRAMES.map((frame, i) => (
        <div key={i} className="morph-frame" style={{ '--morph-i': i } as CSSProperties} aria-hidden>
          <svg viewBox="0 0 220 220" width="100%" height="100%" style={{ transform: `rotate(${TILTS[i]}deg)` }}>
            {frame}
          </svg>
        </div>
      ))}
    </div>
  );
}
