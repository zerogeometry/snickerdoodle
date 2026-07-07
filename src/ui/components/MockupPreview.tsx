'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductKey } from './ProductArt';
import { composeMockupAction } from '@/app/actions/mockup';
import type { PlacementTransform } from '@/lib/store';

/**
 * A product preview that shows the real, in-VPC photoreal mockup — and nothing else.
 * Until the first photo lands it holds a calm oat block (founder's rule: the stylised
 * SVG stand-in is gone for good — "just let the thumbnail load"). Once a photo IS on
 * screen it never blanks: a newer variant/placement composes off-screen and swaps in
 * only when its pixels are ready, so there is no flash between variants. A failed
 * attempt quietly retries a couple of times (a re-compose also re-mints the signed
 * URL), then rests as the plain block. Uses a plain <img> with the signed URL (never
 * next/image, which would try to re-fetch an expired signed URL).
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
  px = 96,
  lazy = false,
}: {
  productKey: ProductKey;
  assetId?: string | null;
  variantId?: string | null;
  transform?: PlacementTransform | null;
  size?: 'thumb' | 'zoom';
  sourceObjectId?: string | null;
  px?: number;
  /** Defer composing until scrolled into view (for large grids). */
  lazy?: boolean;
}) {
  // `current` = the photo on screen; it is NEVER cleared while a newer variant
  // composes (the founder's rule: stay on the previous product until the chosen
  // one manages to load — no placeholder flash between variants). `resting` marks
  // the terminal no-photo states (no template / repeated failure): the block stops
  // pulsing so it doesn't promise work that isn't happening.
  const [current, setCurrent] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped to re-run a failed compose
  const [visible, setVisible] = useState(!lazy);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<string | null>(null);
  currentRef.current = current;
  const retriesRef = useRef(0);
  // A different DRAWING (new upload / cutout) must not linger — only variant/
  // placement changes keep the previous image while the next composes.
  const artKey = `${assetId ?? ''}|${sourceObjectId ?? ''}`;
  const lastArtKey = useRef(artKey);
  if (lastArtKey.current !== artKey) {
    lastArtKey.current = artKey;
    if (current !== null) setCurrent(null);
  }
  const tfKey = JSON.stringify(transform ?? null);
  // Fresh inputs get a fresh retry allowance.
  const inputKey = `${artKey}|${variantId ?? ''}|${tfKey}|${size ?? ''}`;
  const lastInputKey = useRef(inputKey);
  if (lastInputKey.current !== inputKey) {
    lastInputKey.current = inputKey;
    retriesRef.current = 0;
  }

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!assetId || !variantId) {
      // Ids still resolving (ingest / catalogue fetch in flight) — wait quietly.
      setCurrent(null);
      setResting(false);
      return;
    }
    setResting(false); // a new attempt begins; `current` keeps showing meanwhile
    const retryOrRest = () => {
      // Transient failure: the previous photo (if any) stays — it is still honest.
      // With nothing on screen, retry gently, then settle into the plain block.
      if (!live || currentRef.current) return;
      if (retriesRef.current >= 2) {
        setResting(true);
        return;
      }
      retriesRef.current += 1;
      timer = setTimeout(() => {
        if (live) setAttempt((a) => a + 1);
      }, 900 * retriesRef.current);
    };
    // An action dispatched during mount churn can be dropped by the client action
    // queue and NEVER settle (observed in dev: the aborted first strict-mode mount
    // takes the surviving mount's call down with it; the lazy tiles dodge it by
    // firing late). Two defences: DEFER the dispatch a beat, so an immediately-
    // unmounted effect never dispatches at all — and a WATCHDOG, so if a call still
    // never settles we stop waiting and retry instead of pulsing forever.
    let superseded = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const kickoff = setTimeout(() => {
      watchdog = setTimeout(() => {
        superseded = true;
        retryOrRest();
      }, 15_000);
      composeMockupAction({
        assetId,
        variantId,
        transform: transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // 0 = contain (default placement)
        size,
        sourceObjectId: sourceObjectId ?? undefined,
      })
        .then((r) => {
          clearTimeout(watchdog);
          if (!live || superseded) return;
          if (!r.ok) {
            // no template / blocked — terminal for this variant, and a stale image
            // of another variant would be a lie: clear down to the plain block.
            setCurrent(null);
            setResting(true);
            return;
          }
          // Preload OFF-SCREEN and swap only once the pixels are ready — the visible
          // image never blanks, and there is no half-loaded pop.
          const pre = new window.Image();
          pre.onload = () => {
            if (live) setCurrent(r.url);
          };
          pre.onerror = retryOrRest;
          pre.src = r.url;
        })
        .catch(() => {
          clearTimeout(watchdog);
          retryOrRest();
        });
    }, 50);
    return () => {
      live = false;
      clearTimeout(kickoff);
      clearTimeout(watchdog);
      if (timer) clearTimeout(timer);
    };
  }, [visible, assetId, variantId, tfKey, size, sourceObjectId, attempt]);

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
            // an expired signed URL: drop the dead image and recompose (fresh URL)
            setCurrent(null);
            if (retriesRef.current < 2) {
              retriesRef.current += 1;
              setAttempt((a) => a + 1);
            } else {
              setResting(true);
            }
          }}
        />
      ) : (
        // No photo yet: a calm oat block, pulsing only while work is under way —
        // deliberately never the SVG stand-in (founder call).
        <div
          aria-hidden
          className={`h-full w-full rounded-lg bg-[#F5EDDC] ${resting ? '' : 'motion-safe:animate-pulse'}`}
          style={{ minHeight: Math.min(px, 220) }}
        />
      )}
    </div>
  );
}
