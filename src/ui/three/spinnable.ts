/**
 * Which products have a Tier-C 3D spin view — kept three-free so pages can gate the
 * "spin it around" chip without pulling three.js into their bundle (Product3D itself
 * stays behind a dynamic import). builders.ts consumes this list, so the gate and the
 * dispatcher can't drift. giftWrap prints nothing → no 3D.
 *
 * WEARABLES (tees, bodysuit, apron) have NO 3D by founder decision (2026-07-07):
 * parametric garment models don't meet the visual bar — they present as standard
 * flat product photos with the artwork composited in 2D until a properly-made 3D
 * garment model exists.
 */
export const SPINNABLE = [
  'mug', 'framedPrint',
  'cushion', 'blanket', 'sack',
  'storybook', 'jigsaw', 'calendar', 'card', 'bauble',
] as const;

export const has3D = (kind: string): boolean => (SPINNABLE as readonly string[]).includes(kind);
