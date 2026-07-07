'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductKey } from './ProductArt';
import type { MockupPreviewResult } from '@/app/api/mockup/route';
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
  // True while the component is mounted — so an async compose result is applied based on
  // whether it is the LATEST request (a monotonic seq, see below), not a single effect
  // run's closure, and no setState fires after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
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

  // ── Compose: dispatch, and apply the result if it is the LATEST request (a monotonic
  // seq, not this effect-run's closure) — so a valid result is applied even when React
  // re-ran the effect meanwhile (the bug that discarded composes and left the preview
  // stuck pulsing). A superseded request (newer seq) is ignored.
  const seqRef = useRef(0);
  useEffect(() => {
    if (!visible) return;
    if (!assetId || !variantId) {
      setCurrent(null);
      setResting(false); // ids still resolving — wait quietly (pulse), don't rest
      return;
    }
    const seq = ++seqRef.current;
    const isLatest = () => mountedRef.current && seq === seqRef.current;
    setResting(false); // a new attempt begins; `current` keeps showing meanwhile
    // The compose is a ROUTE HANDLER (not a Server Action): a plain concurrent fetch, so
    // several previews compose in PARALLEL and don't abort each other (server actions
    // serialise + cancel on re-render, which rendered thumbnails inconsistently). DEFER a
    // beat so a strict-mode throwaway mount never dispatches; abort a superseded request.
    const ctrl = new AbortController();
    const kickoff = setTimeout(() => {
      fetch('/api/mockup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetId,
          variantId,
          transform: transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // 0 = contain (default placement)
          size,
          sourceObjectId: sourceObjectId ?? undefined,
        }),
        signal: ctrl.signal,
      })
        .then((res) => res.json() as Promise<MockupPreviewResult>)
        .then((r) => {
          if (!isLatest()) return;
          if (!r.ok) {
            setCurrent(null);
            setResting(true); // no template / blocked — settle on the plain block
            return;
          }
          // Preload OFF-SCREEN and swap only once the pixels are ready — no half-loaded pop.
          const pre = new window.Image();
          pre.onload = () => {
            if (isLatest()) setCurrent(r.url);
          };
          pre.onerror = () => {
            if (isLatest() && !currentRef.current) setResting(true);
          };
          pre.src = r.url;
        })
        .catch(() => {
          // an aborted/superseded request is expected — only a genuine failure with nothing
          // to show settles on the plain block (the recovery effect below retries a stuck one)
          if (isLatest() && !currentRef.current) setResting(true);
        });
    }, 50);
    return () => {
      clearTimeout(kickoff);
      ctrl.abort();
    };
  }, [visible, assetId, variantId, tfKey, size, sourceObjectId, attempt]);

  // ── Recovery: a compose fetch can be lost to a transient re-render or a flaky response.
  // Independently of the dispatch above, if the preview is STUCK (visible, ids present, no
  // photo, not resting) for a few seconds, retry
  // by bumping `attempt`. Capped, then it rests. This is what makes a lost first-load
  // compose (the "gold frame thumbnail never loaded" report) recover on its own.
  useEffect(() => {
    if (!visible || !assetId || !variantId || current || resting) return;
    if (retriesRef.current >= 4) {
      setResting(true);
      return;
    }
    const id = setTimeout(() => {
      retriesRef.current += 1;
      setAttempt((a) => a + 1);
    }, 3500);
    return () => clearTimeout(id);
  }, [visible, assetId, variantId, current, resting, attempt]);

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
