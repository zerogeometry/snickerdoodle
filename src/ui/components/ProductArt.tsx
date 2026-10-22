import type { ReactNode } from 'react';

/**
 * Product previews showing Olivia's drawing "made real" on each product — the
 * shared visual used by Start Creating and the Catalogue. Placeholder house
 * motif now; swapped for the customer's real artwork once the Studio/AI pipeline
 * applies uploads to product print areas.
 */
export type ProductKey =
  | 'card'
  | 'cardPack'
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
  | 'phoneCase'
  | 'giftWrap'
  // range expansion (D21)
  | 'socks'
  | 'heightChart'
  | 'kidsHoodie'
  | 'adultHoodie'
  | 'acrylicBlock'
  | 'wrappingPaper'
  | 'teaTowel'
  | 'petBandana'
  | 'playingCards';

function House({ transform }: { transform: string }) {
  return (
    <g transform={transform} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="16" width="28" height="22" fill="none" stroke="var(--color-tomato)" strokeWidth="3" />
      <path d="M0 18 L18 4 L36 18" fill="none" stroke="var(--color-berry)" strokeWidth="3" />
      <rect x="14" y="25" width="9" height="13" fill="none" stroke="var(--color-sky)" strokeWidth="2.4" />
    </g>
  );
}

/** A little half-drop repeat of houses (the all-over pattern products) — only the houses that fit
 * wholly inside the box are drawn (no clip paths: ids would clash between tiles on one page). */
function HouseRepeat({ box, step, k }: { box: { x: number; y: number; w: number; h: number }; step: number; k: number }) {
  const out: ReactNode[] = [];
  const hw = 36 * k, hh = 38 * k; // the house's own size
  for (let c = 0; c * step <= box.w; c++)
    for (let r = -1; r * step <= box.h; r++) {
      const x = box.x + 1 + c * step;
      const y = box.y + 1 + r * step + (c % 2 === 1 ? step / 2 : 0); // the half-drop, like the real repeat
      if (x + hw > box.x + box.w || y < box.y || y + hh > box.y + box.h) continue;
      out.push(<House key={`${c}-${r}`} transform={`translate(${x},${y}) scale(${k})`} />);
    }
  return <>{out}</>;
}

/** A hoodie silhouette (hood up behind the shoulders, kangaroo pocket). */
function Hoodie({ stroke, wide }: { stroke: string; wide: boolean }) {
  const d = wide
    ? 'M12 34 L32 20 Q48 26 64 20 L84 34 L74 52 L64 46 L64 86 L32 86 L32 46 L22 52 Z'
    : 'M16 36 L34 23 Q48 28 62 23 L80 36 L71 52 L62 47 L62 84 L34 84 L34 47 L25 52 Z';
  return (
    <>
      <path d={wide ? 'M34 22 Q34 8 48 8 Q62 8 62 22' : 'M36 25 Q36 12 48 12 Q60 12 60 25'} fill="var(--color-paper)" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
      <path d={d} fill="var(--color-paper)" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
      <path d={wide ? 'M38 72 h20 l4 12 h-28 Z' : 'M39 70 h18 l3 11 h-24 Z'} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" />
    </>
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
  // a little fanned stack of cards
  cardPack: (
    <>
      <rect x="18" y="20" width="36" height="56" rx="2" transform="rotate(-10 36 48)" fill="var(--color-paper)" stroke="var(--color-sky)" strokeWidth="3" />
      <rect x="42" y="20" width="36" height="56" rx="2" transform="rotate(10 60 48)" fill="var(--color-paper)" stroke="var(--color-berry)" strokeWidth="3" />
      <rect x="30" y="18" width="36" height="58" rx="2" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <House transform="translate(36,36) scale(0.62)" />
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
  phoneCase: (
    <>
      <rect x="29" y="8" width="38" height="80" rx="9" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" />
      <rect x="35" y="14" width="13" height="15" rx="4" fill="none" stroke="var(--color-cocoa)" strokeWidth="2" />
      <House transform="translate(33,44) scale(0.85)" />
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
  // a pair of socks, printed all over with the drawing on repeat
  socks: (
    <>
      <path d="M18 12 h22 v40 l14 14 q6 8 -2 14 q-8 6 -16 -2 l-18 -18 Z" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" strokeLinejoin="round" />
      <HouseRepeat box={{ x: 20, y: 14, w: 18, h: 44 }} step={9} k={0.22} />
      <path d="M50 18 h22 v40 l12 12 q6 8 -2 14 q-8 6 -16 -2 l-16 -16 Z" fill="var(--color-paper)" stroke="var(--color-cobalt)" strokeWidth="3.5" strokeLinejoin="round" />
      <HouseRepeat box={{ x: 52, y: 20, w: 18, h: 44 }} step={9} k={0.22} />
    </>
  ),
  // a tall canvas on wooden hangers: the ruler down one edge, their drawing beside it
  heightChart: (
    <>
      <rect x="32" y="10" width="32" height="76" fill="var(--color-paper)" stroke="var(--color-leaf)" strokeWidth="3" />
      <rect x="29" y="7" width="38" height="5" rx="2" fill="var(--color-sunshine)" stroke="var(--color-cocoa)" strokeWidth="1.6" />
      <rect x="29" y="84" width="38" height="5" rx="2" fill="var(--color-sunshine)" stroke="var(--color-cocoa)" strokeWidth="1.6" />
      <path d="M44 7 L48 1 L52 7" fill="none" stroke="var(--color-cocoa)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M32 18 h6 M32 24 h3 M32 30 h6 M32 36 h3 M32 42 h6 M32 48 h3 M32 54 h6 M32 60 h3 M32 66 h6 M32 72 h3 M32 78 h6" stroke="var(--color-cocoa)" strokeWidth="1.4" />
      <House transform="translate(42,40) scale(0.52)" />
    </>
  ),
  kidsHoodie: (
    <>
      <Hoodie stroke="var(--color-leaf)" wide={false} />
      <House transform="translate(38,43) scale(0.56)" />
    </>
  ),
  adultHoodie: (
    <>
      <Hoodie stroke="var(--color-cobalt)" wide />
      <House transform="translate(37,44) scale(0.62)" />
    </>
  ),
  // a thick clear block standing on its own, the drawing set behind the acrylic
  acrylicBlock: (
    <>
      <path d="M26 20 L66 14 L74 20 L74 80 L34 86 L26 80 Z" fill="var(--color-sky-pale)" stroke="var(--color-sky)" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="26" y="20" width="40" height="60" fill="var(--color-paper)" stroke="var(--color-cobalt)" strokeWidth="3" />
      <path d="M66 20 L74 14 M66 80 L74 74" stroke="var(--color-sky)" strokeWidth="2" />
      <path d="M30 26 L36 24" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
      <House transform="translate(29,37) scale(0.95)" />
    </>
  ),
  // a sheet of wrap curling off its roll, their drawing on repeat
  wrappingPaper: (
    <>
      <path d="M14 30 H72 V84 H14 Z" fill="var(--color-berry-pale)" stroke="var(--color-tomato)" strokeWidth="3.5" strokeLinejoin="round" />
      <HouseRepeat box={{ x: 17, y: 33, w: 52, h: 48 }} step={12} k={0.28} />
      <ellipse cx="72" cy="22" rx="8" ry="12" transform="rotate(90 72 22)" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3" />
      <path d="M14 30 Q14 10 60 10 L84 10" fill="none" stroke="var(--color-tomato)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="22" r="3" fill="var(--color-tomato)" />
    </>
  ),
  // a tea towel hanging from its loop, printed all over
  teaTowel: (
    <>
      <path d="M44 18 Q48 8 52 18" fill="none" stroke="var(--color-cocoa)" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="22" y="18" width="52" height="68" rx="2" fill="var(--color-paper)" stroke="var(--color-leaf)" strokeWidth="3.5" />
      <HouseRepeat box={{ x: 25, y: 21, w: 46, h: 54 }} step={11} k={0.26} />
      <path d="M22 78 H74" stroke="var(--color-leaf)" strokeWidth="2.4" />
    </>
  ),
  // a triangle bandana, ties out to the sides
  petBandana: (
    <>
      <path d="M8 30 Q14 26 18 32 M88 30 Q82 26 78 32" fill="none" stroke="var(--color-berry)" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 30 Q48 38 80 30 L52 82 Q48 88 44 82 Z" fill="var(--color-paper)" stroke="var(--color-berry)" strokeWidth="4" strokeLinejoin="round" />
      <House transform="translate(36,40) scale(0.66)" />
    </>
  ),
  // a fanned pair of playing cards, their drawing on the back
  playingCards: (
    <>
      <rect x="20" y="22" width="36" height="54" rx="4" transform="rotate(-12 38 49)" fill="var(--color-paper)" stroke="var(--color-cocoa)" strokeWidth="2.6" />
      <path d="M26 30 l3 -4 l3 4 l-3 4 Z" transform="rotate(-12 38 49)" fill="var(--color-tomato)" />
      <rect x="40" y="18" width="36" height="54" rx="4" transform="rotate(8 58 45)" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.4" />
      <rect x="44" y="22" width="28" height="46" rx="2" transform="rotate(8 58 45)" fill="none" stroke="var(--color-line)" strokeWidth="1.6" />
      <House transform="translate(47,36) scale(0.62) rotate(8 18 21)" />
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

// Any product without its own motif yet (a new key, a retired one in order history): their
// drawing on a plain sheet — never a blank tile.
const FALLBACK: ReactNode = (
  <>
    <rect x="20" y="16" width="56" height="64" rx="3" fill="var(--color-paper)" stroke="var(--color-tomato)" strokeWidth="3.5" />
    <House transform="translate(30,33) scale(1)" />
  </>
);

/** "framedPrint" → "framed print" (for the label). */
const readable = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Does this product key have its own motif? (anything else draws the plain-sheet fallback) */
export const hasProductArt = (key: string): key is ProductKey => Object.prototype.hasOwnProperty.call(ART, key);

export function ProductArt({ product, size = 96 }: { product: ProductKey | (string & {}); size?: number }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label={`a drawing on a ${readable(product)}`}>
      {hasProductArt(product) ? ART[product] : FALLBACK}
    </svg>
  );
}

// (The old ProductMockup SVG composite — the drawing clipped into the motif's print
// area — is gone by founder decree: previews show the real photoreal mockup or a calm
// empty block, never a stylised stand-in. ProductArt above remains for durable line-item
// art where a compose may no longer be possible, e.g. order history after source purge.)
