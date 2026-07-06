/**
 * Which products have a Tier-C 3D spin view — kept three-free so pages can gate the
 * "spin it around" chip without pulling three.js into their bundle (Product3D itself
 * stays behind a dynamic import). builders.ts consumes this list, so the gate and the
 * dispatcher can't drift. giftWrap prints nothing → no 3D.
 */
export const SPINNABLE = [
  'mug', 'framedPrint', 'kidsTee', 'adultTee', 'babyBodysuit',
  'cushion', 'blanket', 'sack', 'apron',
  'storybook', 'jigsaw', 'calendar', 'card', 'bauble',
] as const;

export const has3D = (kind: string): boolean => (SPINNABLE as readonly string[]).includes(kind);
