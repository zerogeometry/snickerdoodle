'use client';

import { IconAlertTriangle, IconArrowLeft, IconCircleCheck, IconRotateClockwise, IconShoppingBag, IconSparkles, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { gbp, toast, useBasket } from '@/lib/store';
import type { ProductKey } from '@/ui/components/ProductArt';
import { renderPreviewAction, type RenderPreviewResult } from '@/app/actions/render';
import { removeBackgroundAction } from '@/app/actions/magic';
import {
  assessResolution,
  canvasSizePx,
  clampTransform,
  computeLayerRect,
  mmToPx,
  type Rotation,
  type Transform,
} from '@/server/print/geometry';
import type { StudioData, StudioVariant } from '@/server/studio';

const PREVIEW_W = 360; // on-screen canvas width in CSS px

export function Positioner({ data, draft = false }: { data: StudioData; draft?: boolean }) {
  const [assetIdx, setAssetIdx] = useState(0);
  const [variantId, setVariantId] = useState(data.variants[0]?.id ?? '');
  const [tf, setTf] = useState<Transform>({ scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  const [cutout, setCutout] = useState<{ url: string; sourceObjectId: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const router = useRouter();
  const addToBasket = useBasket((s) => s.add);

  const keepsake = data.keepsakes[assetIdx];
  const variant = data.variants.find((v) => v.id === variantId) ?? data.variants[0];

  if (!keepsake || !variant) {
    return (
      <Shell back={draft ? '/start-creating' : '/home'}>
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

  return (
    <Shell>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* Canvas */}
        <div>
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
            {/* print-area + safe-area guides */}
            <div
              className="pointer-events-none absolute border border-dashed border-cinnamon/70"
              style={{ left: bleedPxv * scale, top: bleedPxv * scale, right: bleedPxv * scale, bottom: bleedPxv * scale }}
            />
            <div
              className="pointer-events-none absolute border border-dotted border-green-save/60"
              style={{ left: safePxv * scale, top: safePxv * scale, right: safePxv * scale, bottom: safePxv * scale }}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-[#9C8772]">
            dashed = trim · dotted = keep the important bits inside
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
          <div className="mt-2 flex flex-wrap gap-2">
            {data.variants.map((v) => (
              <ProductChip key={v.id} v={v} active={v.id === variantId} onClick={() => { setVariantId(v.id); setResult(null); }} />
            ))}
          </div>

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
            <Slider label="Zoom" min={1} max={4} step={0.05} value={tf.scale} onChange={(v) => update({ scale: v })} format={(v) => `${v.toFixed(1)}×`} />
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

          <Button size="lg" className="mt-5 w-full" onClick={add} disabled={assess?.decision === 'BLOCK'}>
            <Icon icon={IconShoppingBag} size={16} />{' '}
            {draft ? `keep it & check out · ${gbp(variant.pricePence)}` : `add to basket · ${gbp(variant.pricePence)}`}
          </Button>
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
        <span className="font-display text-lg font-semibold text-cocoa">
          place your keepsake <span className="rounded-full bg-[#EFE4D0] px-2 py-0.5 text-[11px] font-bold text-[#7A6A58]">studio</span>
        </span>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-6">
        {children}
      </main>
    </div>
  );
}
