import { describe, expect, it } from 'vitest';
import { cylinderWarp } from '../cylinder';

/** Build a design where each column carries a distinct RED value = its column index,
 * so a warped pixel's red tells us exactly which design column it sampled. */
function columnRamp(w: number, h: number): Buffer {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      buf[o] = x; // red = column index
      buf[o + 1] = 0;
      buf[o + 2] = 0;
      buf[o + 3] = 255;
    }
  }
  return buf;
}

const alpha = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4 + 3]!;
const red = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4]!;
const green = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4 + 1]!;

describe('cylinderWarp', () => {
  const W = 100, H = 60;
  const band = { x: 20, y: 15, w: 60, h: 30 };
  const srcW = 256, srcH = 4;
  const design = columnRamp(srcW, srcH);

  it('samples the design CENTRE at the band centre (θ=0 ⇒ u=0.5)', () => {
    const out = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0 });
    const cx = band.x + Math.floor(band.w / 2);
    const cy = band.y + Math.floor(band.h / 2);
    // u≈0.5 → column ≈ 0.5·(srcW-1) ≈ 127 (±a couple for pixel-centre rounding).
    expect(red(out, W, cx, cy)).toBeGreaterThan(120);
    expect(red(out, W, cx, cy)).toBeLessThan(135);
  });

  it('compresses toward the edges — a NON-linear (arcsine) horizontal map', () => {
    const out = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0 });
    const y = band.y + Math.floor(band.h / 2);
    const cx = band.x + band.w / 2;
    // A pixel a quarter-band right of centre maps past u=0.5+0.125 under a linear map; the
    // cylinder's sin() compression keeps it CLOSER to centre than linear would.
    const qx = Math.round(cx + band.w / 4);
    const linearCol = 0.5 * (srcW - 1) + 0.25 * 0.5 * (srcW - 1); // linear expectation ≈ 159
    expect(red(out, W, qx, y)).toBeLessThan(linearCol);
    expect(red(out, W, qx, y)).toBeGreaterThan(0.5 * (srcW - 1)); // but still right of centre
  });

  it('leaves everything OUTSIDE the band transparent (the product photo shows)', () => {
    const out = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0 });
    expect(alpha(out, W, 2, 2)).toBe(0); // top-left corner, well outside the band
    expect(alpha(out, W, W - 2, H - 2)).toBe(0); // bottom-right corner
    // and something inside the band IS drawn
    expect(alpha(out, W, band.x + band.w / 2, band.y + band.h / 2)).toBe(255);
  });

  it('mirror flips the horizontal sampling (BACK view art reads un-reversed)', () => {
    const y = band.y + Math.floor(band.h / 2);
    const x = band.x + Math.floor(band.w * 0.75); // right of centre
    const normal = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0 });
    const mirrored = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0, mirror: true });
    // At the same screen x, mirroring samples the OPPOSITE side of the design centre.
    const dNormal = red(normal, W, x, y) - 0.5 * (srcW - 1);
    const dMirror = red(mirrored, W, x, y) - 0.5 * (srcW - 1);
    expect(Math.sign(dNormal)).toBe(-Math.sign(dMirror));
  });

  it('curveY bows horizontal lines — an edge column samples a DIFFERENT design row than centre', () => {
    // Design whose GREEN channel encodes the row, so a sampled pixel's green tells us which
    // design row it came from. With curveY>0 the sampling shifts vertically toward the edges.
    const tallSrc = 64; // enough rows to resolve the shift
    const ramp = Buffer.alloc(srcW * tallSrc * 4);
    for (let y = 0; y < tallSrc; y++) for (let x = 0; x < srcW; x++) { const o = (y * srcW + x) * 4; ramp[o + 1] = Math.round((y / (tallSrc - 1)) * 255); ramp[o + 3] = 255; }
    const flat = cylinderWarp({ design: ramp, srcW, srcH: tallSrc, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0, curveY: 0 });
    const bowed = cylinderWarp({ design: ramp, srcW, srcH: tallSrc, band, canvasW: W, canvasH: H, arcDeg: 180, wrapDeg: 360, centerDeg: 0, curveY: 0.15 });
    const y = band.y + Math.floor(band.h * 0.3); // upper third
    const edgeX = band.x + Math.round(band.w * 0.9);
    // Flat: edge and its own centre sample the same row. Bowed: the edge samples a LOWER row
    // (green larger) because +bow lifts the design at the edges.
    expect(green(bowed, W, edgeX, y)).toBeGreaterThan(green(flat, W, edgeX, y));
  });

  it('drops off the printed arc (the handle gap) → transparent, not clamped', () => {
    // A narrow wrap (wrapDeg=120) with a wide visible arc (160°): the band edges look past the
    // print onto bare ceramic, so those columns must be transparent, not smeared design edge.
    const out = cylinderWarp({ design, srcW, srcH, band, canvasW: W, canvasH: H, arcDeg: 160, wrapDeg: 120, centerDeg: 0 });
    const y = band.y + Math.floor(band.h / 2);
    expect(alpha(out, W, band.x + 1, y)).toBe(0); // far-left column is off-arc
    expect(alpha(out, W, band.x + Math.floor(band.w / 2), y)).toBe(255); // centre still printed
  });
});
