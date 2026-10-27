import { describe, expect, it } from 'vitest';
import { beginPaint, paintDab, type Work } from '@/ui/studio/engine';
import { isPalmTouch, multiTapAction, PEN_GRACE_MS, TAP_MS } from '@/ui/studio/input';

describe('multi-finger taps (spec §19a): two = undo, three = redo', () => {
  it('a quick, still two-finger tap undoes; three redoes', () => {
    expect(multiTapAction({ fingers: 2, ms: 120, moved: false })).toBe('undo');
    expect(multiTapAction({ fingers: 3, ms: 200, moved: false })).toBe('redo');
  });
  it('a pinch (fingers travelled), a long press or one finger does nothing', () => {
    expect(multiTapAction({ fingers: 2, ms: 120, moved: true })).toBeNull();
    expect(multiTapAction({ fingers: 2, ms: TAP_MS + 1, moved: false })).toBeNull();
    expect(multiTapAction({ fingers: 1, ms: 50, moved: false })).toBeNull();
    expect(multiTapAction({ fingers: 4, ms: 50, moved: false })).toBeNull();
  });
});

const work = (w = 40, h = 40): Work => ({ w, h, rgb: new Uint8ClampedArray(w * h * 3), lab: new Float32Array(w * h * 3), alpha: new Uint8ClampedArray(w * h).fill(255) });

describe('eraser strength — a see-through brush that never builds up within one stroke', () => {
  it('full strength rubs right out at the middle of the dab', () => {
    const wk = work();
    const st = beginPaint(wk, wk.alpha.slice());
    paintDab(wk, st, 20, 20, 16, 'erase', 1);
    expect(wk.alpha[20 * 40 + 20]).toBe(0);
    expect(wk.alpha[0]).toBe(255); // nowhere near: untouched
  });

  it('half strength goes half way — and going over it again in the SAME stroke doesn’t go further', () => {
    const wk = work();
    const st = beginPaint(wk, wk.alpha.slice());
    for (let i = 0; i < 6; i++) paintDab(wk, st, 20, 20, 16, 'erase', 0.5);
    expect(wk.alpha[20 * 40 + 20]).toBe(128);
    // a new stroke starts from where that left it, so it can go further
    const st2 = beginPaint(wk, wk.alpha.slice());
    paintDab(wk, st2, 20, 20, 16, 'erase', 0.5);
    expect(wk.alpha[20 * 40 + 20]).toBe(64);
  });

  it('bring back restores toward fully kept, with the same strength rule', () => {
    const wk = work();
    wk.alpha.fill(0);
    const st = beginPaint(wk, wk.alpha.slice());
    paintDab(wk, st, 20, 20, 16, 'restore', 0.25);
    paintDab(wk, st, 20, 20, 16, 'restore', 0.25);
    expect(wk.alpha[20 * 40 + 20]).toBe(64);
  });
});

describe('palm rejection (spec §19a)', () => {
  const finger = { pointerType: 'touch', width: 20, height: 20, penDown: false, msSincePen: 1e9 };
  it('a fingertip with no pen about is a finger', () => expect(isPalmTouch(finger)).toBe(false));
  it('a touch while the pen is down is the resting hand', () => expect(isPalmTouch({ ...finger, penDown: true })).toBe(true));
  it('a touch just after the pen lifts is still the hand', () => expect(isPalmTouch({ ...finger, msSincePen: PEN_GRACE_MS - 1 })).toBe(true));
  it('…but a while later, fingers work again', () => expect(isPalmTouch({ ...finger, msSincePen: PEN_GRACE_MS + 1 })).toBe(false));
  it('a palm-sized contact patch is a palm, pen or no pen', () => expect(isPalmTouch({ ...finger, width: 90 })).toBe(true));
  it('devices that don’t report a size aren’t penalised', () => expect(isPalmTouch({ ...finger, width: undefined, height: undefined })).toBe(false));
  it('a pen or a mouse is never rejected', () => {
    expect(isPalmTouch({ ...finger, pointerType: 'pen', penDown: true })).toBe(false);
    expect(isPalmTouch({ ...finger, pointerType: 'mouse', width: 200 })).toBe(false);
  });
});
