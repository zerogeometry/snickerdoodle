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
// framedPrint + jigsaw + cushion + blanket deliberately absent (founder calls 2026-07): each is
// ONE clear view — the frame is a single perfect photo; the jigsaw previews as its flat photoreal
// mockup (with the die-cut piece lines) + the "as puzzle" view in the positioner; the cushion and
// the blanket preview as their flat layered mockups ("on the cushion" / "on the blanket"), the
// same single-view treatment as the frame. No spin.
export const SPINNABLE = [
  'mug',
  'sack',
  'storybook', 'calendar', 'card', 'bauble',
] as const;

export const has3D = (kind: string): boolean => (SPINNABLE as readonly string[]).includes(kind);
