import type { ReactNode } from 'react';

/**
 * Product previews showing Olivia's drawing "made real" on each product — the
 * shared visual used by Start Creating and the Catalogue. Placeholder house
 * motif now; swapped for the customer's real artwork once the Studio/AI pipeline
 * applies uploads to product print areas.
 */
export type ProductKey =
  | 'card'
  | 'framedPrint'
  | 'mug'
  | 'kidsTee'
  | 'adultTee'
  | 'babyBodysuit'
  | 'apron'
  | 'cushion'
  | 'toteBag'
  | 'blanket'
  | 'calendar'
  | 'bauble'
  | 'sack'
  | 'storybook'
  | 'jigsaw'
  | 'giftWrap';

function House({ transform }: { transform: string }) {
  return (
    <g transform={transform} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="16" width="28" height="22" fill="none" stroke="var(--color-tomato)" strokeWidth="3" />
      <path d="M0 18 L18 4 L36 18" fill="none" stroke="var(--color-berry)" strokeWidth="3" />
      <rect x="14" y="25" width="9" height="13" fill="none" stroke="var(--color-sky)" strokeWidth="2.4" />
    </g>
  );
}

const ART: Record<ProductKey, ReactNode> = {
  card: (
    <>
      <rect x="30" y="16" width="40" height="64" rx="2" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <line x1="50" y1="16" x2="50" y2="80" stroke="var(--color-tomato)" strokeWidth="2" />
      <House transform="translate(52,38) scale(0.5)" />
    </>
  ),
  framedPrint: (
    <>
      <rect x="16" y="16" width="64" height="64" fill="var(--color-paper)" stroke="var(--color-sunshine)" strokeWidth="7" />
      <House transform="translate(30,34) scale(1)" />
    </>
  ),
  mug: (
    <>
      <rect x="22" y="24" width="44" height="52" rx="6" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4" />
      <path d="M66 36 C84 36 84 64 66 64" fill="none" stroke="var(--color-tomato)" strokeWidth="4" />
      <House transform="translate(28,38) scale(0.8)" />
    </>
  ),
  kidsTee: (
    <>
      <path
        d="M16 32 L34 20 Q48 13 62 20 L80 32 L70 48 L60 42 L60 84 L36 84 L36 42 L26 48 Z"
        fill="var(--color-paper)"
        stroke="var(--color-leaf)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <House transform="translate(31,46) scale(0.62)" />
    </>
  ),
  cushion: (
    <>
      <rect x="16" y="22" width="64" height="58" rx="14" fill="var(--color-paper)" stroke="var(--color-sky)" strokeWidth="4" />
      <House transform="translate(29,34) scale(0.95)" />
    </>
  ),
  toteBag: (
    <>
      <rect x="24" y="36" width="48" height="50" rx="2" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M36 36 v-8 a12 12 0 0 1 24 0 v8" fill="none" stroke="var(--color-tomato)" strokeWidth="4" />
      <House transform="translate(30,48) scale(0.74)" />
    </>
  ),
  blanket: (
    <>
      <rect x="14" y="20" width="68" height="60" rx="6" fill="var(--color-paper)" stroke="var(--color-leaf)" strokeWidth="4" />
      <path d="M14 70 q8 -7 17 0 t17 0 t17 0 t17 0" fill="none" stroke="var(--color-leaf)" strokeWidth="2.4" />
      <House transform="translate(30,30) scale(0.92)" />
    </>
  ),
  storybook: (
    <>
      <rect x="26" y="16" width="48" height="64" rx="2" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4" />
      <line x1="34" y1="16" x2="34" y2="80" stroke="var(--color-tomato)" strokeWidth="2" />
      <House transform="translate(38,32) scale(0.72)" />
    </>
  ),
  jigsaw: (
    <>
      <rect x="18" y="18" width="60" height="60" rx="3" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <path d="M48 18 v10 M18 48 h10 M68 48 h-10 M48 78 v-10" stroke="var(--color-line)" strokeWidth="2" />
      <House transform="translate(30,32) scale(0.86)" />
    </>
  ),
  adultTee: (
    <>
      <path
        d="M14 32 L34 18 Q48 10 62 18 L82 32 L71 50 L60 43 L60 86 L36 86 L36 43 L25 50 Z"
        fill="var(--color-paper)"
        stroke="var(--color-tomato)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <House transform="translate(31,48) scale(0.62)" />
    </>
  ),
  babyBodysuit: (
    <>
      <path
        d="M22 30 L34 20 Q48 14 62 20 L74 30 L67 44 L60 39 L60 66 Q60 78 48 78 Q36 78 36 66 L36 39 L29 44 Z"
        fill="var(--color-paper)"
        stroke="var(--color-sky)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="72" r="1.6" fill="var(--color-sky)" />
      <circle cx="52" cy="72" r="1.6" fill="var(--color-sky)" />
      <House transform="translate(34,44) scale(0.58)" />
    </>
  ),
  apron: (
    <>
      <path d="M42 16 Q48 9 54 16" fill="none" stroke="var(--color-leaf)" strokeWidth="3" strokeLinecap="round" />
      <path d="M34 44 q-11 3 -15 9 M62 44 q11 3 15 9" fill="none" stroke="var(--color-leaf)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M38 20 Q38 15 48 15 Q58 15 58 20 L64 26 Q67 34 62 40 L62 80 L34 80 L34 40 Q29 34 32 26 Z"
        fill="var(--color-paper)"
        stroke="var(--color-leaf)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <House transform="translate(35,44) scale(0.64)" />
    </>
  ),
  calendar: (
    <>
      <line x1="32" y1="13" x2="32" y2="23" stroke="var(--color-tomato)" strokeWidth="3" strokeLinecap="round" />
      <line x1="48" y1="13" x2="48" y2="23" stroke="var(--color-tomato)" strokeWidth="3" strokeLinecap="round" />
      <line x1="64" y1="13" x2="64" y2="23" stroke="var(--color-tomato)" strokeWidth="3" strokeLinecap="round" />
      <rect x="20" y="18" width="56" height="64" rx="3" fill="var(--color-paper)" stroke="var(--color-sky)" strokeWidth="4" />
      <line x1="20" y1="56" x2="76" y2="56" stroke="var(--color-sky)" strokeWidth="2.4" />
      <path d="M34 64 h28 M34 72 h28 M43 60 v20 M53 60 v20" stroke="var(--color-line)" strokeWidth="1.6" />
      <House transform="translate(34,26) scale(0.62)" />
    </>
  ),
  bauble: (
    <>
      <path d="M48 20 q0 -7 6 -7" fill="none" stroke="var(--color-tomato)" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="43" y="18" width="10" height="8" rx="1.5" fill="var(--color-sunshine)" stroke="var(--color-tomato)" strokeWidth="2" />
      <circle cx="48" cy="53" r="28" fill="var(--color-paper)" stroke="var(--color-berry)" strokeWidth="4" />
      <House transform="translate(33,39) scale(0.78)" />
    </>
  ),
  sack: (
    <>
      <path d="M28 26 Q48 20 68 26 L66 35 Q48 30 30 35 Z" fill="var(--color-berry-pale)" stroke="var(--color-tomato)" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M30 35 Q48 31 66 35 L72 78 Q48 84 24 78 Z" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="4" strokeLinejoin="round" />
      <House transform="translate(33,45) scale(0.72)" />
    </>
  ),
  giftWrap: (
    <>
      <rect x="22" y="40" width="52" height="40" rx="3" fill="var(--color-berry-pale)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <rect x="22" y="40" width="52" height="13" fill="var(--color-berry-pale)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <line x1="48" y1="40" x2="48" y2="80" stroke="var(--color-tomato)" strokeWidth="3" />
      <path d="M48 40 C40 26 28 30 38 40 M48 40 C56 26 68 30 58 40" fill="none" stroke="var(--color-berry)" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
};

export function ProductArt({ product, size = 96 }: { product: ProductKey; size?: number }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label={`a drawing on a ${product}`}>
      {ART[product]}
    </svg>
  );
}

// (The old ProductMockup SVG composite — the drawing clipped into the motif's print
// area — is gone by founder decree: previews show the real photoreal mockup or a calm
// empty block, never a stylised stand-in. ProductArt above remains for durable line-item
// art where a compose may no longer be possible, e.g. order history after source purge.)
