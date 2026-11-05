import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FACE_MAX_EDGE, mockupSizing, OUTPUT_EDGE, THUMB_DESIGN_EDGE, THUMB_FACE_EDGE, THUMB_WORK_EDGE, TILE_DPR, TILE_MAX_CSS_PX, WEBP_EFFORT } from '@/server/print/thumbSizing';

/**
 * A range tile's preview is composed at the tile's real on-screen size at 2× DPR (founder, 5 Nov) — and
 * nothing else changes: the close-up keeps full quality, and the print file never sees these numbers.
 */
describe('thumb sizing', () => {
  it('a thumb works at the biggest tile photo (≤ 350 css px) at 2× — smaller than before (800 / 1200 / 1000)', () => {
    expect(TILE_MAX_CSS_PX).toBe(350);
    expect(TILE_DPR).toBe(2);
    expect(THUMB_WORK_EDGE).toBe(700);
    expect(THUMB_WORK_EDGE).toBeLessThan(800);
    expect(THUMB_DESIGN_EDGE).toBeLessThan(1200);
    expect(THUMB_FACE_EDGE).toBeLessThan(1000);
  });

  it('…but never below what the tile shows: the drawing and the printed face cover the whole working photo, which covers the output', () => {
    expect(THUMB_DESIGN_EDGE).toBeGreaterThanOrEqual(THUMB_WORK_EDGE);
    expect(THUMB_FACE_EDGE).toBeGreaterThanOrEqual(THUMB_WORK_EDGE);
    expect(THUMB_WORK_EDGE).toBeGreaterThanOrEqual(OUTPUT_EDGE.thumb);
  });

  it('thumb: capped working photo, shrunk drawing + face, a cheaper WebP', () => {
    expect(mockupSizing('thumb', 1500)).toEqual({ workEdge: 700, designEdge: 700, faceEdge: 700, outputEdge: 400, webpEffort: WEBP_EFFORT.thumb });
    expect(mockupSizing('thumb', 600).workEdge).toBe(600); // a template mapped smaller is never upscaled
    expect(WEBP_EFFORT.thumb).toBeLessThan(WEBP_EFFORT.zoom);
  });

  it('zoom (the close-up, customise) is untouched: the full map, the full drawing, the 3000px face, effort 4, 1200px out', () => {
    expect(mockupSizing('zoom', 1500)).toEqual({ workEdge: 1500, designEdge: null, faceEdge: FACE_MAX_EDGE, outputEdge: 1200, webpEffort: 4 });
    expect(FACE_MAX_EDGE).toBe(3000);
  });

  it('the print file never reads the preview sizes', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/server/print/render.ts'), 'utf8');
    expect(src).not.toMatch(/thumbSizing|THUMB_|mockupSizing/);
  });
});
