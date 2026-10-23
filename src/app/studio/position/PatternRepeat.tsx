'use client';

import { forwardRef, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Transform } from '@/server/print/geometry';
import { patternLayout, patternMotifCentres, scalePatternLayout } from '@/server/print/pattern-geometry';

/**
 * The REPEAT as it will print, drawn in the browser: the same layout maths the print renderer
 * uses (patternLayout at print size, then scaled to the preview), and the same half-drop motif
 * positions (patternMotifCentres) — so what you place here is what prints. Display only; the
 * print file is still made server-side (pattern.ts).
 *
 * While a finger is down the editor RE-DRAWS the repeat at the gesture's zoom + pan (`drawRef`), so
 * zooming out adds copies as you pinch — never a shrinking picture with empty edges. On release
 * the committed transform draws it again, exactly.
 */
export const PatternRepeat = forwardRef<
  HTMLDivElement,
  {
    image: HTMLImageElement | null;
    natural: { w: number; h: number };
    /** the print canvas (px, incl. bleed) and its dpi */
    canvas: { width: number; height: number };
    dpi: number;
    transform: Transform;
    /** preview size in css px */
    width: number;
    height: number;
    /** the base colour the repeat sits on (#rrggbb) — the print file's fill */
    groundHex?: string;
    /** Filled with a draw function the editor calls mid-gesture with the live transform. */
    drawRef?: MutableRefObject<((t: Transform) => void) | null>;
  }
>(function PatternRepeat({ image, natural, canvas, dpi, transform, width, height, groundHex = '#ffffff', drawRef }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback((transform: Transform) => {
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !image || !image.complete || !image.naturalWidth) return;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (el.width !== pw) el.width = pw;
    if (el.height !== ph) el.height = ph;
    const print = patternLayout(canvas, dpi, { width: natural.w, height: natural.h }, transform);
    const { canvas: small, layout } = scalePatternLayout(print, canvas, (width * dpr) / canvas.width);
    ctx.fillStyle = groundHex;
    ctx.fillRect(0, 0, el.width, el.height);
    const swap = transform.rotationDeg % 180 !== 0;
    const w = swap ? layout.motifH : layout.motifW; // the motif before it's turned
    const h = swap ? layout.motifW : layout.motifH;
    for (const c of patternMotifCentres(layout, small)) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((transform.rotationDeg * Math.PI) / 180);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }, [image, natural.w, natural.h, canvas, dpi, width, height, groundHex]);

  // the committed transform (and any input change) draws it exactly
  useEffect(() => draw(transform), [draw, transform]);
  // the editor's live gesture draws through this
  useEffect(() => {
    if (!drawRef) return;
    drawRef.current = draw;
    return () => {
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [draw, drawRef]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ transform: 'translate(var(--gx, 0px), var(--gy, 0px)) scale(var(--gk, 1))', transformOrigin: 'center' }}
    >
      <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />
    </div>
  );
});
