'use client';

import { useEffect, useRef, useState } from 'react';
import { instantPlacement, type InstantContext } from '@/lib/instantMockup';
import type { Transform } from '@/server/print/geometry';

/**
 * The INSTANT preview: the shopper's own drawing (already in the browser) laid on a small copy of
 * the product photo with the SAME placement geometry as the photoreal mockup — so the range
 * appears the moment it opens, and the server's photo fades in over it when ready. Display only;
 * nothing is sent anywhere. Sized to its box like the photo it stands in for (object-contain).
 */
export function InstantMockup({
  ctx,
  src,
  aspect,
  transform,
  onReady,
}: {
  ctx: InstantContext;
  /** the drawing (a local object/data URL, or the cutout's signed URL) */
  src: string;
  /** the drawing's width ÷ height */
  aspect: number;
  transform: Transform;
  onReady?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit the photo inside the box (like the photoreal <img object-contain>)
  const photoAspect = ctx.blankW / ctx.blankH;
  const w = box ? (box.h > 0 ? Math.min(box.w, box.h * photoAspect) : box.w) : 0;
  const p = box && w > 0 ? instantPlacement(ctx, w, { width: Math.round(aspect * 1000), height: 1000 }, transform) : null;
  const mask = ctx.maskUrl
    ? ({ WebkitMaskImage: `url(${ctx.maskUrl})`, maskImage: `url(${ctx.maskUrl})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', maskMode: 'luminance' } as React.CSSProperties)
    : undefined;

  return (
    <div ref={boxRef} aria-hidden className="flex h-full w-full items-center justify-center">
      {p ? (
        <div className="relative overflow-hidden rounded-lg" style={{ width: p.width, height: p.height }}>
          <img src={ctx.blankUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} onLoad={onReady} />
          {/* the blend sits on the masked layer itself (a mask isolates what's inside it), so fabric
              reads the drawing as ink: its white paper vanishes into the cloth */}
          <div className="absolute inset-0" style={{ ...mask, mixBlendMode: p.blend }}>
            <div className="absolute overflow-hidden" style={{ left: p.area.left, top: p.area.top, width: p.area.width, height: p.area.height }}>
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: p.image.centreX,
                  top: p.image.centreY,
                  width: p.image.width,
                  height: p.image.height,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `translate(-50%, -50%) rotate(${p.image.rotationDeg}deg)`,
                }}
              />
            </div>
          </div>
          {ctx.overlayUrl ? <img src={ctx.overlayUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} /> : null}
        </div>
      ) : null}
    </div>
  );
}
