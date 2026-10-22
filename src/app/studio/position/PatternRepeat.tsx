'use client';

import { forwardRef, useEffect, useRef } from 'react';
import type { Transform } from '@/server/print/geometry';
import { patternLayout, patternMotifCentres, scalePatternLayout } from '@/server/print/pattern-geometry';

/**
 * The REPEAT as it will print, drawn in the browser: the same layout maths the print renderer
 * uses (patternLayout at print size, then scaled to the preview), and the same half-drop motif
 * positions (patternMotifCentres) — so what you place here is what prints. Display only; the
 * print file is still made server-side (pattern.ts).
 *
 * The outer div is the live-gesture target: the editor sets --gx/--gy/--gk on it while a finger
 * is down, and the repeat follows; on release the committed transform re-draws it exactly.
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
  }
>(function PatternRepeat({ image, natural, canvas, dpi, transform, width, height }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !image || !image.complete || !image.naturalWidth) return;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    const print = patternLayout(canvas, dpi, { width: natural.w, height: natural.h }, transform);
    const { canvas: small, layout } = scalePatternLayout(print, canvas, (width * dpr) / canvas.width);
    ctx.fillStyle = '#ffffff';
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
  }, [image, natural.w, natural.h, canvas, dpi, transform, width, height]);

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
