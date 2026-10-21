'use client';

import { useEffect, useRef, useState } from 'react';
import { cachedMockup, forgetMockup, instantContext, mockupKey, pendingMockup, rememberMockup, subscribeMockups } from '@/lib/mockupPrefetch';
import { clampTransform } from '@/server/print/geometry';
import { InstantMockup } from './InstantMockup';
import type { ProductKey } from './ProductArt';
import type { PlacementTransform } from '@/lib/store';

// The POST /api/mockup response shape (kept in sync with the route handler). Defined
// locally so this client component never imports the server-only route module.
/** Fired on window whenever a mockup photo has actually painted (see MakingRangeLoader). */
export const MOCKUP_READY_EVENT = 'sd:mockup-ready';

type MockupPreviewResult =
  | { ok: true; url: string; tier: 'FLAT' | 'PERSPECTIVE'; widthPx?: number; heightPx?: number }
  | { ok: false; needsAuth?: boolean; fallback: true };

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
  view,
  fill,
  spanHalf,
  px = 96,
  lazy = false,
  placeholder = true,
  instant,
}: {
  productKey: ProductKey;
  assetId?: string | null;
  variantId?: string | null;
  transform?: PlacementTransform | null;
  size?: 'thumb' | 'zoom';
  sourceObjectId?: string | null;
  /** An alternate display view (e.g. 'tin') — composes a mockup_views mockup instead of the
   * product's primary one. Absent ⇒ the primary product mockup. */
  view?: string | null;
  /** A solid-colour fill instead of the design (e.g. the cushion's plain coloured back), #rrggbb. */
  fill?: string | null;
  /** For a 'full width' closed card: which panel of the double-wide spread this view shows
   * ('front' = the right half). Only affects the perspective single-card view. */
  spanHalf?: 'front' | 'back' | null;
  px?: number;
  /** Defer composing until scrolled into view (for large grids). */
  lazy?: boolean;
  /** false = nothing at all until the photo lands (for previews layered over one another). */
  placeholder?: boolean;
  /** The drawing as the BROWSER already holds it (+ its width ÷ height): while the photoreal
   * mockup is being made, draw an instant preview from it (src/ui/components/InstantMockup.tsx). */
  instant?: { src: string; aspect: number } | null;
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
  // one key format, shared with the range prefetch (src/lib/mockupPrefetch.ts)
  const inputKey = mockupKey({ assetId, sourceObjectId, variantId, transform, size, view, fill, spanHalf });
  const keyRef = useRef(inputKey);
  keyRef.current = inputKey;
  // Re-render when the range prefetch lands something for THIS tile: its photo (prefetchTick —
  // re-runs the compose effect, which then finds it cached) or its instant-preview context.
  const [prefetchTick, setPrefetchTick] = useState(0);
  const [, setContextTick] = useState(0);
  useEffect(
    () =>
      subscribeMockups(() => {
        if (currentRef.current) return;
        if (cachedMockup(keyRef.current)) setPrefetchTick((t) => t + 1);
        else setContextTick((t) => t + 1);
      }),
    [],
  );
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
    if (!assetId || !variantId) {
      if (!visible) return;
      setCurrent(null);
      setResting(false); // ids still resolving — wait quietly (pulse), don't rest
      return;
    }
    const seq = ++seqRef.current;
    const isLatest = () => mountedRef.current && seq === seqRef.current;
    const show = (url: string) => {
      const pre = new window.Image();
      pre.onload = () => {
        if (isLatest()) setCurrent(url);
      };
      pre.onerror = () => {
        forgetMockup(inputKey);
        if (isLatest() && !currentRef.current) setResting(true);
      };
      pre.src = url;
    };
    // The range PREFETCH may already have this one (even for a tile not scrolled to yet) …
    const hit = cachedMockup(inputKey);
    if (hit) {
      show(hit);
      return;
    }
    // … or have it on the way: wait for that rather than asking twice.
    const inflight = pendingMockup(inputKey);
    if (inflight) {
      void inflight.then((r) => {
        if (!isLatest()) return;
        if (r.ok) show(r.url);
        else if (!r.transient) setResting(true);
      });
      return;
    }
    if (!visible) return;
    setResting(false); // a new attempt begins; `current` keeps showing meanwhile
    // The compose is a ROUTE HANDLER (not a Server Action): a plain concurrent fetch, so
    // several previews compose in PARALLEL and don't abort each other (server actions
    // serialise + cancel on re-render, which rendered thumbnails inconsistently). Dispatch
    // IMMEDIATELY — a deferred kickoff was getting cancelled by the customize page's rapid
    // mount re-renders, so the compose never fired. A superseded request is aborted; the
    // seq-gate ignores its result; the recovery effect retries a genuinely stuck one.
    const ctrl = new AbortController();
    fetch('/api/mockup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId,
        variantId,
        transform: transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // 0 = contain (default placement)
        size,
        sourceObjectId: sourceObjectId ?? undefined,
        view: view ?? undefined,
        fill: fill ?? undefined,
        spanHalf: spanHalf ?? undefined,
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
        rememberMockup(inputKey, r.url);
        show(r.url);
      })
      .catch(() => {
        // an aborted/superseded request is expected — only a genuine failure with nothing
        // to show settles on the plain block (the recovery effect below retries a stuck one)
        if (isLatest() && !currentRef.current) setResting(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tfKey is `transform` by value (a fresh object each render would refetch forever)
  }, [visible, assetId, variantId, tfKey, size, sourceObjectId, view, fill, spanHalf, attempt, prefetchTick]);

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

  // The instant preview stands in until the photo lands (and stays under it while it fades in).
  const ctx = instant && variantId && !view && !fill ? instantContext(variantId) : undefined;
  const instantLayer = ctx ? (
    <div className="absolute inset-0">
      <InstantMockup
        ctx={ctx}
        src={instant!.src}
        aspect={instant!.aspect}
        transform={clampTransform((transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }) as Parameters<typeof clampTransform>[0])}
        // the instant preview counts as "real pixels" for the create page's loader
        onReady={() => window.dispatchEvent(new Event(MOCKUP_READY_EVENT))}
      />
    </div>
  ) : null;

  return (
    // h-full so a fixed-size parent (the square tile) bounds the preview; in an auto-height
    // parent (customize page) it falls back to content height and max-h-full is inert.
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      {instantLayer}
      {current ? (
        <img
          src={current}
          alt={`your drawing on a ${productKey}`}
          width={px}
          height={px}
          className={`h-auto max-h-full w-full rounded-lg object-contain ${instantLayer ? 'relative motion-safe:animate-[fade_.35s_ease-out]' : ''}`}
          // tells the create page's "making your range" loader that real pixels are on screen
          onLoad={() => window.dispatchEvent(new Event(MOCKUP_READY_EVENT))}
          onError={() => {
            // an expired signed URL: drop the dead image and recompose (fresh URL)
            forgetMockup(inputKey);
            setCurrent(null);
            if (retriesRef.current < 2) {
              retriesRef.current += 1;
              setAttempt((a) => a + 1);
            } else {
              setResting(true);
            }
          }}
        />
      ) : instantLayer || !placeholder ? null : (
        // No photo yet: a calm oat block, pulsing only while work is under way —
        // deliberately never the SVG stand-in (founder call).
        <div
          aria-hidden
          className={`h-full w-full rounded-lg bg-line ${resting ? '' : 'motion-safe:animate-pulse'}`}
          style={{ minHeight: Math.min(px, 220) }}
        />
      )}
    </div>
  );
}
