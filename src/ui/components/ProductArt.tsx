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
  | 'cushion'
  | 'toteBag'
  | 'blanket'
  | 'storybook'
  | 'jigsaw'
  | 'giftWrap';

function House({ transform }: { transform: string }) {
  return (
    <g transform={transform} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="16" width="28" height="22" fill="none" stroke="#C8623A" strokeWidth="3" />
      <path d="M0 18 L18 4 L36 18" fill="none" stroke="#E8786E" strokeWidth="3" />
      <rect x="14" y="25" width="9" height="13" fill="none" stroke="#84BBD0" strokeWidth="2.4" />
    </g>
  );
}

const ART: Record<ProductKey, ReactNode> = {
  card: (
    <>
      <rect x="30" y="16" width="40" height="64" rx="2" fill="#FFFDF8" stroke="#C8623A" strokeWidth="3.5" />
      <line x1="50" y1="16" x2="50" y2="80" stroke="#C8623A" strokeWidth="2" />
      <House transform="translate(52,38) scale(0.5)" />
    </>
  ),
  framedPrint: (
    <>
      <rect x="16" y="16" width="64" height="64" fill="#FFFDF8" stroke="#F2A640" strokeWidth="7" />
      <House transform="translate(30,34) scale(1)" />
    </>
  ),
  mug: (
    <>
      <rect x="22" y="24" width="44" height="52" rx="6" fill="#FFFDF8" stroke="#C8623A" strokeWidth="4" />
      <path d="M66 36 C84 36 84 64 66 64" fill="none" stroke="#C8623A" strokeWidth="4" />
      <House transform="translate(28,38) scale(0.8)" />
    </>
  ),
  kidsTee: (
    <>
      <path
        d="M16 32 L34 20 Q48 13 62 20 L80 32 L70 48 L60 42 L60 84 L36 84 L36 42 L26 48 Z"
        fill="#FFFDF8"
        stroke="#93B97C"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <House transform="translate(31,46) scale(0.62)" />
    </>
  ),
  cushion: (
    <>
      <rect x="16" y="22" width="64" height="58" rx="14" fill="#FFFDF8" stroke="#84BBD0" strokeWidth="4" />
      <House transform="translate(29,34) scale(0.95)" />
    </>
  ),
  toteBag: (
    <>
      <rect x="24" y="36" width="48" height="50" rx="2" fill="#FFFDF8" stroke="#C8623A" strokeWidth="4" strokeLinejoin="round" />
      <path d="M36 36 v-8 a12 12 0 0 1 24 0 v8" fill="none" stroke="#C8623A" strokeWidth="4" />
      <House transform="translate(30,48) scale(0.74)" />
    </>
  ),
  blanket: (
    <>
      <rect x="14" y="20" width="68" height="60" rx="6" fill="#FFFDF8" stroke="#93B97C" strokeWidth="4" />
      <path d="M14 70 q8 -7 17 0 t17 0 t17 0 t17 0" fill="none" stroke="#93B97C" strokeWidth="2.4" />
      <House transform="translate(30,30) scale(0.92)" />
    </>
  ),
  storybook: (
    <>
      <rect x="26" y="16" width="48" height="64" rx="2" fill="#FFFDF8" stroke="#C8623A" strokeWidth="4" />
      <line x1="34" y1="16" x2="34" y2="80" stroke="#C8623A" strokeWidth="2" />
      <House transform="translate(38,32) scale(0.72)" />
    </>
  ),
  jigsaw: (
    <>
      <rect x="18" y="18" width="60" height="60" rx="3" fill="#FFFDF8" stroke="#C8623A" strokeWidth="3.5" />
      <path d="M48 18 v10 M18 48 h10 M68 48 h-10 M48 78 v-10" stroke="#E0C9A8" strokeWidth="2" />
      <House transform="translate(30,32) scale(0.86)" />
    </>
  ),
  giftWrap: (
    <>
      <rect x="22" y="40" width="52" height="40" rx="3" fill="#F6E2D6" stroke="#C8623A" strokeWidth="3.5" />
      <rect x="22" y="40" width="52" height="13" fill="#FBE4E1" stroke="#C8623A" strokeWidth="3.5" />
      <line x1="48" y1="40" x2="48" y2="80" stroke="#C8623A" strokeWidth="3" />
      <path d="M48 40 C40 26 28 30 38 40 M48 40 C56 26 68 30 58 40" fill="none" stroke="#E8786E" strokeWidth="3" strokeLinecap="round" />
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

// The print area of each product within the 96×96 motif — where the real artwork sits.
const PRINT_RECT: Record<ProductKey, { x: number; y: number; w: number; h: number } | null> = {
  card: { x: 52, y: 22, w: 16, h: 52 },
  framedPrint: { x: 23, y: 23, w: 50, h: 50 },
  mug: { x: 28, y: 30, w: 34, h: 40 },
  kidsTee: { x: 40, y: 44, w: 20, h: 26 },
  cushion: { x: 24, y: 30, w: 48, h: 42 },
  toteBag: { x: 30, y: 44, w: 36, h: 34 },
  blanket: { x: 24, y: 28, w: 48, h: 44 },
  storybook: { x: 40, y: 24, w: 28, h: 48 },
  jigsaw: { x: 24, y: 24, w: 48, h: 48 },
  giftWrap: null,
};

/**
 * The product with the customer's real artwork composited into its print area —
 * a "made real" preview. Falls back to the placeholder motif with no image.
 */
export function ProductMockup({
  product,
  image,
  size = 96,
  uid,
  placement,
}: {
  product: ProductKey;
  image?: string | null;
  size?: number;
  uid?: string;
  /** Reflect a placement (scale/offset/rotate) on the composited image — approximate
   * preview; the exact print render lives in the positioner. */
  placement?: { scale: number; offsetX: number; offsetY: number; rotationDeg: number };
}) {
  const rect = PRINT_RECT[product];
  const clipId = `pm-${product}-${uid ?? 'a'}`;
  let transform: string | undefined;
  if (rect && placement) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    transform = `rotate(${placement.rotationDeg} ${cx} ${cy}) translate(${(placement.offsetX * rect.w) / 2} ${(placement.offsetY * rect.h) / 2}) translate(${cx} ${cy}) scale(${placement.scale}) translate(${-cx} ${-cy})`;
  }
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label={`your drawing on a ${product}`}>
      {ART[product]}
      {image && rect ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="1" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <image href={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} preserveAspectRatio="xMidYMid slice" transform={transform} />
          </g>
        </>
      ) : null}
    </svg>
  );
}
