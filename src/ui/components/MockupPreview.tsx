'use client';

import { useEffect, useRef, useState } from 'react';
import { ProductMockup, type ProductKey } from './ProductArt';
import { composeMockupAction } from '@/app/actions/mockup';
import type { PlacementTransform } from '@/lib/store';

/**
 * A product preview that upgrades to the real, in-VPC photoreal mockup when one is
 * available, and otherwise shows the stylised SVG ProductMockup. The SVG renders
 * IMMEDIATELY (the skeleton + the permanent fallback for any variant without a template
 * yet), then swaps to the signed WebP once the compositor returns one — so the catalogue
 * is complete from day one and upgrades SKU-by-SKU as blanks are authored, with no broken
 * or blank states. Uses a plain <img> with the signed URL (never next/image, which would
 * try to re-fetch an expired signed URL).
 *
 * `lazy` defers the compose call until the tile scrolls into view (IntersectionObserver),
 * so a big grid — e.g. the Full Catalogue — doesn't fire dozens of renders at once; it
 * composes a tile only as the shopper browses to it.
 */
export function MockupPreview({
  productKey,
  assetId,
  variantId,
  transform,
  size,
  sourceObjectId,
  image,
  placement,
  px = 96,
  uid,
  lazy = false,
}: {
  productKey: ProductKey;
  assetId?: string | null;
  variantId?: string | null;
  transform?: PlacementTransform | null;
  size?: 'thumb' | 'zoom';
  sourceObjectId?: string | null;
  /** Fallback SVG inputs (shown until/unless the real mockup lands). */
  image?: string | null;
  placement?: PlacementTransform | null;
  px?: number;
  uid?: string;
  /** Defer composing until scrolled into view (for large grids). */
  lazy?: boolean;
}) {
  // `current` = the image on screen; it is NEVER cleared while a newer variant
  // composes (the founder's rule: stay on the previous product until the chosen
  // one manages to load — no placeholder flash between variants). `fallback`
  // marks the TERMINAL states where the stylised SVG is the honest render: no
  // artwork/variant yet, no template for this product, or a failed compose.
  const [current, setCurrent] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [visible, setVisible] = useState(!lazy);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<string | null>(null);
  currentRef.current = current;
  // A different DRAWING (new upload / cutout) must not linger — only variant/
  // placement changes keep the previous image while the next composes.
  const artKey = `${assetId ?? ''}|${sourceObjectId ?? ''}`;
  const lastArtKey = useRef(artKey);
  if (lastArtKey.current !== artKey) {
    lastArtKey.current = artKey;
    if (current !== null) setCurrent(null);
  }
  const tfKey = JSON.stringify(transform ?? null);

  // Latch visibility once the tile nears the viewport — then never re-observe.
  useEffect(() => {
    if (!lazy || visible) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true); // SSR/old browsers: just compose
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '250px' }, // warm a little before it's actually on screen
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    if (!assetId || !variantId) {
      setCurrent(null);
      setFallback(true); // nothing to compose — the SVG IS the render
      return;
    }
    setFallback(false); // a new attempt begins; `current` keeps showing meanwhile
    composeMockupAction({
      assetId,
      variantId,
      transform: transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // 0 = contain (default placement)
      size,
      sourceObjectId: sourceObjectId ?? undefined,
    })
      .then((r) => {
        if (!live) return;
        if (!r.ok) {
          // no template / blocked — terminal for this variant, and a stale image
          // of another variant would be a lie: show the honest SVG.
          setCurrent(null);
          setFallback(true);
          return;
        }
        // Preload OFF-SCREEN and swap only once the pixels are ready — the visible
        // image never blanks, and there is no half-loaded pop.
        const pre = new window.Image();
        pre.onload = () => {
          if (live) setCurrent(r.url);
        };
        pre.onerror = () => {
          if (live && !currentRef.current) setFallback(true); // else: keep the previous image
        };
        pre.src = r.url;
      })
      .catch(() => {
        // transient failure: keep the previous image if we have one; SVG only when
        // there is nothing better to show — never a broken image either way.
        if (live && !currentRef.current) setFallback(true);
      });
    return () => {
      live = false;
    };
  }, [visible, assetId, variantId, tfKey, size, sourceObjectId]);

  return (
    // h-full so a fixed-size parent (the square tile) bounds the preview; in an auto-height
    // parent (customize page) it falls back to content height and max-h-full is inert.
    <div ref={containerRef} className="flex h-full w-full items-center justify-center">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current}
          alt={`your drawing on a ${productKey}`}
          width={px}
          height={px}
          className="h-auto max-h-full w-full rounded-lg object-contain"
          onError={() => {
            // a failed/expired signed URL reverts to the SVG — never a broken image
            setCurrent(null);
            setFallback(true);
          }}
        />
      ) : fallback ? (
        <ProductMockup product={productKey} image={image} placement={placement ?? undefined} size={px} uid={uid} />
      ) : (
        // First compose in flight with nothing to show yet: a calm empty block —
        // deliberately NOT the SVG (founder call: no placeholder flash).
        <div aria-hidden className="h-full w-full rounded-lg bg-[#F5EDDC] motion-safe:animate-pulse" style={{ minHeight: Math.min(px, 220) }} />
      )}
    </div>
  );
}
