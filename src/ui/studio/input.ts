/**
 * Touch & stylus rules for the Studio canvas (Studio spec §19a) — plain functions, so they're tested.
 */

/** How long after a pen lifts that touches still count as the resting hand. */
export const PEN_GRACE_MS = 1200;
/** A contact patch wider or taller than this (CSS px) is a palm, not a fingertip. */
export const PALM_CONTACT_PX = 64;

/** A multi-finger TAP: quick, and no finger travelled. Two fingers = undo, three = redo. */
export const TAP_MS = 350;
export function multiTapAction(t: { fingers: number; ms: number; moved: boolean }): 'undo' | 'redo' | null {
  if (t.moved || t.ms > TAP_MS) return null;
  return t.fingers === 2 ? 'undo' : t.fingers === 3 ? 'redo' : null;
}

/**
 * PALM REJECTION: a touch is ignored while a pen is on the glass or was just lifted (the hand
 * holding it is resting there), or when its contact patch is palm-sized on devices that report it.
 * Pens and mice are never rejected.
 */
export function isPalmTouch(p: { pointerType: string; width?: number; height?: number; penDown: boolean; msSincePen: number }): boolean {
  if (p.pointerType !== 'touch') return false;
  if (p.penDown || p.msSincePen < PEN_GRACE_MS) return true;
  return (p.width ?? 0) > PALM_CONTACT_PX || (p.height ?? 0) > PALM_CONTACT_PX;
}
