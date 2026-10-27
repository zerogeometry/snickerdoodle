/**
 * Touch & stylus rules for the Studio canvas (Studio spec §19a) — plain functions, so they're tested.
 */

/** A multi-finger TAP: quick, and no finger travelled. Two fingers = undo, three = redo. */
export const TAP_MS = 350;
export function multiTapAction(t: { fingers: number; ms: number; moved: boolean }): 'undo' | 'redo' | null {
  if (t.moved || t.ms > TAP_MS) return null;
  return t.fingers === 2 ? 'undo' : t.fingers === 3 ? 'redo' : null;
}

/** A contact patch wider or taller than this (CSS px) is a palm, not a fingertip. */
export const PALM_CONTACT_PX = 64;

/**
 * PALM REJECTION: a touch is ignored while a pen is on the glass (the hand holding it is resting
 * there), and whenever its contact patch is palm-sized on devices that report it. Once the pen
 * lifts, fingers work again straight away (draw with a finger, pinch, pan); "stylus only" is the
 * switch for never drawing with a finger. Pens and mice are never rejected.
 */
export function isPalmTouch(p: { pointerType: string; width?: number; height?: number; penDown: boolean }): boolean {
  if (p.pointerType !== 'touch') return false;
  if (p.penDown) return true;
  return (p.width ?? 0) > PALM_CONTACT_PX || (p.height ?? 0) > PALM_CONTACT_PX;
}
