'use client';

import { IconAlertTriangle, IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconCircleCheck, IconRotateClockwise, IconShoppingBag, IconSparkles, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { gbp, toast, useBasket, usePlacements, useSelection } from '@/lib/store';
import { defaultTransformFor } from '@/lib/catalogue-view';
import type { ProductKey } from '@/ui/components/ProductArt';
import { renderPreviewAction, type RenderPreviewResult } from '@/app/actions/render';
import { removeBackgroundAction } from '@/app/actions/magic';
import { mockupContextAction, type MockupContext } from '@/app/actions/mockup';
import {
  assessResolution,
  canvasSizePx,
  clampTransform,
  computeLayerRect,
  containScale,
  MAX_ZOOM,
  MIN_SCALE,
  mmToPx,
  type Rotation,
  type Transform,
} from '@/server/print/geometry';
import type { StudioData, StudioVariant } from '@/server/studio';

/** The editor canvas is deliberately MUCH larger than the customize-page preview
 * (founder call 2026-07-07: "I can barely see the guides"). MAX caps it so the controls
 * column still fits beside it on desktop; SSR default is a calm stable width used until
 * the ResizeObserver measures the real available space (no window read during render). */
const MAX_PREVIEW_W = 680;
const SSR_PREVIEW_W = 420;
const SNAP_OFFSET = 0.07; // |offset| within this of centre snaps to 0 (with a guide flash)
const FIT_SNAP = 0.03; // scale within 3% of "fit" snaps back to the contain sentinel
const NUDGE = 0.05; // arrow-key offset step (Shift = ×4)
const DOUBLE_TAP_MS = 300;
const HISTORY_COALESCE_MS = 800; // slider drags / key bursts collapse into one undo entry

export function Positioner({
  data,
  draft = false,
  returnTo,
  focusVariantId,
}: {
  data: StudioData;
  draft?: boolean;
  returnTo?: string;
  /** Arrived from Customize for ONE specific product+variant: scope the editor to it —
   * this session edits THAT creation's placement, not the whole catalogue. */
  focusVariantId?: string;
}) {
  const focused = Boolean(focusVariantId && data.variants.some((v) => v.id === focusVariantId));
  // The editor is ALWAYS scoped to one creation (founder call 2026-07-07 — no catalogue
  // in here). When focused, data.variants is the creation's orientation pair (server-
  // scoped) so the portrait/landscape toggle can switch between them. Unfocused (member
  // home entry) scopes to the first product's default.
  const variants = focused ? data.variants : data.variants.slice(0, 1);
  const [assetIdx, setAssetIdx] = useState(0);
  const [variantId, setVariantId] = useState((focused ? focusVariantId : undefined) ?? data.variants[0]?.id ?? '');
  // scale 0 = the CONTAIN sentinel: "fit the whole image" — the default placement. It
  // re-resolves automatically when the product or rotation changes; a touched zoom
  // becomes a concrete number. Hydrates from the SAVED placement for this creation
  // (edit resumes where you left it); otherwise the product's default — a frame
  // starts COVER-filled (no white margins), everything else contains.
  const [tf, setTf] = useState<Transform>(() => {
    const v0 = data.variants.find((v) => v.id === ((focused ? focusVariantId : undefined) ?? data.variants[0]?.id));
    const keepsake0 = data.keepsakes[0];
    const saved = v0 && keepsake0 ? usePlacements.getState().placements[`${keepsake0.id}-${v0.productKey}`] : undefined;
    // saved placements only ever come from this editor, whose rotations are quarter
    // turns — the assertion narrows the persisted number back to the Rotation union.
    if (saved) return saved as Transform;
    return { scale: defaultTransformFor(v0?.productKey ?? '').scale, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  const [cutout, setCutout] = useState<{ url: string; sourceObjectId: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  // The product context: blank photo + print-area quad (+ silhouette mask) — so the image
  // is placed ON the product, not on an abstract canvas. Falls back to the flat canvas.
  const [ctx, setCtx] = useState<MockupContext | null>(null);
  // Contrado-style view toggle: the exact flat PRINT LAYOUT (the order-of-record view —
  // DEFAULT + first option, so placement is precise about what prints; founder call
  // 2026-07-07), or ON the product photo. Product view only when a photo exists.
  const [viewMode, setViewMode] = useState<'flat' | 'product'>('flat');
  const imgRef = useRef<HTMLImageElement>(null);
  // Callback ref: capture natural dimensions the instant the <img> attaches IF it is
  // already loaded (a cached image fires no onLoad — that race left `natural` null, so
  // the whole editor had no placement and no resize grips). onLoad still covers the
  // not-yet-loaded case.
  const setImgEl = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (el && el.complete && el.naturalWidth > 0) {
      setNatural((prev) => (prev && prev.w === el.naturalWidth && prev.h === el.naturalHeight ? prev : { w: el.naturalWidth, h: el.naturalHeight }));
    }
  }, []);
  // Responsive canvas width, measured from the full-width grid container via a
  // ResizeObserver — so it's the largest canvas that fits (founder: "make it bigger"),
  // updates as the layout changes, and starts from an SSR-stable default (no reading
  // window during render → no hydration mismatch).
  const gridRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(SSR_PREVIEW_W);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const gw = el.clientWidth;
      // On desktop the controls column sits beside the canvas; reserve room for it.
      const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
      const avail = desktop ? gw - 396 : gw;
      setPreviewW(Math.max(320, Math.min(MAX_PREVIEW_W, Math.floor(avail))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const router = useRouter();
  const addToBasket = useBasket((s) => s.add);
  const setPlacement = usePlacements((s) => s.setPlacement);

  // ── Direct manipulation + history ──────────────────────────────────────────
  // Gestures apply a LIVE css transform on the image via CSS vars (60fps, no React
  // re-render per move) and COMMIT through the same shared geometry on release —
  // what you dragged is exactly what prints. Undo coalesces continuous input
  // (slider drags, key bursts) into single entries.
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const undoRef = useRef<Transform[]>([]);
  const redoRef = useRef<Transform[]>([]);
  const lastPushRef = useRef(0);
  const [, setHistVer] = useState(0); // re-render for undo/redo button states
  const [dragging, setDragging] = useState(false);
  const [snapAxis, setSnapAxis] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const snapAxisRef = useRef(snapAxis);
  const hintedRef = useRef(false);
  const lastTapRef = useRef(0);
  const gestureRef = useRef<null | {
    pointers: Map<number, { x: number; y: number; startX: number; startY: number }>;
    base: Transform; // tf when the gesture (or its current phase) began
    baseDist: number | null; // two-pointer start distance (pinch)
    moved: boolean;
    at: number; // last activity — a pointer whose pointerup never arrives must not poison the editor
  }>(null);
  const GESTURE_STALE_MS = 2000;

  const sameTf = (a: Transform, b: Transform) =>
    a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.rotationDeg === b.rotationDeg;

  const pushHistory = useCallback((prev: Transform) => {
    const now = Date.now();
    if (now - lastPushRef.current > HISTORY_COALESCE_MS) {
      undoRef.current.push(prev);
      if (undoRef.current.length > 50) undoRef.current.shift();
      redoRef.current = [];
      setHistVer((v) => v + 1);
    }
    lastPushRef.current = now;
  }, []);

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(tfRef.current);
    lastPushRef.current = 0;
    setResult(null);
    setTf(prev);
    setHistVer((v) => v + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(tfRef.current);
    lastPushRef.current = 0;
    setResult(null);
    setTf(next);
    setHistVer((v) => v + 1);
  };

  const keepsake = data.keepsakes[assetIdx];
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];

  if (!keepsake || !variant) {
    return (
      <Shell back={returnTo ?? (draft ? '/start-creating' : '/home')}>
        <div className="rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-8 text-center text-sm text-[#6F6358]">
          Keep a drawing in your keepsake home first — then you can place it on a product here.
          <div className="mt-4">
            <Button href="/start-creating" size="md">
              start creating
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const t = variant.template;
  const isJigsaw = variant.productKey === 'jigsaw';
  // A FRAME DEFAULTS to cover-filled (scale 1 = "1.0×", no margins), but the shopper CAN
  // zoom out to 0.5× if they want a border (founder call 2026-07-07). So its zoom floors
  // at 0.5 of cover — below the fit-centred model other products use.
  const filledDefault = defaultTransformFor(variant.productKey).scale === 1;
  const scaleFloor = filledDefault ? 0.5 : MIN_SCALE;
  const canvas = canvasSizePx(t);
  const aspect = canvas.width / canvas.height;
  const previewH = Math.round(previewW / aspect);
  const scale = previewW / canvas.width; // canvas-px → preview-px
  const bleedPxv = mmToPx(t.bleedMm, t.requiredDpi);

  const rect = natural ? computeLayerRect(t, { width: natural.w, height: natural.h }, tf) : null;
  const assess = natural ? assessResolution(t, { width: natural.w, height: natural.h }, tf) : null;
  // "Fit the whole image" scale for THIS product + rotation — the zoom slider's centre.
  const fitScale = natural ? containScale(t, { width: natural.w, height: natural.h }, tf.rotationDeg) : 1;
  const zoomValue = tf.scale === 0 ? fitScale : tf.scale;

  // The ACTIONABLE fix for a soft/blocked placement: effective dpi ∝ 1/scale, so the
  // largest print-ready zoom is current·(dpi/required). Offered only when it's actually
  // reachable on the zoom track (≥ fit/2) — otherwise the honest advice stays "smaller
  // product", and we never fake it.
  const dpiFix = useMemo<{ scale: number; kind: 'ok' | 'enhance' } | null>(() => {
    if (!assess || assess.decision === 'OK') return null;
    // dpi ∝ 1/scale, so the largest zoom that reaches a dpi d is zoom·(effective/d).
    // Prefer full print-ready; from BLOCK, falling back to the enhanceable tier
    // (required/2 → classical resample) still un-blocks the order honestly. The
    // 0.995 nudges the landing safely inside the boundary against px rounding.
    const floor = filledDefault ? scaleFloor : Math.max(fitScale / 2, MIN_SCALE);
    const scaleFor = (d: number) => zoomValue * (assess.effectiveDpi / d) * 0.995;
    const ok = scaleFor(assess.requiredDpi);
    const enhance = scaleFor(assess.requiredDpi / 2);
    const pick =
      ok >= floor
        ? { scale: ok, kind: 'ok' as const }
        : assess.decision === 'BLOCK' && enhance >= floor
          ? { scale: enhance, kind: 'enhance' as const }
          : null;
    if (!pick) return null; // unreachable — the honest advice stays "smaller product"
    // never snap a filled product to the contain sentinel (that would letterbox it)
    return { ...pick, scale: !filledDefault && Math.abs(pick.scale - fitScale) < fitScale * FIT_SNAP ? 0 : pick.scale };
  }, [assess, zoomValue, fitScale, filledDefault, scaleFloor]);

  // Load the product context whenever the variant changes (photoreal products only).
  useEffect(() => {
    let live = true;
    setCtx(null);
    if (!variantId) return;
    void mockupContextAction({ variantId }).then((c) => { if (live) setCtx(c); });
    return () => { live = false; };
  }, [variantId]);

  const setRot = () => {
    const next = (((tf.rotationDeg + 90) % 360) as Rotation);
    update({ rotationDeg: next });
  };

  // Orientation toggle (frames): switch to the same-size+colour sibling in the chosen
  // orientation. Its own template flips the canvas aspect; the placement carries over.
  // Persist the choice so Customize reflects it on save & return.
  const available = new Set(variants.map((v) => v.orientation).filter(Boolean));
  const orientations = (['portrait', 'landscape'] as const).filter((o) => available.has(o));
  const switchOrientation = (o: string) => {
    const target = variants.find((v) => v.orientation === o);
    if (!target || target.id === variantId) return;
    setResult(null);
    setVariantId(target.id);
    useSelection.getState().setSelection(target.productKey, { orientation: o });
  };
  /** Commit a placement change. Accepts a function so rapid bursts (key auto-repeat,
   * queued events) COMPOUND instead of all reading the same stale snapshot — a direct
   * patch would collapse 20 zoom presses into one step. The history push runs inside
   * the updater; the time-coalesce guard makes StrictMode's double-invoke harmless. */
  const update = (patch: Partial<Transform> | ((prev: Transform) => Partial<Transform>)) => {
    setResult(null);
    setTf((prev) => {
      const p = typeof patch === 'function' ? patch(prev) : patch;
      const next = clampTransform({ ...prev, ...p });
      if (!sameTf(next, prev)) pushHistory(prev);
      return next;
    });
  };

  /** Zoom by a factor around the current placement. For a filled product (frame) the
   * floor is cover (scale 1) so it never letterboxes; otherwise it snaps back to "fit"
   * (the contain sentinel) within a whisker. The keyboard/wheel/pinch zoom core. */
  const zoomBy = (factor: number) => {
    update((prev) => {
      const s0 = prev.scale === 0 ? fitScale : prev.scale;
      const next = Math.min(MAX_ZOOM, Math.max(scaleFloor, s0 * factor));
      if (!filledDefault && Math.abs(next - fitScale) < fitScale * FIT_SNAP) return { scale: 0 };
      return { scale: next };
    });
  };

  const generate = async () => {
    if (rendering) return;
    setRendering(true);
    try {
      const res = await renderPreviewAction({ assetId: keepsake.id, variantId: variant.id, transform: tf, sourceObjectId: cutout?.sourceObjectId });
      setResult(res);
    } finally {
      setRendering(false);
    }
  };

  // Self-hosted magic edit — remove the background (in-region, never a third party).
  const removeBg = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await removeBackgroundAction({ assetId: keepsake.id });
      if (res.ok) {
        setCutout({ url: res.url, sourceObjectId: res.sourceObjectId });
        setResult(null);
        toast('background removed ✨');
      } else if (res.reason === 'budget') {
        toast('that’s all your magic edits for now');
      } else if (res.reason === 'nochange') {
        toast('we couldn’t find a clean background to remove on this one');
      } else {
        toast('couldn’t do that — try again');
      }
    } finally {
      setRemoving(false);
    }
  };

  // Capture the placement onto the basket line. The server re-clamps + freezes it.
  const add = () => {
    // A pre-account ephemeral draft isn't orderable until it's kept (adopted into a
    // family). Send the guest to the keep/sign-in moment with their placement intact.
    if (draft) {
      sessionStorage.setItem(
        'sd_pending_place',
        JSON.stringify({ assetId: keepsake.id, variantId: variant.id, transform: tf, sourceObjectId: cutout?.sourceObjectId ?? null }),
      );
      toast('one quick step to keep & order ✨');
      router.push('/login?next=/checkout');
      return;
    }
    addToBasket({
      id: `pos-${keepsake.id}-${variant.id}`,
      name: variant.label,
      product: variant.productKey as ProductKey,
      pricePence: variant.pricePence,
      variantId: variant.id,
      artwork: { assetId: keepsake.id, transform: { ...tf }, sourceObjectId: cutout?.sourceObjectId },
    });
    toast('added to basket ✓');
    router.push('/checkout');
  };

  // Came from Customize/Checkout: save the placement and go back; the variant +
  // add-to-basket are finalised there (so the chosen size/colour can't be lost).
  const saveReturn = () => {
    setPlacement(`${keepsake.id}-${variant.productKey}`, { ...tf });
    // Reflect the (possibly toggled) orientation on the product page we return to.
    if (variant.orientation) useSelection.getState().setSelection(variant.productKey, { orientation: variant.orientation });
    toast('placement saved ✓');
    if (returnTo) router.push(returnTo);
  };

  // image placement inside the (clipped) preview canvas
  const imgStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!rect) return undefined;
    const swap = tf.rotationDeg % 180 !== 0;
    const boxW = rect.width * scale;
    const boxH = rect.height * scale;
    const imgW = (swap ? rect.height : rect.width) * scale; // pre-rotation size
    const imgH = (swap ? rect.width : rect.height) * scale;
    return {
      position: 'absolute',
      left: rect.x * scale + boxW / 2,
      top: rect.y * scale + boxH / 2,
      width: imgW,
      height: imgH,
      // Cover-fill DELIBERATELY oversizes the image past the aperture so overflow is
      // cropped — so it must be exempt from the global `img { max-width:100% }`, which
      // would otherwise cap only the overflowing axis and SQUISH the drawing.
      maxWidth: 'none',
      maxHeight: 'none',
      // --gx/--gy/--gk are the LIVE gesture deltas (set via ref, no re-render);
      // they read 0/1 outside a gesture, so this is the committed placement.
      transform: `translate(calc(-50% + var(--gx, 0px)), calc(-50% + var(--gy, 0px))) rotate(${tf.rotationDeg}deg) scale(var(--gk, 1))`,
      objectFit: 'fill',
    };
  }, [rect, scale, tf.rotationDeg]);

  // ── Product-backdrop geometry (preview px): the print-area quad on the blank photo, and
  // the image's placement INSIDE it via the SAME shared geometry as the print renderer and
  // the compositor — you're placing the image on the product, and what you see is what prints.
  const bd = useMemo(() => {
    if (!ctx || !ctx.ok) return null;
    const pvH = Math.round((previewW * ctx.blankH) / ctx.blankW);
    const qx = ctx.quad[0]![0] * previewW;
    const qy = ctx.quad[0]![1] * pvH;
    const qw = (ctx.quad[1]![0] - ctx.quad[0]![0]) * previewW;
    const qh = (ctx.quad[3]![1] - ctx.quad[0]![1]) * pvH;
    return { pvH, qx, qy, qw, qh, s: qw / t.printWidthPx };
  }, [ctx, t]);

  const bdImgStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!bd || !natural) return undefined;
    const geomPv = { printWidthPx: Math.max(1, Math.round(bd.qw)), printHeightPx: Math.max(1, Math.round(bd.qh)), bleedMm: t.bleedMm, requiredDpi: t.requiredDpi * bd.s };
    const r = computeLayerRect(geomPv, { width: natural.w, height: natural.h }, tf);
    const bleedPv = (r.canvasWidth - Math.round(bd.qw)) / 2;
    const swap = tf.rotationDeg % 180 !== 0;
    const imgW = swap ? r.height : r.width;
    const imgH = swap ? r.width : r.height;
    return {
      position: 'absolute',
      left: r.x - bleedPv + r.width / 2,
      top: r.y - bleedPv + r.height / 2,
      width: imgW,
      height: imgH,
      // exempt from `img { max-width:100% }` — cover-fill oversizes past the aperture on
      // purpose (see imgStyle); the cap would squish the overflowing axis otherwise.
      maxWidth: 'none',
      maxHeight: 'none',
      transform: `translate(calc(-50% + var(--gx, 0px)), calc(-50% + var(--gy, 0px))) rotate(${tf.rotationDeg}deg) scale(var(--gk, 1))`,
      objectFit: 'fill',
    };
  }, [bd, natural, tf, t]);

  // ── Gesture-space geometry: pan slack + preview-px-per-space-px for whichever canvas
  // mode is live. Slack = |draw − canvas| (matches computeLayerRect): art can pan whether
  // it OVERFLOWS the canvas (slide the crop) or is smaller than it (zoomed out below cover
  // → slide within the margins). Only when it EXACTLY fills an axis is that axis locked.
  const gestureGeom = useMemo(() => {
    if (!natural) return null;
    const src = { width: natural.w, height: natural.h };
    if (bd) {
      const geomPv = { printWidthPx: Math.max(1, Math.round(bd.qw)), printHeightPx: Math.max(1, Math.round(bd.qh)), bleedMm: t.bleedMm, requiredDpi: t.requiredDpi * bd.s };
      const geom = (probe: Transform) => {
        const r = computeLayerRect(geomPv, src, probe);
        return { slackX: Math.abs(r.width - r.canvasWidth), slackY: Math.abs(r.height - r.canvasHeight) };
      };
      return { geom, pxPerSpace: 1 };
    }
    const geom = (probe: Transform) => {
      const r = computeLayerRect(t, src, probe);
      return { slackX: Math.abs(r.width - r.canvasWidth), slackY: Math.abs(r.height - r.canvasHeight) };
    };
    return { geom, pxPerSpace: scale };
  }, [bd, natural, t, scale]);
  const slackNow = gestureGeom ? gestureGeom.geom(tf) : { slackX: 0, slackY: 0 };

  /** Live pointer deltas → the css-var transform on the image (no re-render). */
  const applyLive = (dxPv: number, dyPv: number, k: number) => {
    const el = imgRef.current;
    if (!el) return;
    el.style.setProperty('--gx', `${dxPv}px`);
    el.style.setProperty('--gy', `${dyPv}px`);
    el.style.setProperty('--gk', `${k}`);
  };
  const clearLive = () => {
    const el = imgRef.current;
    if (!el) return;
    el.style.removeProperty('--gx');
    el.style.removeProperty('--gy');
    el.style.removeProperty('--gk');
  };

  /** Current gesture deltas in preview px (+ pinch factor) from live pointers. */
  const gestureDeltas = () => {
    const g = gestureRef.current!;
    const pts = [...g.pointers.values()];
    if (pts.length >= 2 && g.baseDist) {
      const [p1, p2] = pts;
      const k = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y) / g.baseDist;
      const dx = (p1!.x - p1!.startX + p2!.x - p2!.startX) / 2;
      const dy = (p1!.y - p1!.startY + p2!.y - p2!.startY) / 2;
      return { dx, dy, k };
    }
    const p = pts[0];
    return p ? { dx: p.x - p.startX, dy: p.y - p.startY, k: 1 } : { dx: 0, dy: 0, k: 1 };
  };

  /** Commit the live gesture through the SHARED geometry (what you see is what prints). */
  const commitGesture = () => {
    const g = gestureRef.current;
    if (!g || !gestureGeom) return;
    const { dx, dy, k } = gestureDeltas();
    clearLive();
    if (!g.moved && k === 1) return; // a tap, not a gesture — nothing to commit

    const s0 = g.base.scale === 0 ? fitScale : g.base.scale;
    let nextScale: number = Math.min(MAX_ZOOM, Math.max(scaleFloor, s0 * k));
    if (!filledDefault && Math.abs(nextScale - fitScale) < fitScale * FIT_SNAP) nextScale = 0;

    // Pan against the slack AT THE NEW SCALE (the range grows as you zoom in).
    const { slackX, slackY } = gestureGeom.geom({ ...g.base, scale: nextScale });
    const dxSpace = dx / gestureGeom.pxPerSpace;
    const dySpace = dy / gestureGeom.pxPerSpace;
    let offsetX = slackX > 0 ? Math.max(-1, Math.min(1, g.base.offsetX + (2 * dxSpace) / slackX)) : 0;
    let offsetY = slackY > 0 ? Math.max(-1, Math.min(1, g.base.offsetY + (2 * dySpace) / slackY)) : 0;
    if (Math.abs(offsetX) < SNAP_OFFSET) offsetX = 0; // snap to centre
    if (Math.abs(offsetY) < SNAP_OFFSET) offsetY = 0;

    setResult(null);
    const next = clampTransform({ ...g.base, scale: nextScale, offsetX, offsetY });
    if (!sameTf(next, g.base)) pushHistory(g.base);
    lastPushRef.current = 0; // a gesture is its own undo entry — never coalesced away
    setTf(next);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureGeom) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keeps moves flowing off-element
    } catch {
      // capture is an optimisation; a pointer that can't be captured still drags
    }
    let g = gestureRef.current;
    // A gesture whose pointers stopped reporting (missed pointerup/cancel — happens on
    // interrupted touches) is abandoned, never joined: start fresh.
    if (g && Date.now() - g.at > GESTURE_STALE_MS) {
      clearLive();
      g = null;
      gestureRef.current = null;
    }
    if (!g) {
      g = { pointers: new Map(), base: tfRef.current, baseDist: null, moved: false, at: Date.now() };
      gestureRef.current = g;
      setDragging(true);
    } else {
      // A second finger joins mid-drag: fold the pan so far into the base, then pinch.
      commitGesture();
      g.base = tfRef.current;
      g.moved = false;
    }
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    g.at = Date.now();
    if (g.pointers.size === 2) {
      const [p1, p2] = [...g.pointers.values()];
      for (const p of g.pointers.values()) {
        p.startX = p.x;
        p.startY = p.y;
      }
      g.baseDist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y) || 1;
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || !gestureGeom) return;
    const p = g.pointers.get(e.pointerId);
    if (!p) return;
    g.at = Date.now();
    p.x = e.clientX;
    p.y = e.clientY;
    const { dx, dy, k } = gestureDeltas();
    if (Math.abs(dx) + Math.abs(dy) > 3 || Math.abs(k - 1) > 0.01) g.moved = true;

    // Dragging at "fit" with no slack: nothing CAN move — say so once, honestly.
    const { slackX, slackY } = gestureGeom.geom({ ...g.base, scale: g.base.scale === 0 ? 0 : g.base.scale * k });
    if (g.moved && k === 1 && slackX === 0 && slackY === 0) {
      if (!hintedRef.current) {
        hintedRef.current = true;
        toast('the drawing fills the frame exactly here — zoom in or out a touch to move it around');
      }
      return;
    }

    // Snap-to-centre pinning (drag only): pin the live delta on a snapped axis so the
    // image visibly clicks to centre, with a guide flash.
    let liveDx = slackX > 0 ? dx : 0;
    let liveDy = slackY > 0 ? dy : 0;
    let snapX = false;
    let snapY = false;
    if (k === 1) {
      const slackPvX = slackX * gestureGeom.pxPerSpace;
      const slackPvY = slackY * gestureGeom.pxPerSpace;
      if (slackX > 0) {
        const o = g.base.offsetX + (2 * (dx / gestureGeom.pxPerSpace)) / slackX;
        if (Math.abs(o) < SNAP_OFFSET) {
          liveDx = (-g.base.offsetX * slackPvX) / 2;
          snapX = true;
        }
      }
      if (slackY > 0) {
        const o = g.base.offsetY + (2 * (dy / gestureGeom.pxPerSpace)) / slackY;
        if (Math.abs(o) < SNAP_OFFSET) {
          liveDy = (-g.base.offsetY * slackPvY) / 2;
          snapY = true;
        }
      }
    }
    if (snapX !== snapAxisRef.current.x || snapY !== snapAxisRef.current.y) {
      snapAxisRef.current = { x: snapX, y: snapY };
      setSnapAxis(snapAxisRef.current);
    }
    applyLive(liveDx, liveDy, k);
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const wasTap = !g.moved && g.pointers.size === 1;
    commitGesture();
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      gestureRef.current = null;
      setDragging(false);
      if (snapAxisRef.current.x || snapAxisRef.current.y) {
        snapAxisRef.current = { x: false, y: false };
        setSnapAxis(snapAxisRef.current);
      }
      if (wasTap) {
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          // double-tap: reset — a filled product (frame) snaps back to cover (no margins);
          // others toggle fit ↔ fill.
          update((prev) => (filledDefault ? { scale: 1, offsetX: 0, offsetY: 0 } : { scale: prev.scale === 0 ? 1 : 0, offsetX: 0, offsetY: 0 }));
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    } else {
      // one finger lifted mid-pinch: continue as a fresh drag with the other finger
      g.base = tfRef.current;
      g.baseDist = null;
      g.moved = false;
      for (const p of g.pointers.values()) {
        p.startX = p.x;
        p.startY = p.y;
      }
    }
  };

  // Keyboard equivalents (WCAG 2.5.1/2.5.7): every gesture has a key.
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const key = e.key;
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    switch (key) {
      case 'ArrowLeft':
        update((prev) => ({ offsetX: prev.offsetX - step }));
        break;
      case 'ArrowRight':
        update((prev) => ({ offsetX: prev.offsetX + step }));
        break;
      case 'ArrowUp':
        update((prev) => ({ offsetY: prev.offsetY - step }));
        break;
      case 'ArrowDown':
        update((prev) => ({ offsetY: prev.offsetY + step }));
        break;
      case '+':
      case '=':
        zoomBy(1.08);
        break;
      case '-':
      case '_':
        zoomBy(1 / 1.08);
        break;
      case 'r':
      case 'R':
        setRot();
        break;
      case 'f':
      case 'F':
      case '0':
        update({ scale: filledDefault ? 1 : 0, offsetX: 0, offsetY: 0 });
        break;
      default:
        return; // unhandled — let it through
    }
    e.preventDefault();
  };

  // ── Drag-to-resize (corner handles) + wheel zoom (founder call 2026-07-07: "drag
  // and drop scaling"). A handle scales the drawing UNIFORMLY about its centre — the
  // aspect ratio is fixed (never squishes). It commits through the same shared geometry
  // as pinch/slider, so preview == print. (Non-uniform shift-stretch is a deliberate
  // follow-up — it changes the printed file and needs scaleX/scaleY through the whole
  // pipeline.) Scaling is floored at cover for a filled product so the frame stays full.
  const resizeRef = useRef<null | { cx: number; cy: number; startDist: number; base: Transform }>(null);
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const img = imgRef.current;
    if (!img) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is an optimisation; the drag still works without it
    }
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    resizeRef.current = { cx, cy, startDist, base: tfRef.current };
    setDragging(true);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = resizeRef.current;
    if (!h) return;
    const d = Math.hypot(e.clientX - h.cx, e.clientY - h.cy);
    applyLive(0, 0, Math.max(0.05, d / h.startDist)); // uniform live scale about centre
  };
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = resizeRef.current;
    if (!h) return;
    const d = Math.hypot(e.clientX - h.cx, e.clientY - h.cy);
    const k = d / h.startDist;
    clearLive();
    const s0 = h.base.scale === 0 ? fitScale : h.base.scale;
    let nextScale = Math.min(MAX_ZOOM, Math.max(scaleFloor, s0 * k));
    if (!filledDefault && Math.abs(nextScale - fitScale) < fitScale * FIT_SNAP) nextScale = 0;
    setResult(null);
    const next = clampTransform({ ...h.base, scale: nextScale });
    if (!sameTf(next, h.base)) pushHistory(h.base);
    lastPushRef.current = 0; // a resize is its own undo entry
    setTf(next);
    resizeRef.current = null;
    setDragging(false);
  };
  const handleProps = {
    onPointerDown: onHandlePointerDown,
    onPointerMove: onHandlePointerMove,
    onPointerUp: onHandlePointerUp,
    onPointerCancel: onHandlePointerUp,
  };

  /** Wheel = zoom (desktop). Non-passive via a ref effect so preventDefault stops the
   * page scrolling under the cursor. */
  const canvasElRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.06 : 1 / 1.06);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // zoomBy closes over fitScale/scaleFloor; re-bind when they change so the floor is
    // current, and when viewMode flips (the canvas element itself swaps).
  }, [fitScale, scaleFloor, filledDefault, viewMode]);

  const canvasInteractionProps = {
    ref: canvasElRef,
    onPointerDown: onCanvasPointerDown,
    onPointerMove: onCanvasPointerMove,
    onPointerUp: onCanvasPointerUp,
    onPointerCancel: onCanvasPointerUp,
    onKeyDown: onCanvasKeyDown,
    tabIndex: 0,
    role: 'application',
    'aria-label':
      'drawing position. drag to move, drag a corner or scroll or pinch or press plus and minus to resize, double-tap to reset, R to rotate, arrow keys to nudge, F to reset.',
  } as const;
  const canvasInteractionClass = `touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-cinnamon focus-visible:ring-offset-2 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`;
  const maskStyle: React.CSSProperties | undefined = ctx && ctx.ok && ctx.maskUrl
    ? {
        WebkitMaskImage: `url(${ctx.maskUrl})`,
        maskImage: `url(${ctx.maskUrl})`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        maskMode: 'luminance',
      }
    : undefined;

  // The ONE guide (founder call 2026-07-07 — the old "print area" + "keep inside" pair
  // confused): a single clear rectangle = the frame opening / what prints, with corner
  // grips to drag-resize. `box` is in preview px for the current view.
  const renderSelection = (box: { left: number; top: number; w: number; h: number }) => {
    const corners = [
      ['tl', box.left, box.top, 'nwse-resize'],
      ['tr', box.left + box.w, box.top, 'nesw-resize'],
      ['bl', box.left, box.top + box.h, 'nesw-resize'],
      ['br', box.left + box.w, box.top + box.h, 'nwse-resize'],
    ] as const;
    return (
      <>
        <div
          className="pointer-events-none absolute rounded-[3px] border-2 border-cinnamon/85"
          style={{ left: box.left, top: box.top, width: box.w, height: box.h }}
        />
        {natural
          ? corners.map(([k, x, y, cur]) => (
              <div
                key={k}
                {...handleProps}
                role="button"
                aria-label="drag to resize the drawing"
                className="absolute z-20 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-cinnamon bg-white shadow-[0_1px_3px_rgba(46,39,35,.35)] before:absolute before:-inset-[11px] before:content-['']"
                style={{ left: x, top: y, cursor: cur }}
              />
            ))
          : null}
      </>
    );
  };

  return (
    <Shell back={returnTo ?? (draft ? '/start-creating' : '/home')}>
      <div ref={gridRef} className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* Canvas — the image ON the product (photo backdrop) when a template exists;
            the flat print canvas otherwise (or on request). Same shared geometry either way. */}
        <div>
          {bd && ctx && ctx.ok ? (
            <div className="mb-2 flex gap-1.5" role="group" aria-label="preview view">
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                aria-pressed={viewMode === 'flat'}
                className={`relative rounded-full border px-3 py-1 text-[11px] font-bold before:absolute before:-inset-[6px] before:content-[''] ${viewMode === 'flat' ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
              >
                print layout
              </button>
              <button
                type="button"
                onClick={() => setViewMode('product')}
                aria-pressed={viewMode === 'product'}
                className={`relative rounded-full border px-3 py-1 text-[11px] font-bold before:absolute before:-inset-[6px] before:content-[''] ${viewMode === 'product' ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
              >
                {isJigsaw ? 'on the board' : 'in the frame'}
              </button>
            </div>
          ) : null}
          {bd && ctx && ctx.ok && viewMode === 'product' ? (
            <div
              {...canvasInteractionProps}
              className={`relative overflow-hidden rounded-lg border border-[#EADFC9] bg-[#FBF5E9] ${canvasInteractionClass}`}
              style={{ width: previewW, height: bd.pvH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ctx.blankUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
              <div className="absolute inset-0" style={maskStyle}>
                <div className="absolute overflow-hidden" style={{ left: bd.qx, top: bd.qy, width: bd.qw, height: bd.qh }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={setImgEl}
                    src={cutout?.url ?? keepsake.imageUrl}
                    alt="your keepsake"
                    draggable={false}
                    style={bdImgStyle}
                    onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  />
                </div>
              </div>
              {/* "On the board" = as a puzzle: the die-cut piece lines over the placed art,
                  on the print-area quad. Under the guide + handles so they stay grabbable. */}
              {ctx.overlayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ctx.overlayUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute" style={{ left: bd.qx, top: bd.qy, width: bd.qw, height: bd.qh, maxWidth: 'none', maxHeight: 'none' }} />
              ) : null}
              {/* snap-to-centre guide flashes (drag only) */}
              {dragging && snapAxis.x ? (
                <div className="pointer-events-none absolute w-px bg-cinnamon/80" style={{ left: bd.qx + bd.qw / 2, top: bd.qy, height: bd.qh }} />
              ) : null}
              {dragging && snapAxis.y ? (
                <div className="pointer-events-none absolute h-px bg-cinnamon/80" style={{ top: bd.qy + bd.qh / 2, left: bd.qx, width: bd.qw }} />
              ) : null}
              {/* the ONE guide + resize grips (the frame opening) */}
              {renderSelection({ left: bd.qx, top: bd.qy, w: bd.qw, h: bd.qh })}
            </div>
          ) : (
            <div
              {...canvasInteractionProps}
              className={`relative overflow-hidden rounded-lg border border-[#EADFC9] bg-[#FBF5E9] ${canvasInteractionClass}`}
              style={{ width: previewW, height: previewH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={setImgEl}
                src={cutout?.url ?? keepsake.imageUrl}
                alt="your keepsake"
                draggable={false}
                style={imgStyle}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {/* snap-to-centre guide flashes (drag only) */}
              {dragging && snapAxis.x ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-cinnamon/80" /> : null}
              {dragging && snapAxis.y ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-cinnamon/80" /> : null}
              {/* the ONE guide + resize grips (what prints / shows in the frame) */}
              {renderSelection({ left: bleedPxv * scale, top: bleedPxv * scale, w: previewW - 2 * bleedPxv * scale, h: previewH - 2 * bleedPxv * scale })}
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-[#9C8772]">
            the <b className="text-cinnamon">outlined box</b> is what shows in the frame · drag a corner to resize · keep faces &amp; words a little in from the edges
          </p>

          {/* DPI status — live (recomputed on every zoom/rotate commit), with the FIX
              offered right where the warning is, never a dead end. */}
          {assess ? (
            <div
              className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold ${
                assess.decision === 'OK'
                  ? 'bg-[#EAF1E4] text-green-save'
                  : assess.decision === 'UPSCALE'
                    ? 'bg-honey-band text-[#8A5B22]'
                    : 'bg-[#FBE4DA] text-berry'
              }`}
            >
              <Icon icon={assess.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={15} />
              <span className="min-w-0 flex-1">
                {assess.decision === 'OK'
                  ? `print-ready · ${t.requiredDpi} dpi`
                  : assess.decision === 'UPSCALE'
                    ? `we'll gently enhance it (about ${assess.effectiveDpi} dpi here)`
                    : dpiFix !== null
                      ? 'too soft at this zoom'
                      : 'too small to print well here — try a smaller product'}
              </span>
              {dpiFix !== null ? (
                <button
                  type="button"
                  onClick={() => update({ scale: dpiFix.scale })}
                  className="relative rounded-full border border-current px-2.5 py-1 text-[11px] font-bold before:absolute before:-inset-[6px] before:content-['']"
                >
                  {dpiFix.kind === 'ok' ? 'zoom out to print-ready' : 'zoom out to fix'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Controls */}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Product</p>
          {/* Scoped to the ONE creation being customized — never a catalogue in here. */}
          <p className="mt-2 inline-flex rounded-full border border-cinnamon bg-[#FBEFE0] px-3 py-1.5 text-xs font-semibold text-cocoa">
            {variant.label} · {gbp(variant.pricePence)}
          </p>

          {/* Orientation — portrait / landscape, right here in the editor (founder call
              2026-07-07). Switching flips the canvas aspect to the sibling's template. */}
          {orientations.length > 1 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Orientation</p>
              <div className="mt-2 flex gap-1.5" role="group" aria-label="orientation">
                {orientations.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => switchOrientation(o)}
                    aria-pressed={variant.orientation === o}
                    className={`relative rounded-full border px-3 py-1.5 text-xs font-bold before:absolute before:-inset-[6px] before:content-[''] ${
                      variant.orientation === o ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {data.keepsakes.length > 1 ? (
            <>
              <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Keepsake</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.keepsakes.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setAssetIdx(i); setNatural(null); setResult(null); setCutout(null); }}
                    className={`h-12 w-12 overflow-hidden rounded-lg border-2 ${i === assetIdx ? 'border-cinnamon' : 'border-[#EFE6D6]'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={k.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Position</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={undoRef.current.length === 0}
                aria-label="undo placement change"
                className="relative rounded-full p-1.5 text-[#7A6A58] before:absolute before:-inset-[8px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconArrowBackUp} size={16} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={redoRef.current.length === 0}
                aria-label="redo placement change"
                className="relative rounded-full p-1.5 text-[#7A6A58] before:absolute before:-inset-[8px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconArrowForwardUp} size={16} />
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#9C8E7E]">drag the drawing to move it · drag a corner (or scroll / pinch) to resize · double-tap to reset</p>
          <div className="mt-2 space-y-3">
            <ZoomSlider
              fit={fitScale}
              value={zoomValue}
              filled={filledDefault}
              floor={scaleFloor}
              onChange={(v) =>
                filledDefault
                  ? update({ scale: Math.max(scaleFloor, v) }) // frame: never below cover (no margins)
                  : update({ scale: Math.abs(v - fitScale) < fitScale * 0.015 ? 0 : v })
              }
            />
            <Slider
              label="Left / right"
              min={-1}
              max={1}
              step={0.05}
              value={tf.offsetX}
              onChange={(v) => update({ offsetX: v })}
              format={() => ''}
              disabled={slackNow.slackX === 0}
              disabledHint="zoom in or out to move it sideways"
            />
            <Slider
              label="Up / down"
              min={-1}
              max={1}
              step={0.05}
              value={tf.offsetY}
              onChange={(v) => update({ offsetY: v })}
              format={() => ''}
              disabled={slackNow.slackY === 0}
              disabledHint="zoom in or out to move it up or down"
            />
            <button
              type="button"
              onClick={setRot}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E6D8BE] bg-white px-3 py-1.5 text-xs font-bold text-cocoa hover:border-honey"
            >
              <Icon icon={IconRotateClockwise} size={14} /> rotate ({tf.rotationDeg}°)
            </button>
          </div>

          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Magic</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={removeBg}
              disabled={removing}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                cutout ? 'border-meadow bg-[#EAF1E4] text-green-save' : 'border-[#E6D8BE] bg-white text-cocoa hover:border-honey'
              }`}
            >
              <Icon icon={cutout ? IconCircleCheck : IconSparkles} size={14} className={cutout ? '' : 'text-cinnamon'} />
              {removing ? 'removing…' : cutout ? 'background removed' : 'remove background'}
            </button>
            {cutout ? (
              <button
                type="button"
                onClick={() => { setCutout(null); setResult(null); }}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#9C8772] hover:text-cinnamon"
              >
                <Icon icon={IconX} size={13} /> undo
              </button>
            ) : null}
          </div>

          {returnTo ? (
            <Button size="lg" className="mt-5 w-full" onClick={saveReturn} disabled={assess?.decision === 'BLOCK'}>
              <Icon icon={IconArrowBackUp} size={16} /> save &amp; return
            </Button>
          ) : (
            <Button size="lg" className="mt-5 w-full" onClick={add} disabled={assess?.decision === 'BLOCK'}>
              <Icon icon={IconShoppingBag} size={16} />{' '}
              {draft ? `keep it & check out · ${gbp(variant.pricePence)}` : `add to basket · ${gbp(variant.pricePence)}`}
            </Button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={rendering || assess?.decision === 'BLOCK'}
            className="mt-2 w-full text-center text-xs font-bold text-cinnamon disabled:opacity-50"
          >
            {rendering ? 'rendering…' : 'preview the exact print file'}
          </button>

          {result && result.ok ? (
            <div className="mt-4 rounded-2xl border border-[#EADFC9] bg-white p-3">
              <p className="mb-2 text-[11px] font-bold text-green-save">your print file — exactly what gets made</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="rendered print file" className="w-full rounded-lg border border-[#EFE6D6]" />
              <p className="mt-2 text-[11px] text-[#9C8E7E]">
                {result.widthPx}×{result.heightPx}px · {result.renderedDpi} dpi{result.upscaled ? ' · gently enhanced' : ''}
              </p>
            </div>
          ) : result && !result.ok && result.blocked ? (
            <p className="mt-3 text-center text-xs text-berry">That placement is too low-res to print — zoom out or choose a smaller product.</p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/**
 * Zoom slider. Two modes:
 *  - FILLED (a frame): linear from cover (`floor`, shown as 1.0× — the frame is full)
 *    up to 4×. It never goes below cover, so the frame can't letterbox.
 *  - otherwise: "fit the whole image" sits at the CENTRE of the track — left half
 *    fit/2 → fit (more margin), right half fit → 4× (crop). Shown relative to fit.
 */
function ZoomSlider({ fit, value, filled, floor, onChange }: { fit: number; value: number; filled: boolean; floor: number; onChange: (v: number) => void }) {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const toT = filled
    ? (v: number) => (v - floor) / (MAX_ZOOM - floor || 1)
    : (v: number) => (v <= fit ? (0.5 * (v - fit / 2)) / (fit - fit / 2 || 1) : 0.5 + (0.5 * (v - fit)) / (MAX_ZOOM - fit || 1));
  const fromT = filled
    ? (raw: number) => floor + raw * (MAX_ZOOM - floor)
    : (raw: number) => (raw <= 0.5 ? fit / 2 + (raw / 0.5) * (fit - fit / 2) : fit + ((raw - 0.5) / 0.5) * (MAX_ZOOM - fit));
  const shown = filled ? value : value / fit; // filled: cover (scale 1) reads as 1.0×
  return (
    <label className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 text-[11px] text-[#6F6358]">Zoom</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={clamp01(toT(value))}
        aria-label="Zoom"
        onChange={(e) => onChange(fromT(Number(e.target.value)))}
        className="h-1.5 flex-1 accent-cinnamon"
      />
      <span className="w-8 shrink-0 text-right text-[11px] text-[#9C8E7E]">{`${shown.toFixed(1)}×`}</span>
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  disabled = false,
  disabledHint,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  /** Honest disabling: at "fit" there is no pan slack, so the slider would do nothing. */
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-45' : ''}`} title={disabled ? disabledHint : undefined}>
      <span className="w-[78px] shrink-0 text-[11px] text-[#6F6358]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={disabled && disabledHint ? `${label} — ${disabledHint}` : label}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 accent-cinnamon"
      />
      <span className="w-8 shrink-0 text-right text-[11px] text-[#9C8E7E]">{format(value)}</span>
    </label>
  );
}

function Shell({ children, back = '/home' }: { children: React.ReactNode; back?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href={back} aria-label="Back">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-lg font-semibold text-cocoa">snickerdoodle</Link>
        <span className="rounded-full bg-[#EFE4D0] px-2 py-0.5 text-[11px] font-bold text-[#7A6A58]">studio</span>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
