'use client';

import { tiltedRect } from '@/lib/studio-geometry';
import { IconAlertTriangle, IconArrowBackUp, IconArrowForwardUp, IconCircleCheck, IconRotateClockwise, IconShoppingBag, IconSparkles, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { designSig } from '@/lib/basket-line';
import { gbp, toast, useBasket, usePlacements, useSelection } from '@/lib/store';
import { defaultTransformFor } from '@/lib/catalogue-view';
import type { ProductKey } from '@/ui/components/ProductArt';
import { renderPreviewAction, type RenderPreviewResult } from '@/app/actions/render';
import { removeBackgroundAction } from '@/app/actions/magic';
import { mockupContextAction, type MockupContext } from '@/app/actions/mockup';
import {
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
import { assessPrintResolution, patternLayout } from '@/server/print/pattern-geometry';
import { heightChartArtGeom, heightChartLayout, isHeightChart, rulerBandSvg } from '@/server/print/height-chart-geometry';
import { groundHex as groundHexOf, isColouredGround, isGroundProduct, isPatternProduct } from '@/lib/patterns';
import { PatternRepeat } from './PatternRepeat';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import type { StudioData } from '@/server/studio';

/** The editor canvas is deliberately MUCH larger than the customize-page preview
 * (founder call 2026-07-07: "I can barely see the guides"). MAX caps it so the controls
 * column still fits beside it on desktop; SSR default is a calm stable width used until
 * the ResizeObserver measures the real available space (no window read during render). */
const MAX_PREVIEW_W = 680;
const SSR_PREVIEW_W = 420;
const SSR_MAX_PREVIEW_H = 640;
const SNAP_OFFSET = 0.07; // |offset| within this of centre snaps to 0 (with a guide flash)
const FIT_SNAP = 0.03; // scale within 3% of "fit" snaps back to the contain sentinel
const NUDGE = 0.05; // arrow-key offset step (Shift = ×4)
const DOUBLE_TAP_MS = 300;
const HISTORY_COALESCE_MS = 800; // slider drags / key bursts collapse into one undo entry

interface PositionerProps {
  data: StudioData;
  draft?: boolean;
  returnTo?: string;
  /** Arrived from Customize for ONE specific product+variant: scope the editor to it —
   * this session edits THAT creation's placement, not the whole catalogue. */
  focusVariantId?: string;
}

/** Nothing to place yet → a friendly nudge; otherwise the editor (whose hooks always run in order). */
export function Positioner(props: PositionerProps) {
  const { data, draft = false, returnTo } = props;
  if (!data.keepsakes[0] || !data.variants[0]) {
    return (
      <Shell back={returnTo ?? (draft ? '/start-creating' : '/home')}>
        <div className="pop-in mx-auto max-w-md rounded-[22px] border-2 border-dashed border-cocoa/25 bg-paper p-8 text-center text-sm text-ink-soft">
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
  return <PositionerEditor {...props} />;
}

function PositionerEditor({ data, draft = false, returnTo, focusVariantId }: PositionerProps) {
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
  const startedFromDefault = useRef(!(() => {
    const v0 = data.variants.find((v) => v.id === ((focused ? focusVariantId : undefined) ?? data.variants[0]?.id));
    const keepsake0 = data.keepsakes[0];
    return v0 && keepsake0 ? usePlacements.getState().placements[`${keepsake0.id}-${v0.productKey}`] : undefined;
  })());
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  // starts on the design the parent is placing (their Studio save / lifted cutout), not the original
  const [cutout, setCutout] = useState<{ url: string; sourceObjectId: string } | null>(data.keepsakes[0]?.design ?? null);
  const [removing, setRemoving] = useState(false);
  // The product context: blank photo + print-area quad (+ silhouette mask) — so the image
  // is placed ON the product, not on an abstract canvas. Falls back to the flat canvas.
  const [ctx, setCtx] = useState<MockupContext | null>(null);
  // Contrado-style view toggle: the exact flat PRINT LAYOUT (the order-of-record view —
  // DEFAULT + first option, so placement is precise about what prints; founder call
  // 2026-07-07), or ON the product photo. Product view only when a photo exists.
  const [viewMode, setViewMode] = useState<'flat' | 'product'>('flat');
  const imgRef = useRef<HTMLImageElement>(null);
  const patternRef = useRef<HTMLDivElement>(null);
  // a repeat RE-DRAWS at the live zoom + pan while a finger is down (zooming out adds copies as you go)
  const patternDrawRef = useRef<((t: Transform) => void) | null>(null);
  const patternFrameRef = useRef(0);
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
  const [availW, setPreviewW] = useState(SSR_PREVIEW_W);
  // A very TALL print (the 1:6 height chart) must not make a canvas taller than the screen: the
  // canvas takes the touch (no page scroll over it), so the shopper could never scroll past it.
  const [maxPreviewH, setMaxPreviewH] = useState(SSR_MAX_PREVIEW_H);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const gw = el.clientWidth;
      // On desktop the controls column sits beside the canvas; reserve room for it.
      const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
      const avail = desktop ? gw - 396 : gw;
      setPreviewW(Math.max(320, Math.min(MAX_PREVIEW_W, Math.floor(avail))));
      setMaxPreviewH(Math.max(420, Math.round(window.innerHeight * 0.72)));
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

  // both exist: the outer Positioner only renders the editor when there's something to place
  const keepsake = data.keepsakes[assetIdx] ?? data.keepsakes[0]!;
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]!;
  // A fresh placement (nothing saved) on a product whose default depends on the drawing's shape (a
  // landscape drawing turns on a phone case / playing cards): once the shape is known, start there.
  useEffect(() => {
    if (!natural || !startedFromDefault.current) return;
    startedFromDefault.current = false;
    const d = defaultTransformFor(variant.productKey, natural.w / natural.h);
    if (d.rotationDeg) setTf((cur) => ({ ...cur, scale: d.scale, rotationDeg: d.rotationDeg as Transform['rotationDeg'] }));
  }, [natural, variant.productKey]);

  const t = variant.template;
  const isJigsaw = variant.productKey === 'jigsaw';
  // The MUG is a wrap product: an "on the product" view here would paint the art FLAT on the band
  // (misleading). Edit placement stays the flat print layout; the real front/back wrap lives on the
  // product page. So suppress the on-product toggle for the mug.
  const isMug = variant.productKey === 'mug';
  // A REPEAT-PATTERN product (socks, wrapping paper, tea towel) and the HEIGHT CHART don't print
  // "the drawing, placed": the flat print layout below draws exactly what prints (the repeat; the
  // drawing beside the ruler), and — like the mug — there's no on-the-product view in here.
  const isPattern = isPatternProduct(variant.productKey);
  // the base colour chosen on the customize page — the repeat is drawn on it, like the print
  const groundToken = useSelection((s) => s.selections[variant.productKey]?.ground);
  const isGround = isGroundProduct(variant.productKey);
  const groundHex = groundHexOf(isGround ? groundToken : null);
  // a placed drawing on a base colour: the print area shows the colour edge to edge, like the print
  const groundFill: React.CSSProperties | undefined = isGround && !isPattern && isColouredGround(groundToken) ? { background: groundHex } : undefined;
  const isChart = isHeightChart(variant.productKey);
  const noProductView = isMug || isPattern || isChart;
  // …so those show the REAL product preview instead (founder, 23 Oct: "a quality preview of the print
  // on the product, not just as a print") — the same renderer as the customize page and the print, so
  // a curve round a mug or a repeat round a sock is exactly what arrives. It follows your changes a
  // beat after you stop (each one is drawn on the server), while the print layout stays live.
  const tfKey = JSON.stringify(tf);
  const [settledTf, setSettledTf] = useState(tf);
  useEffect(() => {
    if (!noProductView) return;
    const id = setTimeout(() => setSettledTf(JSON.parse(tfKey) as Transform), 450);
    return () => clearTimeout(id);
  }, [tfKey, noProductView]);
  const productNoun = isMug ? 'mug' : variant.productKey === 'socks' ? 'socks' : variant.productKey === 'teaTowel' ? 'tea towel' : variant.productKey === 'wrappingPaper' ? 'paper' : isChart ? 'chart' : 'product';
  // The "on the product" preview-toggle label mirrors the mockup the shopper sees for this product.
  const onProductLabel =
    variant.productKey === 'cushion' ? 'on the cushion'
      : variant.productKey === 'blanket' ? 'on the blanket'
      : variant.productKey === 'card' || variant.productKey === 'playingCards' ? 'on the card'
      : variant.productKey === 'phoneCase' ? 'on the case'
      : isJigsaw ? 'on the board'
      : variant.productKey === 'framedPrint' ? 'in the frame'
      : 'on the product';
  // A FRAME DEFAULTS to cover-filled (scale 1 = "1.0×", no margins), but the shopper CAN
  // zoom out to 0.5× if they want a border (founder call 2026-07-07). So its zoom floors
  // at 0.5 of cover — below the fit-centred model other products use.
  const filledDefault = defaultTransformFor(variant.productKey).scale === 1;
  // A frame is cover-LOCKED: it defaults filled AND can't go below cover (0.5 floor) so it never
  // shows white margins. The MUG also defaults filled (fill-width, founder 2026-07-10) but is NOT
  // locked — the shopper must be able to zoom DOWN through contain to reveal the drawing's full
  // height. So `lockToCover` drives every no-letterbox floor/snap/slider-mode below, while
  // `filledDefault` still drives the RESET target (double-tap / F → back to fill-width).
  const lockToCover = filledDefault && !isMug;
  const scaleFloor = lockToCover ? 0.5 : MIN_SCALE;
  const canvas = canvasSizePx(t);
  const aspect = canvas.width / canvas.height;
  const previewW = Math.min(availW, Math.max(80, Math.floor(maxPreviewH * aspect)));
  const previewH = Math.round(previewW / aspect);
  const scale = previewW / canvas.width; // canvas-px → preview-px
  const bleedPxv = mmToPx(t.bleedMm, t.requiredDpi);

  // The drawing's placement area: the whole canvas, or (height chart) the art area beside the
  // ruler band, `artX` canvas-px in from the left edge.
  const placeT = useMemo(() => (isChart ? heightChartArtGeom(t) : t), [isChart, t]);
  const chartLayout = useMemo(() => (isChart ? heightChartLayout(canvasSizePx(t), t.requiredDpi) : null), [isChart, t]);
  const artX = chartLayout?.bandPx ?? 0;
  const rulerSrc = useMemo(
    () => (chartLayout ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rulerBandSvg(chartLayout))}` : null),
    // the band depends only on the canvas size + dpi
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartLayout?.width, chartLayout?.height, chartLayout?.dpi],
  );
  const rect = natural ? computeLayerRect(placeT, { width: natural.w, height: natural.h }, tf) : null;
  const assess = natural ? assessPrintResolution(t, { width: natural.w, height: natural.h }, tf, variant.productKey) : null;
  // "Fit the whole image" scale for THIS product + rotation — the zoom slider's centre.
  // (A pattern's "fit" is its default motif size — scale 0 and 1 are the same repeat.)
  const fitScale = natural && !isPattern ? containScale(placeT, { width: natural.w, height: natural.h }, tf.rotationDeg) : 1;
  const zoomValue = tf.scale === 0 ? fitScale : tf.scale;

  // The ACTIONABLE fix for a soft/blocked placement: effective dpi ∝ 1/scale, so the
  // largest print-ready zoom is current·(dpi/required). Offered only when it's actually
  // reachable on the zoom track (≥ fit/2) — otherwise the honest advice stays "smaller
  // product", and we never fake it.
  const dpiFix = useMemo<{ scale: number; kind: 'ok' | 'enhance' } | null>(() => {
    if (!assess || assess.decision === 'OK') return null;
    // dpi ∝ 1/scale, so the largest zoom that reaches a dpi d is zoom·(effective/d).
    // Prefer full print-ready; from BLOCK, falling back to the least this product needs
    // where it's seen (minimumDpi) still un-blocks the order honestly. The
    // 0.995 nudges the landing safely inside the boundary against px rounding.
    const floor = lockToCover ? scaleFloor : Math.max(fitScale / 2, MIN_SCALE);
    const scaleFor = (d: number) => zoomValue * (assess.effectiveDpi / d) * 0.995;
    const ok = scaleFor(assess.requiredDpi);
    const enhance = scaleFor(assess.minimumDpi);
    const pick =
      ok >= floor
        ? { scale: ok, kind: 'ok' as const }
        : assess.decision === 'BLOCK' && enhance >= floor
          ? { scale: enhance, kind: 'enhance' as const }
          : null;
    if (!pick) return null; // unreachable — the honest advice stays "smaller product"
    // never snap a cover-LOCKED product to the contain sentinel (that would letterbox it); the
    // mug is filled-by-default but may contain, so it CAN snap.
    return { ...pick, scale: !lockToCover && Math.abs(pick.scale - fitScale) < fitScale * FIT_SNAP ? 0 : pick.scale };
  }, [assess, zoomValue, fitScale, lockToCover, scaleFloor]);

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
      if (!lockToCover && Math.abs(next - fitScale) < fitScale * FIT_SNAP) return { scale: 0 };
      return { scale: next };
    });
  };

  const generate = async () => {
    if (rendering) return;
    setRendering(true);
    try {
      const res = await renderPreviewAction({ assetId: keepsake.id, variantId: variant.id, transform: tf, sourceObjectId: cutout?.sourceObjectId, ground: isGround ? groundToken : undefined });
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
      } else if (res.reason === 'too-many') {
        toast(TOO_MANY_COPY);
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
    const artwork = { assetId: keepsake.id, transform: { ...tf }, sourceObjectId: cutout?.sourceObjectId };
    addToBasket({
      id: `pos-${keepsake.id}-${variant.id}~d${designSig({ artwork })}`, // a different placement = its own line
      name: variant.label,
      product: variant.productKey as ProductKey,
      pricePence: variant.pricePence,
      variantId: variant.id,
      artwork,
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
      left: (artX + rect.x) * scale + boxW / 2,
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
  }, [rect, scale, tf.rotationDeg, artX]);

  // ── Product-backdrop geometry (preview px): the print-area quad on the blank photo, and
  // the image's placement INSIDE it via the SAME shared geometry as the print renderer and
  // the compositor — you're placing the image on the product, and what you see is what prints.
  const bd = useMemo(() => {
    if (!ctx || !ctx.ok) return null;
    const pvH = Math.round((previewW * ctx.blankH) / ctx.blankW);
    const tilt = tiltedRect(ctx.quad.map(([x, y]) => [x * previewW, y * pvH] as const));
    if (tilt) {
      // An ANGLED print area (ankle socks, playing cards): the box is the print area's own size,
      // turned to its angle about its centre — placing here is placing on the product as it prints.
      const { cx, cy, w, h, angle } = tilt;
      // the straight box around it — the on-top overlay is cut to that (mockupContextAction)
      const xs = ctx.quad.map((p) => p[0] * previewW), ys = ctx.quad.map((p) => p[1] * pvH);
      const around = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      return { pvH, qx: cx - w / 2, qy: cy - h / 2, qw: w, qh: h, s: w / t.printWidthPx, angle, around };
    }
    const qx = ctx.quad[0]![0] * previewW;
    const qy = ctx.quad[0]![1] * pvH;
    const qw = (ctx.quad[1]![0] - ctx.quad[0]![0]) * previewW;
    const qh = (ctx.quad[3]![1] - ctx.quad[0]![1]) * pvH;
    return { pvH, qx, qy, qw, qh, s: qw / t.printWidthPx, angle: 0, around: { x: qx, y: qy, w: qw, h: qh } };
  }, [ctx, t, previewW]);

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
    if (bd && !noProductView) {
      const geomPv = { printWidthPx: Math.max(1, Math.round(bd.qw)), printHeightPx: Math.max(1, Math.round(bd.qh)), bleedMm: t.bleedMm, requiredDpi: t.requiredDpi * bd.s };
      const geom = (probe: Transform) => {
        const r = computeLayerRect(geomPv, src, probe);
        return { slackX: Math.abs(r.width - r.canvasWidth), slackY: Math.abs(r.height - r.canvasHeight) };
      };
      return { geom, pxPerSpace: 1 };
    }
    if (isPattern) {
      // A drag shifts the repeat: offset ±1 = a phase of ±½ cell (patternLayout), so the "slack"
      // that maps a drag 1:1 onto the pattern is one cell.
      const geom = (probe: Transform) => {
        const l = patternLayout(canvasSizePx(t), t.requiredDpi, src, probe);
        return { slackX: l.cellW, slackY: l.stripH };
      };
      return { geom, pxPerSpace: scale };
    }
    const geom = (probe: Transform) => {
      const r = computeLayerRect(placeT, src, probe);
      return { slackX: Math.abs(r.width - r.canvasWidth), slackY: Math.abs(r.height - r.canvasHeight) };
    };
    return { geom, pxPerSpace: scale };
  }, [bd, natural, t, placeT, scale, isPattern, noProductView]);
  const slackNow = gestureGeom ? gestureGeom.geom(tf) : { slackX: 0, slackY: 0 };

  /** Live pointer deltas → the css-var transform on the image (no re-render). */
  const applyLive = (dxPv: number, dyPv: number, k: number) => {
    if (isPattern && patternDrawRef.current && gestureRef.current) {
      // redraw the repeat itself at the gesture's zoom + pan (once per frame)
      const live = transformFromGesture(gestureRef.current.base, dxPv, dyPv, k);
      cancelAnimationFrame(patternFrameRef.current);
      patternFrameRef.current = requestAnimationFrame(() => patternDrawRef.current?.(live));
      return;
    }
    for (const el of [imgRef.current, patternRef.current]) {
      if (!el) continue;
      el.style.setProperty('--gx', `${dxPv}px`);
      el.style.setProperty('--gy', `${dyPv}px`);
      el.style.setProperty('--gk', `${k}`);
    }
  };
  const clearLive = () => {
    cancelAnimationFrame(patternFrameRef.current);
    for (const el of [imgRef.current, patternRef.current]) {
      if (!el) continue;
      el.style.removeProperty('--gx');
      el.style.removeProperty('--gy');
      el.style.removeProperty('--gk');
    }
  };

  /** Current gesture deltas in preview px (+ pinch factor) from live pointers — in the print
   * area's own axes (an angled print area turns a screen drag into its frame). */
  const gestureDeltas = () => {
    const d = screenDeltas();
    const a = viewMode === 'product' && bd && !noProductView ? (bd.angle * Math.PI) / 180 : 0;
    if (!a) return d;
    const c = Math.cos(a), s = Math.sin(a);
    return { dx: d.dx * c + d.dy * s, dy: -d.dx * s + d.dy * c, k: d.k };
  };
  const screenDeltas = () => {
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

  /** A gesture (pan dx/dy in preview px, pinch k) applied to `base` — through the SHARED geometry,
   * so the live redraw and the committed result are the same transform. Pans against the slack AT
   * THE NEW SCALE (the range grows as you zoom in). */
  const transformFromGesture = (base: Transform, dx: number, dy: number, k: number): Transform => {
    if (!gestureGeom) return base;
    const s0 = base.scale === 0 ? fitScale : base.scale;
    let nextScale: number = Math.min(MAX_ZOOM, Math.max(scaleFloor, s0 * k));
    if (!lockToCover && Math.abs(nextScale - fitScale) < fitScale * FIT_SNAP) nextScale = 0;
    const { slackX, slackY } = gestureGeom.geom({ ...base, scale: nextScale });
    const dxSpace = dx / gestureGeom.pxPerSpace;
    const dySpace = dy / gestureGeom.pxPerSpace;
    let offsetX = slackX > 0 ? Math.max(-1, Math.min(1, base.offsetX + (2 * dxSpace) / slackX)) : 0;
    let offsetY = slackY > 0 ? Math.max(-1, Math.min(1, base.offsetY + (2 * dySpace) / slackY)) : 0;
    if (Math.abs(offsetX) < SNAP_OFFSET) offsetX = 0; // snap to centre
    if (Math.abs(offsetY) < SNAP_OFFSET) offsetY = 0;
    return clampTransform({ ...base, scale: nextScale, offsetX, offsetY });
  };

  /** Commit the live gesture through the SHARED geometry (what you see is what prints). */
  const commitGesture = () => {
    const g = gestureRef.current;
    if (!g || !gestureGeom) return;
    const { dx, dy, k } = gestureDeltas();
    clearLive();
    if (!g.moved && k === 1) return; // a tap, not a gesture — nothing to commit

    // pan against the slack AT THE NEW SCALE (the range grows as you zoom in)
    setResult(null);
    const next = transformFromGesture(g.base, dx, dy, k);
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
    if (!lockToCover && Math.abs(nextScale - fitScale) < fitScale * FIT_SNAP) nextScale = 0;
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
    // zoomBy closes over fitScale/scaleFloor/lockToCover; re-bind when they change so the floor
    // is current, and when viewMode flips (the canvas element itself swaps).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomBy is re-made every render; the deps above are what it reads
  }, [fitScale, scaleFloor, lockToCover, viewMode]);

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
  const renderSelection = (box: { left: number; top: number; w: number; h: number; angle?: number }) => {
    const a = ((box.angle ?? 0) * Math.PI) / 180;
    const cx = box.left + box.w / 2, cy = box.top + box.h / 2;
    // a corner of the (possibly turned) box, about its centre
    const at = (x: number, y: number) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)] as const;
    const corners = [
      ['tl', ...at(box.left, box.top), 'nwse-resize'],
      ['tr', ...at(box.left + box.w, box.top), 'nesw-resize'],
      ['bl', ...at(box.left, box.top + box.h), 'nesw-resize'],
      ['br', ...at(box.left + box.w, box.top + box.h), 'nwse-resize'],
    ] as const;
    return (
      <>
        <div
          className="pointer-events-none absolute rounded-[3px] border-2 border-cinnamon/85"
          style={{ left: box.left, top: box.top, width: box.w, height: box.h, ...(box.angle ? { transform: `rotate(${box.angle}deg)` } : {}) }}
        />
        {natural
          ? corners.map(([k, x, y, cur]) => (
              <div
                key={k}
                {...handleProps}
                role="button"
                aria-label="drag to resize the drawing"
                className="absolute z-20 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-cinnamon bg-white shadow-[0_1px_3px_color-mix(in_srgb,var(--color-cocoa)_35%,transparent)] before:absolute before:-inset-[11px] before:content-['']"
                style={{ left: x, top: y, cursor: cur }}
              />
            ))
          : null}
      </>
    );
  };

  // everything drawn ON the print area turns with an angled one (about the box's own centre)
  const turnBox: React.CSSProperties = bd?.angle ? { transform: `rotate(${bd.angle}deg)` } : {};

  return (
    <Shell back={returnTo ?? (draft ? '/start-creating' : '/home')}>
      <div ref={gridRef} className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* Canvas — the image ON the product (photo backdrop) when a template exists;
            the flat print canvas otherwise (or on request). Same shared geometry either way. */}
        <div>
          {!noProductView && bd && ctx && ctx.ok ? (
            <div className="mb-2 flex gap-1.5" role="group" aria-label="preview view">
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                aria-pressed={viewMode === 'flat'}
                className={`${OPT_SM} ${viewMode === 'flat' ? OPT_ON : OPT_OFF}`}
              >
                print layout
              </button>
              <button
                type="button"
                onClick={() => setViewMode('product')}
                aria-pressed={viewMode === 'product'}
                className={`${OPT_SM} ${viewMode === 'product' ? OPT_ON : OPT_OFF}`}
              >
                {onProductLabel}
              </button>
            </div>
          ) : null}
          {!noProductView && bd && ctx && ctx.ok && viewMode === 'product' ? (
            <div
              {...canvasInteractionProps}
              className={`relative mx-auto overflow-hidden rounded-[10px] border-2 border-cocoa/15 bg-paper-2 ${canvasInteractionClass}`}
              style={{ width: previewW, height: bd.pvH }}
            >
              <img src={ctx.blankUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
              <div className="absolute inset-0" style={maskStyle}>
                <div className="absolute overflow-hidden" style={{ left: bd.qx, top: bd.qy, width: bd.qw, height: bd.qh, ...turnBox, ...groundFill }}>
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
                <img src={ctx.overlayUrl} alt="" aria-hidden draggable={false} className="pointer-events-none absolute" style={{ left: bd.around.x, top: bd.around.y, width: bd.around.w, height: bd.around.h, maxWidth: 'none', maxHeight: 'none' }} />
              ) : null}
              {/* snap-to-centre guide flashes (drag only) */}
              {dragging && snapAxis.x ? (
                <div className="pointer-events-none absolute w-px bg-cinnamon/80" style={{ left: bd.qx + bd.qw / 2, top: bd.qy, height: bd.qh, ...turnBox }} />
              ) : null}
              {dragging && snapAxis.y ? (
                <div className="pointer-events-none absolute h-px bg-cinnamon/80" style={{ top: bd.qy + bd.qh / 2, left: bd.qx, width: bd.qw, ...turnBox }} />
              ) : null}
              {/* the ONE guide + resize grips (the frame opening) */}
              {renderSelection({ left: bd.qx, top: bd.qy, w: bd.qw, h: bd.qh, angle: bd.angle })}
            </div>
          ) : (
            <div
              {...canvasInteractionProps}
              className={`relative mx-auto overflow-hidden rounded-[10px] border-2 border-cocoa/15 bg-paper-2 ${canvasInteractionClass}`}
              style={{ width: previewW, height: previewH, ...groundFill }}
            >
              <img
                ref={setImgEl}
                src={cutout?.url ?? keepsake.imageUrl}
                alt="your keepsake"
                draggable={false}
                // a repeat draws its own motifs below; this one stays as the measuring/gesture anchor
                style={isPattern ? { ...imgStyle, opacity: 0 } : imgStyle}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {isPattern && natural ? (
                <PatternRepeat
                  ref={patternRef}
                  image={imgRef.current}
                  natural={natural}
                  canvas={canvas}
                  dpi={t.requiredDpi}
                  transform={tf}
                  width={previewW}
                  height={previewH}
                  groundHex={groundHex}
                  drawRef={patternDrawRef}
                />
              ) : null}
              {/* the height chart's ruler prints exactly like this, down the left edge */}
              {rulerSrc && chartLayout ? (
                <img
                  src={rulerSrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0"
                  style={{ width: chartLayout.bandPx * scale, height: previewH, maxWidth: 'none', maxHeight: 'none' }}
                />
              ) : null}
              {/* snap-to-centre guide flashes (drag only) */}
              {dragging && snapAxis.x ? <div className="pointer-events-none absolute inset-y-0 w-px bg-cinnamon/80" style={{ left: (artX + canvasSizePx(placeT).width / 2) * scale }} /> : null}
              {dragging && snapAxis.y ? <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-cinnamon/80" /> : null}
              {/* the ONE guide + resize grips (what prints / shows in the frame — beside the ruler on a height chart) */}
              {renderSelection(
                isChart
                  ? { left: artX * scale, top: 0, w: previewW - artX * scale, h: previewH }
                  : { left: bleedPxv * scale, top: bleedPxv * scale, w: previewW - 2 * bleedPxv * scale, h: previewH - 2 * bleedPxv * scale },
              )}
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-ink-faint">
            {isPattern ? (
              <>this is the pattern that prints · drag to shift it · drag a corner to make the drawings bigger or smaller</>
            ) : isChart ? (
              <>the ruler prints just like this · your drawing goes in the <b className="text-cinnamon">outlined box</b> beside it · drag a corner to resize</>
            ) : (
              <>the <b className="text-cinnamon">outlined box</b> is what {variant.productKey === 'framedPrint' ? 'shows in the frame' : 'prints'} · drag a corner to resize · keep faces &amp; words a little in from the edges</>
            )}
          </p>


          {/* DPI status — live (recomputed on every zoom/rotate commit), with the FIX
              offered right where the warning is, never a dead end. */}
          {assess ? (
            <div
              className={`mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border-2 px-3 py-2 text-[12px] font-semibold ${
                assess.decision === 'OK'
                  ? 'border-leaf bg-leaf-pale text-green-save'
                  : assess.decision === 'UPSCALE'
                    ? 'border-sunshine bg-honey-band text-cocoa'
                    : 'border-cocoa bg-berry-pale text-cocoa'
              }`}
            >
              <Icon icon={assess.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={15} />
              <span className="min-w-0 flex-1">
                {assess.decision === 'OK'
                  ? `print-ready · ${t.requiredDpi} dpi`
                  : assess.decision === 'UPSCALE'
                    ? assess.softUpClose
                      ? 'lovely from a step back, a little soft up close'
                      : `we'll gently enhance it (about ${assess.effectiveDpi} dpi here)`
                    : dpiFix !== null
                      ? 'image quality too low at this size'
                      : 'too small to print well here — try a smaller product'}
              </span>
              {dpiFix !== null ? (
                <button
                  type="button"
                  onClick={() => update({ scale: dpiFix.scale })}
                  className="press relative min-h-9 rounded-pill border-2 border-cocoa bg-paper px-3 text-[11px] font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] before:absolute before:-inset-[4px] before:content-['']"
                >
                  {dpiFix.kind === 'ok' ? 'zoom out to print-ready' : 'zoom out to fix'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Controls */}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Product</p>
          {/* Scoped to the ONE creation being customized — never a catalogue in here. */}
          <p className="sticker mt-2 inline-flex -rotate-1 rounded-pill bg-honey px-3 py-1.5 text-xs font-extrabold text-cocoa">
            {variant.label} · {gbp(variant.pricePence)}
          </p>

          {/* Orientation — portrait / landscape, right here in the editor (founder call
              2026-07-07). Switching flips the canvas aspect to the sibling's template. */}
          {orientations.length > 1 ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Orientation</p>
              <div className="mt-2 flex gap-1.5" role="group" aria-label="orientation">
                {orientations.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => switchOrientation(o)}
                    aria-pressed={variant.orientation === o}
                    className={`${OPT_SM} ${variant.orientation === o ? OPT_ON : OPT_OFF}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {data.keepsakes.length > 1 ? (
            <>
              <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Keepsake</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.keepsakes.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setAssetIdx(i); setNatural(null); setResult(null); setCutout(data.keepsakes[i]?.design ?? null); }}
                    aria-pressed={i === assetIdx}
                    aria-label={`keepsake ${i + 1}`}
                    className={`press h-12 w-12 overflow-hidden rounded-[12px] border-2 ${i === assetIdx ? 'border-cocoa shadow-[0_3px_0_var(--color-cocoa)]' : 'border-cocoa/15'}`}
                  >
                    <img src={k.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Position</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={undoRef.current.length === 0}
                aria-label="undo placement change"
                className="relative rounded-full p-1.5 text-ink-soft before:absolute before:-inset-[8px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconArrowBackUp} size={16} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={redoRef.current.length === 0}
                aria-label="redo placement change"
                className="relative rounded-full p-1.5 text-ink-soft before:absolute before:-inset-[8px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconArrowForwardUp} size={16} />
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">drag the drawing to move it · drag a corner (or scroll / pinch) to resize · double-tap to reset</p>
          <div className="mt-2 space-y-3">
            <ZoomSlider
              fit={fitScale}
              value={zoomValue}
              // A cover-DEFAULT product reads its default (cover, scale 1) as "1.0×" — true for the
              // frame AND the mug (fill-width). What lets the mug still zoom DOWN to contain is the
              // FLOOR (scaleFloor = MIN_SCALE for the mug), not the readout model — so `filled` uses
              // filledDefault while the floor uses lockToCover.
              filled={filledDefault}
              floor={scaleFloor}
              onChange={(v) =>
                filledDefault
                  ? update({ scale: Math.max(scaleFloor, v) }) // frame: floor at cover; mug: floor at MIN_SCALE (can reach contain)
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
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa/25 bg-paper px-3.5 text-xs font-bold text-cocoa hover:border-cocoa"
            >
              <Icon icon={IconRotateClockwise} size={14} /> rotate ({tf.rotationDeg}°)
            </button>
          </div>

          {noProductView ? (
            <section aria-label={`on the ${productNoun}`} className="mt-5 rounded-[14px] border-2 border-cocoa/15 bg-paper p-2">
              <p className="px-1 text-[12px] font-extrabold text-cocoa">
                on the {productNoun} <span className="font-normal text-ink-faint">· how it will really look — updates when you stop</span>
              </p>
              <div className="mx-auto mt-1 aspect-square w-full max-w-[300px]">
                <MockupPreview
                  productKey={variant.productKey as ProductKey}
                  assetId={keepsake.id}
                  variantId={variant.id}
                  transform={settledTf}
                  size="zoom"
                  sourceObjectId={cutout?.sourceObjectId ?? null}
                  view={isMug ? 'centre' : undefined}
                  ground={isGround ? (groundToken ?? null) : null}
                  px={340}
                  loader
                />
              </div>
            </section>
          ) : null}

          {/* a design from the Studio already has its background handled there — no second remover */}
          {keepsake.design ? null : (<>
          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Magic</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={removeBg}
              disabled={removing}
              className={`press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 px-3.5 text-xs font-bold disabled:opacity-50 ${
                cutout ? 'border-leaf bg-leaf-pale text-green-save' : 'border-cobalt bg-paper text-cobalt hover:bg-sky-pale'
              }`}
            >
              <Icon icon={cutout ? IconCircleCheck : IconSparkles} size={14} />
              {removing ? 'removing…' : cutout ? 'background removed' : 'remove background'}
            </button>
            {cutout ? (
              <button
                type="button"
                onClick={() => { setCutout(null); setResult(null); }}
                className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-bold text-ink-soft hover:text-cinnamon"
              >
                <Icon icon={IconX} size={13} /> undo
              </button>
            ) : null}
          </div>
          </>)}

          {/* Primary action: a thumb-zone dock on phones (kraft, like the landing's), inline from md. */}
          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-5 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none">
          {returnTo ? (
            <Button size="lg" className="w-full" onClick={saveReturn} disabled={assess?.decision === 'BLOCK'}>
              <Icon icon={IconArrowBackUp} size={16} /> save &amp; return
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={add} disabled={assess?.decision === 'BLOCK'}>
              <Icon icon={IconShoppingBag} size={16} />{' '}
              {draft ? `keep it & check out · ${gbp(variant.pricePence)}` : `add to basket · ${gbp(variant.pricePence)}`}
            </Button>
          )}
          </div>
          {/* Why the button is greyed — right where the friction is (the DPI badge + its one-tap
              "zoom out to fix" sits under the canvas, easy to miss next to a disabled save). */}
          {assess?.decision === 'BLOCK' ? (
            <p role="status" className="mt-2 text-center text-[11px] font-semibold text-cinnamon">
              zoom out a touch or upload another. the image quality is too low at this size.
            </p>
          ) : null}
          <button
            type="button"
            onClick={generate}
            disabled={rendering || assess?.decision === 'BLOCK'}
            className="mt-2 min-h-11 w-full text-center text-xs font-bold text-cinnamon disabled:opacity-50"
          >
            {rendering ? 'rendering…' : 'preview the exact print file'}
          </button>

          {result && result.ok ? (
            <div className="pop-in polaroid tape mt-6" style={{ ['--tilt' as string]: '-1deg' }}>
              <p className="mb-2 text-[11px] font-bold text-green-save">your print file — exactly what gets made</p>
              <img src={result.url} alt="rendered print file" className="w-full border border-line" />
              <p className="mt-2 text-[11px] text-ink-soft">
                {result.widthPx}×{result.heightPx}px · {result.renderedDpi} dpi{result.upscaled ? ' · gently enhanced' : ''}
              </p>
            </div>
          ) : result && !result.ok && result.blocked ? (
            <p role="alert" className="mt-3 text-center text-xs font-semibold text-cinnamon">That placement is too low-res to print — zoom out or choose a smaller product.</p>
          ) : result && !result.ok && result.tooMany ? (
            <p role="alert" className="mt-3 text-center text-xs font-semibold text-cinnamon">{TOO_MANY_COPY}</p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/**
 * Zoom slider. Two modes:
 *  - FILLED (a cover-default product — frame or mug): linear from `floor` up to 4×, and the reading
 *    is the raw scale, so the product's cover (scale 1 = fill) reads 1.0×. The frame's floor IS
 *    cover (0.5) so it can't letterbox; the mug's floor is MIN_SCALE, so it can zoom DOWN through
 *    contain (which reads ~0.4–0.5×) to reveal the drawing's full height.
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
      <span className="w-[78px] shrink-0 text-[11px] text-ink-soft">Zoom</span>
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
      <span className="w-8 shrink-0 text-right text-[11px] text-ink-faint">{`${shown.toFixed(1)}×`}</span>
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
      <span className="w-[78px] shrink-0 text-[11px] text-ink-soft">{label}</span>
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
      <span className="w-8 shrink-0 text-right text-[11px] text-ink-faint">{format(value)}</span>
    </label>
  );
}

// Scrapbook option chips (D12): ink-outlined stickers; the chosen one fills with ink. 36px visual,
// the ::before extends each tap area to 44px.
const OPT_SM = "press relative inline-flex min-h-9 items-center rounded-pill border-2 px-3.5 text-xs font-bold before:absolute before:-inset-[4px] before:content-['']";
const OPT_ON = 'border-cocoa bg-cocoa text-paper shadow-[0_2px_0_var(--color-cocoa)]';
const OPT_OFF = 'border-cocoa/25 bg-paper text-ink-soft hover:border-cocoa';

function Shell({ children, back = '/home' }: { children: React.ReactNode; back?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: back, label: 'Back' }} tag="studio" />
      {/* pb-32 on phones clears the fixed thumb-zone action dock. */}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 md:px-6 md:pb-8">
        {children}
      </main>
    </div>
  );
}
