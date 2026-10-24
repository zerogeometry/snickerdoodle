/**
 * Wheel over the print layout. A plain wheel scrolls the page (never trapped on the canvas); only
 * Ctrl/⌘ + wheel zooms — and a trackpad pinch, which browsers deliver as a ctrl + wheel.
 */
export const isZoomWheel = (e: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>) => e.ctrlKey || e.metaKey;

/** One mouse-wheel notch is a gentle 6% step; a trackpad pinch (many small deltas) follows the
 * fingers smoothly instead of racing. */
export function wheelZoomFactor(deltaY: number): number {
  const STEP = 1.06;
  return Math.min(STEP, Math.max(1 / STEP, Math.exp(-deltaY * 0.01)));
}
