'use client';

import { useEffect, useRef, useState } from 'react';
import { cachedMockup, forgetMockup, instantContext, markPainted, mockupKey, pendingMockup, productPhoto, rememberMockup, subscribeMockups } from '@/lib/mockupPrefetch';
import { clampTransform } from '@/server/print/geometry';
import { normalizeGround } from '@/lib/patterns';
import { InstantMockup, ProductPhotoStandIn } from './InstantMockup';
import { PreviewLoader } from './PreviewLoader';
import type { ProductKey } from './ProductArt';
import type { PlacementTransform } from '@/lib/store';

// The POST /api/mockup response shape (kept in sync with the route handler). Defined
// locally so this client component never imports the server-only route module.
/** Fired on window whenever a mockup photo has actually painted (see MakingRangeLoader). */
export const MOCKUP_READY_EVENT = 'sd:mockup-ready';

/** The key a close-up's small stand-in is shown under — painted, it lifts the loader (same picture). */
const standInKey = (inputKey: string) => `small:${inputKey}`;

/** The nearest scrolling ancestor — the range scrolls inside its own box, and an IntersectionObserver's
 * margin only stretches its ROOT, so the observer must be rooted there for a margin to mean anything. */
function scrollRoot(el: HTMLElement): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}
/** How far ahead (beyond the visible part of the scroller) a tile counts as NEAR: its group of six is asked for. */
const NEAR_MARGIN = '120% 0px';

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
 * composes a tile only as the shopper browses to it. In the range, `onNear` tells the range's
 * plan (src/lib/mockupPrefetch.ts revealRange) the shopper is getting close, well before that, and
 * the tile then waits for the plan's request rather than asking itself.
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
  ground,
  spanHalf,
  px = 96,
  lazy = false,
  placeholder = true,
  instant,
  standIn = false,
  loader = false,
  onNear,
  onPainted,
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
  /** A repeat-pattern product's base colour token (socks, wrap, tea towel) — the repeat sits on it. */
  ground?: string | null;
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
  /** No instant preview possible (a mug's wrap, a repeat…): show the plain product photo while the picture is made. */
  standIn?: boolean;
  /** The tile is getting near the screen (a generous margin) — the range asks for its group. */
  onNear?: () => void;
  /** Something real has painted: the instant preview or the photo. */
  onPainted?: () => void;
  /** Lay the "making it" loader over the preview while a newer photo is on its way, until it has
   * painted (the customize page's big preview). Off for grids: a tile just holds its photo. */
  loader?: boolean;
}) {
  // `current` = the photo on screen; it is NEVER cleared while a newer variant
  // composes (the founder's rule: stay on the previous product until the chosen
  // one manages to load — no placeholder flash between variants). `resting` marks
  // the terminal no-photo states (no template / repeated failure): the block stops
  // pulsing so it doesn't promise work that isn't happening.
  const [current, setCurrent] = useState<string | null>(null);
  // Which choice the on-screen photo is for, and which choice has actually PAINTED — the loader
  // shows until the painted one is the latest choice (not merely fetched or preloaded).
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  // the instant preview / product photo under the photo is let go once the photo has faded in over it
  const [underlayGoneKey, setUnderlayGoneKey] = useState<string | null>(null);
  const onNearRef = useRef(onNear);
  onNearRef.current = onNear;
  const onPaintedRef = useRef(onPainted);
  onPaintedRef.current = onPainted;
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
  const inputKey = mockupKey({ assetId, sourceObjectId, variantId, transform, size, view, fill, spanHalf, ground });
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
          onNearRef.current?.(); // the range's plan first, so the tile finds its request on the way
          setVisible(true);
          io.disconnect();
        }
      },
      { root: scrollRoot(el), rootMargin: '250px' }, // warm a little before it's actually on screen
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  // NEAR: a generous margin ahead of the scroll — the range asks for this tile's group of six.
  const near = !!onNear;
  useEffect(() => {
    if (!near) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return void onNearRef.current?.();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onNearRef.current?.();
          io.disconnect();
        }
      },
      { root: scrollRoot(el), rootMargin: NEAR_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

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
    setResting(false); // a new attempt begins; `current` keeps showing meanwhile
    // A failed attempt: try again a couple of times (a re-compose also re-mints the signed URL),
    // then rest — keeping whatever photo is already on screen, so the loader never spins forever.
    const retryOrRest = () => {
      if (!isLatest()) return;
      if (retriesRef.current < 2) {
        retriesRef.current += 1;
        setAttempt((a) => a + 1);
      } else {
        setResting(true);
      }
    };
    const show = (url: string) => {
      if (url === currentRef.current) {
        // already on screen (e.g. back to an earlier choice): nothing new to paint
        setCurrentKey(inputKey);
        setPaintedKey(inputKey);
        return;
      }
      const pre = new window.Image();
      pre.onload = () => {
        if (!isLatest()) return;
        setCurrent(url);
        setCurrentKey(inputKey);
      };
      pre.onerror = () => {
        forgetMockup(inputKey);
        retryOrRest();
      };
      pre.src = url;
    };
    // The range PREFETCH may already have this one (even for a tile not scrolled to yet) …
    const hit = cachedMockup(inputKey);
    if (hit) {
      show(hit);
      return;
    }
    // A close-up whose small range tile is already here (the SAME picture — same drawing, product,
    // colour, placement, view): show that at once while the sharp one is drawn, then swap (founder,
    // 23 Oct). Only an exact match stands in, so the sharp version is never a different picture.
    if (size === 'zoom' && !currentRef.current) {
      const small = cachedMockup(mockupKey({ assetId, sourceObjectId, variantId, transform, size: 'thumb', view, fill, spanHalf, ground }));
      if (small) {
        setCurrent(small);
        setCurrentKey(standInKey(inputKey));
      }
    }
    // … or have it on the way: wait for that rather than asking twice.
    const waitFor = (p: Promise<{ ok: true; url: string } | { ok: false; transient?: boolean }>) =>
      void p.then((r) => {
        if (!isLatest()) return;
        if (r.ok) show(r.url);
        else if (r.transient) retryOrRest();
        else setResting(true);
      });
    const inflight = pendingMockup(inputKey);
    if (inflight) {
      waitFor(inflight);
      return;
    }
    if (!visible) return;
    // The compose is a ROUTE HANDLER (not a Server Action): a plain concurrent fetch, so
    // several previews compose in PARALLEL and don't abort each other (server actions
    // serialise + cancel on re-render, which rendered thumbnails inconsistently). Dispatch
    // IMMEDIATELY — a deferred kickoff was getting cancelled by the customize page's rapid
    // mount re-renders, so the compose never fired. A superseded request is aborted; the
    // seq-gate ignores its result; the recovery effect retries a genuinely stuck one.
    const ctrl = new AbortController();
    const selfCompose = () =>
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
          ground: ground ?? undefined,
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
          // an aborted/superseded request is expected (the seq-gate ignores it); a genuine
          // failure retries, then settles (the recovery effect below also retries a stuck one)
          retryOrRest();
        });
    // In the range, its plan asks for this picture (in order, six at a time — src/lib/mockupPrefetch.ts):
    // tell it the tile is here, and let its effect run (just after this one, on the first render) before
    // asking alone — then wait for the plan's request instead.
    if (onNearRef.current) {
      onNearRef.current();
      const t = setTimeout(() => {
        if (!isLatest()) return;
        const planned = pendingMockup(inputKey);
        const got = cachedMockup(inputKey);
        if (planned) waitFor(planned);
        else if (got) show(got);
        else void selfCompose();
      }, 0);
      return () => {
        clearTimeout(t);
        ctrl.abort();
      };
    }
    void selfCompose();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tfKey is `transform` by value (a fresh object each render would refetch forever)
  }, [visible, assetId, variantId, tfKey, size, sourceObjectId, view, fill, ground, spanHalf, attempt, prefetchTick]);

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

  // The instant preview stands in until the photo lands (and stays under it while it fades in); a tile
  // the browser can't draw shows the plain product photo instead. Both are let go once the photo is in.
  const painted = (key: string | null) => {
    if (key && !key.startsWith('small:')) markPainted(key);
    onPaintedRef.current?.();
    // tells the create page's "making your range" loader that real pixels are on screen
    window.dispatchEvent(new Event(MOCKUP_READY_EVENT));
  };
  const underlay = underlayGoneKey !== inputKey;
  const ctx = instant && variantId && !view && !fill ? instantContext(variantId) : undefined;
  const instantLayer = ctx && underlay ? (
    <div className="absolute inset-0" data-instant>
      <InstantMockup
        // a new drawing or photo is a new picture: counted afresh
        key={`${instant!.src}|${ctx.blankUrl}`}
        ctx={ctx}
        src={instant!.src}
        aspect={instant!.aspect}
        transform={clampTransform((transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }) as Parameters<typeof clampTransform>[0])}
        ground={normalizeGround(ground)}
        // the instant preview counts as "real pixels" for the create page's loader
        onReady={() => painted(assetId ? inputKey : null)}
      />
    </div>
  ) : null;
  const photo = !ctx && standIn && variantId && !fill ? productPhoto(variantId, view) : undefined;
  const standInLayer = photo && underlay ? (
    <div className="absolute inset-0">
      <ProductPhotoStandIn photo={photo} />
    </div>
  ) : null;
  const under = instantLayer ?? standInLayer;

  // Busy = a newer photo is on its way and hasn't painted yet (and we haven't given up on it).
  // (a painted stand-in for this exact choice counts: it's the same picture, just smaller)
  const busy = loader && visible && !!assetId && !!variantId && !resting && paintedKey !== inputKey && paintedKey !== standInKey(inputKey);

  return (
    // h-full so a fixed-size parent (the square tile) bounds the preview; in an auto-height
    // parent (customize page) it falls back to content height and max-h-full is inert.
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      {under}
      {current ? (
        <img
          src={current}
          alt={`your drawing on a ${productKey}`}
          width={px}
          height={px}
          className={`h-auto max-h-full w-full rounded-lg object-contain ${under ? 'relative motion-safe:animate-[fade_.35s_ease-out]' : ''}`}
          onLoad={() => {
            setPaintedKey(currentKey);
            painted(currentKey);
            // the photo has faded in over the instant preview / product photo: let that go
            const k = currentKey;
            if (k) setTimeout(() => mountedRef.current && setUnderlayGoneKey(k), 450);
          }}
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
      ) : under || !placeholder ? null : (
        // No photo yet: a calm oat block, pulsing only while work is under way —
        // deliberately never the SVG stand-in (founder call).
        <div
          aria-hidden
          className={`h-full w-full rounded-lg bg-line ${resting ? '' : 'motion-safe:animate-pulse'}`}
          style={{ minHeight: Math.min(px, 220) }}
        />
      )}
      {busy ? <PreviewLoader /> : null}
    </div>
  );
}
