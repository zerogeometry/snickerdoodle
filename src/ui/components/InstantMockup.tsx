'use client';

import { useEffect, useRef, useState } from 'react';
import { instantPlacement, type InstantContext, type ProductPhoto } from '@/lib/instantMockup';
import type { Transform } from '@/server/print/geometry';

/** The box a product photo is shown in, fitted like the photoreal <img object-contain> it stands in for. */
function useFit(photoAspect: number) {
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
  const w = box ? (box.h > 0 ? Math.min(box.w, box.h * photoAspect) : box.w) : 0;
  return { boxRef, w };
}

/** Calls `onReady` once every image counted has loaded (or failed — nothing more is coming), then
 * after the frame they're painted in. */
function useAllLoaded(count: number, onReady?: () => void) {
  const seen = useRef(0);
  const fired = useRef(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  return () => {
    if (++seen.current < count || fired.current) return;
    fired.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => ready.current?.()));
  };
}

/**
 * The INSTANT preview: the shopper's own drawing (already in the browser) laid on a small copy of
 * the product photo with the SAME placement geometry as the photoreal mockup — mask, base colour and
 * overlay in the compositor's order — so the range shows the moment it opens, and the server's photo
 * fades in over it when ready. Display only; nothing is sent anywhere. Sized to its box like the
 * photo it stands in for (object-contain).
 */
export function InstantMockup({
  ctx,
  src,
  aspect,
  transform,
  ground,
  onReady,
}: {
  ctx: InstantContext;
  /** the drawing (a local object/data URL, or the cutout's signed URL) */
  src: string;
  /** the drawing's width ÷ height */
  aspect: number;
  transform: Transform;
  /** the base colour filling the print area under the drawing (#rrggbb), as the compositor fills it */
  ground?: string | null;
  /** every layer has loaded and painted */
  onReady?: () => void;
}) {
  const { boxRef, w } = useFit(ctx.blankW / ctx.blankH);
  const p = w > 0 ? instantPlacement(ctx, w, { width: Math.round(aspect * 1000), height: 1000 }, transform) : null;
  // the photo, the drawing, the overlay — and the mask (a CSS mask can't say when it has loaded, so it's
  // fetched alongside: the browser's cache serves the mask the same bytes)
  const loaded = useAllLoaded(2 + (ctx.overlayUrl ? 1 : 0) + (ctx.maskUrl ? 1 : 0), onReady);
  useEffect(() => {
    if (!ctx.maskUrl) return;
    const m = new window.Image();
    m.onload = m.onerror = loaded;
    m.src = ctx.maskUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mask
  }, [ctx.maskUrl]);
  const mask = ctx.maskUrl
    ? ({ WebkitMaskImage: `url(${ctx.maskUrl})`, maskImage: `url(${ctx.maskUrl})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', maskMode: 'luminance' } as React.CSSProperties)
    : undefined;
  const drawing = (style: React.CSSProperties) => <img src={src} alt="" draggable={false} onLoad={loaded} onError={loaded} style={{ position: 'absolute', maxWidth: 'none', maxHeight: 'none', ...style }} />;

  return (
    <div ref={boxRef} aria-hidden className="flex h-full w-full items-center justify-center">
      {p ? (
        <div className="relative overflow-hidden rounded-lg" style={{ width: p.width, height: p.height }}>
          <img src={ctx.blankUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} onLoad={loaded} onError={loaded} />
          {/* the blend sits on the masked layer itself (a mask isolates what's inside it), so fabric
              reads the drawing as ink: its white paper vanishes into the cloth */}
          <div className="absolute inset-0" style={{ ...mask, mixBlendMode: p.blend }}>
            <div className="absolute overflow-hidden" style={{ left: p.area.left, top: p.area.top, width: p.area.width, height: p.area.height, background: ground ?? undefined }}>
              {p.art ? (
                // a printed face (the calendar page): white, the whole drawing inside its margin
                <div
                  style={{
                    position: 'absolute',
                    left: p.image.centreX,
                    top: p.image.centreY,
                    width: p.image.width,
                    height: p.image.height,
                    transform: 'translate(-50%, -50%)',
                    background: '#ffffff',
                  }}
                >
                  {drawing({ left: p.art.left, top: p.art.top, width: p.art.width, height: p.art.height })}
                </div>
              ) : (
                drawing({
                  left: p.image.centreX,
                  top: p.image.centreY,
                  width: p.image.width,
                  height: p.image.height,
                  transform: `translate(-50%, -50%) rotate(${p.image.rotationDeg}deg)`,
                })
              )}
            </div>
          </div>
          {ctx.overlayUrl ? <img src={ctx.overlayUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} onLoad={loaded} onError={loaded} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The plain PRODUCT PHOTO (+ its overlay), on a tile whose picture the browser can't draw (a mug's
 * wrap, a repeat, a layout of pieces): the shopper sees the product, never a blank square, while the
 * server makes the picture — which then fades in over it. Sized exactly like that picture.
 */
export function ProductPhotoStandIn({ photo }: { photo: ProductPhoto }) {
  const { boxRef, w } = useFit(photo.w / photo.h);
  return (
    <div ref={boxRef} aria-hidden data-standin className="flex h-full w-full items-center justify-center">
      {w > 0 ? (
        <div className="relative overflow-hidden rounded-lg" style={{ width: w, height: (w * photo.h) / photo.w }}>
          <img src={photo.url} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} />
          {photo.overlayUrl ? <img src={photo.overlayUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ maxWidth: 'none' }} /> : null}
        </div>
      ) : null}
    </div>
  );
}
