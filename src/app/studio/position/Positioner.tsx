'use client';

import { IconAlertTriangle, IconArrowBackUp, IconArrowLeft, IconCircleCheck, IconRotateClockwise, IconShoppingBag, IconSparkles, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { gbp, toast, useBasket, usePlacements } from '@/lib/store';
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

const PREVIEW_W = 360; // on-screen canvas width in CSS px

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
  const variants = focused ? data.variants.filter((v) => v.id === focusVariantId) : data.variants;
  const [assetIdx, setAssetIdx] = useState(0);
  const [variantId, setVariantId] = useState((focused ? focusVariantId : undefined) ?? data.variants[0]?.id ?? '');
  // scale 0 = the CONTAIN sentinel: "fit the whole image" — the default placement. It
  // re-resolves automatically when the product or rotation changes; a touched zoom
  // becomes a concrete number.
  const [tf, setTf] = useState<Transform>({ scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  const [cutout, setCutout] = useState<{ url: string; sourceObjectId: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  // The product context: blank photo + print-area quad (+ silhouette mask) — so the image
  // is placed ON the product, not on an abstract canvas. Falls back to the flat canvas.
  const [ctx, setCtx] = useState<MockupContext | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const router = useRouter();
  const addToBasket = useBasket((s) => s.add);
  const setPlacement = usePlacements((s) => s.setPlacement);

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
  const canvas = canvasSizePx(t);
  const aspect = canvas.width / canvas.height;
  const previewH = Math.round(PREVIEW_W / aspect);
  const scale = PREVIEW_W / canvas.width; // canvas-px → preview-px
  const bleedPxv = mmToPx(t.bleedMm, t.requiredDpi);
  const safePxv = bleedPxv + mmToPx(t.safeInsetMm, t.requiredDpi);

  const rect = natural ? computeLayerRect(t, { width: natural.w, height: natural.h }, tf) : null;
  const assess = natural ? assessResolution(t, { width: natural.w, height: natural.h }, tf) : null;
  // "Fit the whole image" scale for THIS product + rotation — the zoom slider's centre.
  const fitScale = natural ? containScale(t, { width: natural.w, height: natural.h }, tf.rotationDeg) : 1;
  const zoomValue = tf.scale === 0 ? fitScale : tf.scale;

  // Load the product context whenever the variant changes (photoreal products only).
  useEffect(() => {
    let live = true;
    setCtx(null);
    if (!variantId) return;
    void mockupContextAction({ variantId }).then((c) => { if (live) setCtx(c); });
    return () => { live = false; };
  }, [variantId]);

  /** Switch product/variant PRESERVING the relative zoom (zoom-vs-fit), so the image
   * appears consistently sized across variants with different print aspects. */
  const switchVariant = (v: StudioVariant) => {
    if (v.id === variantId) return;
    if (natural && tf.scale !== 0) {
      const src = { width: natural.w, height: natural.h };
      const rel = tf.scale / containScale(t, src, tf.rotationDeg);
      const next = Math.min(MAX_ZOOM, Math.max(MIN_SCALE, rel * containScale(v.template, src, tf.rotationDeg)));
      setTf((p) => ({ ...p, scale: next }));
    }
    setVariantId(v.id);
    setResult(null);
  };

  const setRot = () => {
    const next = (((tf.rotationDeg + 90) % 360) as Rotation);
    update({ rotationDeg: next });
  };
  const update = (patch: Partial<Transform>) => {
    setResult(null);
    setTf((prev) => clampTransform({ ...prev, ...patch }));
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
      transform: `translate(-50%, -50%) rotate(${tf.rotationDeg}deg)`,
      objectFit: 'fill',
    };
  }, [rect, scale, tf.rotationDeg]);

  // ── Product-backdrop geometry (preview px): the print-area quad on the blank photo, and
  // the image's placement INSIDE it via the SAME shared geometry as the print renderer and
  // the compositor — you're placing the image on the product, and what you see is what prints.
  const bd = useMemo(() => {
    if (!ctx || !ctx.ok) return null;
    const pvH = Math.round((PREVIEW_W * ctx.blankH) / ctx.blankW);
    const qx = ctx.quad[0]![0] * PREVIEW_W;
    const qy = ctx.quad[0]![1] * pvH;
    const qw = (ctx.quad[1]![0] - ctx.quad[0]![0]) * PREVIEW_W;
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
      transform: `translate(-50%, -50%) rotate(${tf.rotationDeg}deg)`,
      objectFit: 'fill',
    };
  }, [bd, natural, tf, t]);
  const safePv = bd ? mmToPx(t.safeInsetMm, t.requiredDpi) * bd.s : 0;
  const maskStyle: React.CSSProperties | undefined = ctx && ctx.ok && ctx.maskUrl
    ? {
        WebkitMaskImage: `url(${ctx.maskUrl})`,
        maskImage: `url(${ctx.maskUrl})`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        maskMode: 'luminance',
      }
    : undefined;

  return (
    <Shell>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* Canvas — the image ON the product (photo backdrop) when a template exists;
            the flat print canvas otherwise. Same shared geometry either way. */}
        <div>
          {bd && ctx && ctx.ok ? (
            <div
              className="relative overflow-hidden rounded-lg border border-[#EADFC9] bg-[#FBF5E9]"
              style={{ width: PREVIEW_W, height: bd.pvH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ctx.blankUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-0" style={maskStyle}>
                <div className="absolute overflow-hidden" style={{ left: bd.qx, top: bd.qy, width: bd.qw, height: bd.qh }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={cutout?.url ?? keepsake.imageUrl}
                    alt="your keepsake"
                    style={bdImgStyle}
                    onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  />
                </div>
              </div>
              {/* labelled guides */}
              <div className="pointer-events-none absolute border border-dashed border-cinnamon/80" style={{ left: bd.qx, top: bd.qy, width: bd.qw, height: bd.qh }} />
              <span className="pointer-events-none absolute rounded-sm bg-cinnamon/90 px-1 py-px text-[9px] font-bold text-white" style={{ left: bd.qx + 3, top: bd.qy + 3 }}>
                print area
              </span>
              <div
                className="pointer-events-none absolute border border-dotted border-green-save/80"
                style={{ left: bd.qx + safePv, top: bd.qy + safePv, width: bd.qw - 2 * safePv, height: bd.qh - 2 * safePv }}
              />
              <span
                className="pointer-events-none absolute rounded-sm bg-green-save/90 px-1 py-px text-[9px] font-bold text-white"
                style={{ left: bd.qx + safePv + 3, top: bd.qy + bd.qh - safePv - 16 }}
              >
                keep inside
              </span>
            </div>
          ) : (
            <div
              className="relative overflow-hidden rounded-lg border border-[#EADFC9] bg-[#FBF5E9]"
              style={{ width: PREVIEW_W, height: previewH }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={cutout?.url ?? keepsake.imageUrl}
                alt="your keepsake"
                style={imgStyle}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {/* labelled print-edge + safe-area guides */}
              <div
                className="pointer-events-none absolute border border-dashed border-cinnamon/70"
                style={{ left: bleedPxv * scale, top: bleedPxv * scale, right: bleedPxv * scale, bottom: bleedPxv * scale }}
              />
              <span className="pointer-events-none absolute rounded-sm bg-cinnamon/90 px-1 py-px text-[9px] font-bold text-white" style={{ left: bleedPxv * scale + 3, top: bleedPxv * scale + 3 }}>
                print area
              </span>
              <div
                className="pointer-events-none absolute border border-dotted border-green-save/60"
                style={{ left: safePxv * scale, top: safePxv * scale, right: safePxv * scale, bottom: safePxv * scale }}
              />
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-[#9C8772]">
            anything outside the <b className="text-cinnamon">dashed line</b> won&apos;t print · keep faces &amp; words inside the <b className="text-green-save">dotted line</b>
          </p>

          {/* DPI status */}
          {assess ? (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold ${
                assess.decision === 'OK'
                  ? 'bg-[#EAF1E4] text-green-save'
                  : assess.decision === 'UPSCALE'
                    ? 'bg-honey-band text-[#8A5B22]'
                    : 'bg-[#FBE4DA] text-berry'
              }`}
            >
              <Icon icon={assess.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={15} />
              {assess.decision === 'OK'
                ? `print-ready · ${t.requiredDpi} dpi`
                : assess.decision === 'UPSCALE'
                  ? `we'll gently enhance it (about ${assess.effectiveDpi} dpi here)`
                  : `too small to print well here — zoom out or pick a smaller product`}
            </div>
          ) : null}
        </div>

        {/* Controls */}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Product</p>
          {focused ? (
            // Scoped to the ONE creation being customized — no catalogue here.
            <p className="mt-2 inline-flex rounded-full border border-cinnamon bg-[#FBEFE0] px-3 py-1.5 text-xs font-semibold text-cocoa">
              {variant.label} · {gbp(variant.pricePence)}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {variants.map((v) => (
                <ProductChip key={v.id} v={v} active={v.id === variantId} onClick={() => switchVariant(v)} />
              ))}
            </div>
          )}

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

          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Position</p>
          <div className="mt-2 space-y-3">
            <ZoomSlider
              fit={fitScale}
              value={zoomValue}
              onChange={(v) => update({ scale: Math.abs(v - fitScale) < fitScale * 0.015 ? 0 : v })}
            />
            <Slider label="Left / right" min={-1} max={1} step={0.05} value={tf.offsetX} onChange={(v) => update({ offsetX: v })} format={() => ''} />
            <Slider label="Up / down" min={-1} max={1} step={0.05} value={tf.offsetY} onChange={(v) => update({ offsetY: v })} format={() => ''} />
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

function ProductChip({ v, active, onClick }: { v: StudioVariant; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58] hover:border-honey'}`}
    >
      {v.label} · {gbp(v.pricePence)}
    </button>
  );
}

/**
 * Zoom with "fit the whole image" at the CENTRE of the track: the left half runs
 * fit/2 → fit (zoom out, more margin), the right half fit → 4× (zoom in, crop) —
 * each half linear, so the default placement sits mid-track and the user can zoom
 * either way from it. Displays zoom relative to fit (fit = 1.0×).
 */
function ZoomSlider({ fit, value, onChange }: { fit: number; value: number; onChange: (v: number) => void }) {
  const minZ = fit / 2;
  const toT = (v: number) => (v <= fit ? (0.5 * (v - minZ)) / (fit - minZ || 1) : 0.5 + (0.5 * (v - fit)) / (MAX_ZOOM - fit || 1));
  const fromT = (raw: number) => (raw <= 0.5 ? minZ + (raw / 0.5) * (fit - minZ) : fit + ((raw - 0.5) / 0.5) * (MAX_ZOOM - fit));
  return (
    <label className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 text-[11px] text-[#6F6358]">Zoom</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={Math.min(1, Math.max(0, toT(value)))}
        aria-label="Zoom"
        onChange={(e) => onChange(fromT(Number(e.target.value)))}
        className="h-1.5 flex-1 accent-cinnamon"
      />
      <span className="w-8 shrink-0 text-right text-[11px] text-[#9C8E7E]">{`${(value / fit).toFixed(1)}×`}</span>
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
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 text-[11px] text-[#6F6358]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
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
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
