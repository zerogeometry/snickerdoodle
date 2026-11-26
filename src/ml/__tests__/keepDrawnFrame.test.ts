import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cropToSheet } from '../sheetCrop';
import { liftInk } from '../inkLift';
import { framedFillingPhoto, framedOnSurface, frameOnEachSide } from './framedDrawing';

// KEEP THE DRAWN FRAME (founder, 26 Nov): a hand-drawn frame round the whole picture is part of the
// drawing. Trimming the table must crop to the PAPER — never to a line drawn on it — and must still take
// the desk or carpet away as well as it did before.

async function pixels(img: Buffer) {
  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)] as number[];
  return { at, w: info.width, h: info.height };
}

/** Yellow (the sun's crayon) somewhere in the box (fractions of the image). */
async function hasYellow(img: Buffer, x0: number, y0: number, x1: number, y1: number) {
  const { at, w, h } = await pixels(img);
  for (let y = Math.round(y0 * h); y < y1 * h; y++) for (let x = Math.round(x0 * w); x < x1 * w; x++) {
    const [r, g, b] = at(x, y) as [number, number, number];
    if (r > 200 && g > 160 && b < 110) return true;
  }
  return false;
}

/** No desk/carpet left in the result's corners: paper-light, not wood-brown or carpet-grey. */
async function cornersArePaper(img: Buffer) {
  const { at, w, h } = await pixels(img);
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]] as const) expect(Math.min(...at(x, y))).toBeGreaterThan(200);
}

describe('keep a hand-drawn frame', () => {
  it('leaves a framed drawing alone when the paper fills the photo (the founder\'s upload)', async () => {
    const photo = await framedFillingPhoto();
    const r = await cropToSheet(photo);
    // nothing to trim — no desk shows. (Were it trimmed at all, the frame must still be there.)
    const out = r?.buffer ?? photo;
    const f = await frameOnEachSide(out);
    expect(f.top).toBeGreaterThan(0.9);
    expect(f.bottom).toBeGreaterThan(0.9); // the bottom line, where the hills are coloured right up to it
    expect(f.left).toBeGreaterThan(0.9);
    expect(f.right).toBeGreaterThan(0.9);
    expect(r).toBeNull();
  });

  for (const surface of ['wood', 'carpet'] as const) {
    it(`crops a framed drawing on ${surface === 'wood' ? 'a wooden desk' : 'a carpet'} to the paper — frame, corner suns and hills all kept`, async () => {
      const photo = await framedOnSurface(surface);
      const r = await cropToSheet(photo);
      expect(r).not.toBeNull();
      // cropped to the paper (680×540 on the photo), not to the frame (~626×497) or tighter
      expect(r!.width).toBeGreaterThan(650);
      expect(r!.width).toBeLessThanOrEqual(680);
      expect(r!.height).toBeGreaterThan(515);
      expect(r!.height).toBeLessThanOrEqual(540);
      await cornersArePaper(r!.buffer); // the surface is gone
      const f = await frameOnEachSide(r!.buffer);
      for (const v of Object.values(f)) expect(v).toBeGreaterThan(0.9); // the frame is there on every side
      expect(await hasYellow(r!.buffer, 0, 0, 0.2, 0.25)).toBe(true); // the top-left sun
      expect(await hasYellow(r!.buffer, 0.8, 0, 1, 0.25)).toBe(true); // the top-right sun
    });
  }

  it('trims the desk where it shows, and keeps the frame where the paper runs off the photo', async () => {
    // the sheet hangs off the left, right and bottom of the photo; only the desk at the top shows
    const photo = await framedOnSurface('wood', { sheet: { x: -20, y: 100, w: 940, h: 610 } });
    const r = await cropToSheet(photo);
    expect(r).not.toBeNull(); // the desk is plainly there at the top: it goes
    const out = r!.buffer;
    const { at, w } = await pixels(out);
    // the frame survives on the sides the trim must leave alone…
    const f = await frameOnEachSide(out, 0.12);
    expect(f.left).toBeGreaterThan(0.9);
    expect(f.right).toBeGreaterThan(0.9);
    expect(f.bottom).toBeGreaterThan(0.9);
    expect(f.top).toBeGreaterThan(0.9); // …the frame's top line just below where the desk was
    expect(Math.min(...at(w >> 1, 2))).toBeGreaterThan(200); // the desk went
  });

  it('the background remover keeps the frame of a trimmed, framed drawing', async () => {
    const photo = await framedOnSurface('wood');
    const r = await cropToSheet(photo);
    expect(r).not.toBeNull();
    const cut = await liftInk(r!.buffer);
    expect(cut).not.toBeNull();
    // purple-frame pixels in the trimmed photo stay solid in the cut-out; the white paper goes
    const src = await sharp(r!.buffer).removeAlpha().resize(cut!.width, cut!.height, { fit: 'fill' }).raw().toBuffer();
    const a = await sharp(cut!.buffer).ensureAlpha().raw().toBuffer();
    let purple = 0, kept = 0, paper = 0, paperGone = 0;
    for (let k = 0; k < cut!.width * cut!.height; k++) {
      const R = src[k * 3]!, G = src[k * 3 + 1]!, B = src[k * 3 + 2]!;
      if (B > G + 40 && R > G + 15 && G < 150) { purple++; if (a[k * 4 + 3]! > 128) kept++; }
      if (Math.min(R, G, B) > 235) { paper++; if (a[k * 4 + 3]! < 64) paperGone++; }
    }
    expect(purple).toBeGreaterThan(1000);
    expect(kept / purple).toBeGreaterThan(0.9);
    expect(paperGone / paper).toBeGreaterThan(0.9);
  });
});
