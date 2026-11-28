import { describe, expect, it } from 'vitest';
import { FRAME_REBATE_MM, frameQuad } from '../seedMockups';

// Prodigi's classic frames: "Rebate width 5mm" — the moulding covers 5 mm of the print on every edge
// (founder, 28 Nov 2026: the finished piece matches the preview).
describe('the framed-print picture hides exactly what the frame covers', () => {
  it('places the print so 5 mm of it sits under the moulding on every edge (a window of the real shape)', () => {
    const [Wmm, Hmm] = [304.8, 406.4]; // 12×16″
    const W = 2000, H = 2000;
    // a window the same shape as the real one (the print minus 5 mm all round), 1000 px tall
    const winH = 1000, winW = (winH * (Wmm - 10)) / (Hmm - 10);
    const win = { x0: (1000 - winW / 2) / W, y0: 500 / H, x1: (1000 + winW / 2) / W, y1: 1500 / H };
    const q = frameQuad(win, W, H, Wmm, Hmm);
    const mmPerPx = (Hmm - 10) / winH;
    expect(((win.x0 - q.x0) * W * mmPerPx)).toBeCloseTo(FRAME_REBATE_MM, 6);
    expect(((q.x1 - win.x1) * W * mmPerPx)).toBeCloseTo(FRAME_REBATE_MM, 6);
    expect(((win.y0 - q.y0) * H * mmPerPx)).toBeCloseTo(FRAME_REBATE_MM, 6);
    expect(((q.y1 - win.y1) * H * mmPerPx)).toBeCloseTo(FRAME_REBATE_MM, 6);
  });
  it('never stretches the drawing: the quad is the print file’s own shape', () => {
    const q = frameQuad({ x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 }, 2000, 2000, 279.4, 355.6);
    expect(((q.x1 - q.x0) * 2000) / ((q.y1 - q.y0) * 2000)).toBeCloseTo(279.4 / 355.6, 6);
  });
});
