'use client';

import {
  IconAdjustments,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowsMaximize,
  IconArrowsMove,
  IconBackground,
  IconBrush,
  IconBucket,
  IconChevronDown,
  IconCircleCheck,
  IconColorSwatch,
  IconCrop,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconPointer,
  IconShoppingBag,
  IconSparkles,
  IconStack2,
  IconSticker,
  IconSun,
  IconTypography,
  IconAlertTriangle,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { cn } from '@/ui/cn';
import { toast, useBasket, useKept, useUpload } from '@/lib/store';
import type { ProductKey } from '@/ui/components/ProductArt';

const RAIL: { key: string; icon: TablerIconComponent }[] = [
  { key: 'select', icon: IconPointer },
  { key: 'move', icon: IconArrowsMove },
  { key: 'crop', icon: IconCrop },
  { key: 'brush', icon: IconBrush },
  { key: 'eraser', icon: IconEraser },
  { key: 'fill', icon: IconBucket },
  { key: 'text', icon: IconTypography },
  { key: 'sticker', icon: IconSticker },
  { key: 'magic', icon: IconSparkles },
];

const MOBILE_TOOLS: { key: string; icon: TablerIconComponent }[] = [
  { key: 'brush', icon: IconBrush },
  { key: 'eraser', icon: IconEraser },
  { key: 'text', icon: IconTypography },
  { key: 'sticker', icon: IconSticker },
  { key: 'layers', icon: IconStack2 },
  { key: 'adjust', icon: IconAdjustments },
  { key: 'magic', icon: IconSparkles },
];

const SWATCHES = ['#C8623A', '#F2A640', '#E8786E', '#84BBD0', '#93B97C', '#2E2723'];

const MAGIC: { label: string; icon: TablerIconComponent; filter: string }[] = [
  { label: 'Remove bg', icon: IconBackground, filter: '' },
  { label: 'Tidy lines', icon: IconEraser, filter: 'contrast(1.25)' },
  { label: 'Brighten', icon: IconSun, filter: 'brightness(1.12) saturate(1.15)' },
  { label: 'Watercolour', icon: IconBrush, filter: 'saturate(1.4) blur(0.4px)' },
];

const PRODUCTS: { label: string; short: string; product: ProductKey; pricePence: number }[] = [
  { label: 'A4 print · 210 × 297 mm', short: 'A4 print', product: 'framedPrint', pricePence: 2200 },
  { label: 'Mug · 11oz', short: 'Mug', product: 'mug', pricePence: 1400 },
  { label: 'Kids tee · age 5–6', short: 'Kids tee', product: 'kidsTee', pricePence: 1800 },
  { label: 'Cushion · 45 × 45 cm', short: 'Cushion', product: 'cushion', pricePence: 2800 },
];

type LayerKey = 'text' | 'drawing' | 'bg';
const LAYER_META: { key: LayerKey; name: string; icon: TablerIconComponent; locked?: boolean }[] = [
  { key: 'text', name: 'Happy Birthday', icon: IconTypography },
  { key: 'drawing', name: "Olivia's drawing", icon: IconPhoto },
  { key: 'bg', name: 'Background', icon: IconColorSwatch, locked: true },
];

function RangeRow({
  label,
  value,
  set,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-[68px] shrink-0 text-[11px] text-[#6F6358]">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => set(Number(e.target.value))}
        className="h-1.5 flex-1 accent-cinnamon"
      />
      <span className="w-9 shrink-0 text-right text-[11px] text-[#9C8E7E]">
        {value}
        {unit}
      </span>
    </div>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);

  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState(SWATCHES[0]!);
  const [size, setSize] = useState(24);
  const [smooth, setSmooth] = useState(70);
  const [zoom, setZoom] = useState(100);
  const [productIdx, setProductIdx] = useState(0);
  const [filter, setFilter] = useState('');
  const [working, setWorking] = useState('');
  const [printReady, setPrintReady] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ text: true, drawing: true, bg: true });

  const product = PRODUCTS[productIdx]!;

  const keep = () => {
    useKept.getState().add({
      id: `k-${Date.now()}`,
      name: 'Studio creation',
      image: upload?.dataUrl,
      meta: 'just now',
      visibility: 'FAMILY',
    });
    toast('kept to your keepsake box ✓');
  };

  const addToBasket = () => {
    useBasket.getState().add({
      id: `studio-${product.product}`,
      name: product.short.toLowerCase(),
      product: product.product,
      pricePence: product.pricePence,
    });
    toast('added to basket');
    router.push('/checkout');
  };

  const applyMagic = (label: string, f: string) => {
    if (working) return;
    setWorking(label);
    setTimeout(() => {
      setFilter(f);
      setWorking('');
      toast(`✨ ${label.toLowerCase()} applied`);
    }, 650);
  };

  const upscale = () => {
    if (working) return;
    setWorking('upscale');
    setTimeout(() => {
      setPrintReady(true);
      setWorking('');
      toast('upscaled to print quality ✓');
    }, 900);
  };

  const cycleProduct = () => {
    const next = (productIdx + 1) % PRODUCTS.length;
    setProductIdx(next);
    setPrintReady(false);
    toast(`switched to ${PRODUCTS[next]!.short.toLowerCase()}`);
  };

  const toggleLayer = (key: LayerKey, locked?: boolean) => {
    if (locked) {
      toast('background is locked');
      return;
    }
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };

  const swatches = (
    <div className="flex gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`colour ${c}`}
          onClick={() => setColor(c)}
          className="h-[18px] w-[18px] rounded-full"
          style={{ background: c, boxShadow: color === c ? `0 0 0 2px #FBF5E9, 0 0 0 3px ${c}` : undefined }}
        />
      ))}
    </div>
  );

  const brushControls = (
    <div className="space-y-2">
      <RangeRow label="Size" value={size} set={setSize} min={1} max={60} unit="px" />
      <RangeRow label="Smoothness" value={smooth} set={setSmooth} min={0} max={100} unit="%" />
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-[#FFFDF8]">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-[#EDE2CD] px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <Link href="/home" aria-label="Back to keepsake home" className="md:hidden">
            <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
          </Link>
          <Link href="/home" className="hidden items-center gap-1.5 font-display text-base font-semibold md:flex">
            snickerdoodle
            <span className="rounded-full bg-[#EFE4D0] px-2 py-0.5 text-[11px] font-bold text-[#7A6A58]">studio</span>
          </Link>
        </div>
        <button
          type="button"
          onClick={cycleProduct}
          className="flex items-center gap-1.5 rounded-full border border-[#E6D8BE] bg-white px-3 py-1.5 text-[11px] text-[#6F6358] hover:border-honey"
        >
          <span className="md:hidden">{product.short}</span>
          <span className="hidden md:inline">{product.label}</span>
          <Icon icon={IconChevronDown} size={12} />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            aria-label="Undo"
            title="Nothing to undo yet"
            className="hidden text-[#CFC2AE] md:block"
          >
            <Icon icon={IconArrowBackUp} size={16} />
          </button>
          <button
            type="button"
            disabled
            aria-label="Redo"
            title="Nothing to redo"
            className="hidden text-[#CFC2AE] md:block"
          >
            <Icon icon={IconArrowForwardUp} size={16} />
          </button>
          <button
            type="button"
            onClick={keep}
            className="hidden rounded-full px-2.5 py-1.5 text-[11px] font-bold text-cinnamon hover:bg-[#F6F0E4] md:block"
          >
            keep
          </button>
          <Button size="sm" className="text-[11px]" onClick={addToBasket}>
            <Icon icon={IconShoppingBag} size={13} />
            <span className="md:hidden">basket</span>
            <span className="hidden md:inline">add to basket</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tool rail (desktop) */}
        <div className="hidden w-11 flex-col items-center gap-1 border-r border-[#EDE2CD] py-2 md:flex">
          {RAIL.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-label={t.key}
              aria-pressed={tool === t.key}
              onClick={() => setTool(t.key)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                tool === t.key ? 'bg-[#F4E3CC] text-cinnamon' : 'text-[#7A6A58] hover:bg-[#F6F0E4]',
              )}
            >
              <Icon icon={t.icon} size={17} />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="relative flex min-w-0 flex-1 flex-col p-3">
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-[#EADFC9] bg-[#FBF5E9] md:bg-[#FFFDF8]">
            {/* DPI badge — warns when low-res, flips to print-ready after upscale */}
            {printReady ? (
              <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#EAF1E4] px-2.5 py-1 text-[11px] font-bold text-green-save">
                <Icon icon={IconCircleCheck} size={13} /> 300 dpi · print-ready
              </span>
            ) : (
              <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[#FBE4DA] px-2.5 py-1 text-[11px] font-bold text-berry">
                <Icon icon={IconAlertTriangle} size={13} /> 72 dpi · too small to print
              </span>
            )}
            {working ? (
              <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-cocoa px-2.5 py-1 text-[11px] font-bold text-oat">
                <Icon icon={IconSparkles} size={12} /> working its magic…
              </span>
            ) : null}
            <div
              className="relative transition-transform"
              style={{ transform: `scale(${zoom / 100})`, filter: filter || undefined }}
            >
              <div className="pointer-events-none absolute -inset-3 rounded-sm border-[1.5px] border-dashed border-cinnamon" />
              <svg viewBox="0 0 170 150" className="h-auto w-[60%] max-w-[280px] md:w-[280px]" aria-label="Your drawing on the canvas">
                {layers.drawing ? (
                  upload ? (
                    <image href={upload.dataUrl} x="20" y="14" width="130" height="122" preserveAspectRatio="xMidYMid meet" />
                  ) : (
                    <>
                      <rect x="32" y="56" width="74" height="56" fill="none" stroke="#C8623A" strokeWidth="4" />
                      <path d="M24 58 L69 28 L114 58" fill="none" stroke="#E8786E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="58" y="80" width="22" height="32" fill="none" stroke="#84BBD0" strokeWidth="3.5" />
                      <circle cx="134" cy="28" r="11" fill="#F2A640" />
                      <path d="M12 122 q16 -9 32 0 t32 0 t32 0 t30 0" fill="none" stroke="#93B97C" strokeWidth="3.5" strokeLinecap="round" />
                    </>
                  )
                ) : null}
                {layers.text ? (
                  <text x="69" y="146" textAnchor="middle" fontFamily="var(--font-hand)" fontSize="14" fill="#C8623A">
                    Happy Birthday!
                  </text>
                ) : null}
              </svg>
            </div>
            {/* Floating brush HUD (mobile) */}
            <div className="absolute bottom-4 right-3 flex flex-col items-center gap-2 rounded-[22px] border border-[#EADFC9] bg-white/95 px-1.5 py-2 shadow-[0_4px_12px_rgba(46,39,35,.12)] md:hidden">
              <span className="h-[22px] w-[22px] rounded-full border-2 border-white" style={{ background: color, boxShadow: '0 0 0 1px #E0C7A8' }} />
              <span className="rounded-full bg-cocoa" style={{ height: Math.max(6, size / 4), width: Math.max(6, size / 4) }} />
            </div>
          </div>
          {/* Zoom (desktop) */}
          <div className="mt-2 hidden items-center gap-2 text-[11px] text-[#7A6A58] md:flex">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="flex h-5 w-5 items-center justify-center rounded-md border border-[#E6D8BE] bg-white hover:border-honey"
            >
              <Icon icon={IconMinus} size={12} />
            </button>
            <span className="rounded-full bg-[#F1E7D4] px-2 py-0.5">{zoom}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              className="flex h-5 w-5 items-center justify-center rounded-md border border-[#E6D8BE] bg-white hover:border-honey"
            >
              <Icon icon={IconPlus} size={12} />
            </button>
            <span className="ml-auto">bleed &amp; safe area shown</span>
          </div>
        </div>

        {/* Right panel (desktop) */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-l border-[#EDE2CD] p-3 md:block">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
            <Icon icon={IconBrush} size={12} /> Brush
          </p>
          {brushControls}
          <div className="mt-3">{swatches}</div>

          <p className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
            <Icon icon={IconStack2} size={12} /> Layers
          </p>
          <div className="space-y-1.5">
            {LAYER_META.map((l) => (
              <div
                key={l.key}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px]',
                  layers[l.key] ? 'border-[#EADFC9] bg-white' : 'border-[#EADFC9] bg-[#F6F0E4] opacity-60',
                )}
              >
                <Icon icon={l.icon} size={14} className="text-[#9C8E7E]" />
                <span className="flex-1 font-semibold text-cocoa">{l.name}</span>
                <button
                  type="button"
                  aria-label={l.locked ? `${l.name} locked` : `Toggle ${l.name}`}
                  aria-pressed={layers[l.key]}
                  onClick={() => toggleLayer(l.key, l.locked)}
                  className="text-[#9C8E7E] hover:text-cinnamon"
                >
                  <Icon icon={l.locked ? IconLock : layers[l.key] ? IconEye : IconEyeOff} size={14} />
                </button>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
            <Icon icon={IconSparkles} size={12} /> Magic edits
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {MAGIC.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => applyMagic(m.label, m.filter)}
                disabled={!!working}
                className="flex items-center gap-1.5 rounded-lg border border-[#EADFC9] bg-white px-2 py-1.5 text-[11px] font-semibold text-cocoa hover:border-honey disabled:opacity-50"
              >
                <Icon icon={m.icon} size={13} className="text-cinnamon" /> {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={upscale}
              disabled={!!working || printReady}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-[#E2A86C] bg-[#FBEFE0] px-2 py-1.5 text-[11px] font-semibold text-cocoa hover:border-cinnamon disabled:opacity-60"
            >
              <Icon icon={IconArrowsMaximize} size={13} className="text-cinnamon" />{' '}
              {printReady ? 'print-ready ✓' : 'Upscale to print quality'}
            </button>
          </div>
        </aside>
      </div>

      {/* Active-tool bottom sheet (mobile) */}
      <div className="border-t border-[#EFE6D6] bg-white px-4 pb-2 pt-2 md:hidden">
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[#E0D4BD]" />
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold">
            <Icon icon={IconBrush} size={14} className="text-cinnamon" /> Brush
          </span>
          <span className="text-[11px] text-[#9C8E7E]">tap a colour</span>
        </div>
        {brushControls}
        <div className="mt-2.5 flex items-center justify-between">
          {swatches}
          <button type="button" onClick={() => applyMagic('Brighten', 'brightness(1.12) saturate(1.15)')} className="flex items-center gap-1 text-[11px] font-bold text-cinnamon">
            <Icon icon={IconSparkles} size={13} /> magic
          </button>
        </div>
      </div>

      {/* Tool bar (mobile) */}
      <div className="flex gap-2 overflow-x-auto border-t border-[#EFE6D6] bg-oat px-3 pb-5 pt-2.5 md:hidden">
        {MOBILE_TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-label={t.key}
            aria-pressed={tool === t.key}
            onClick={() => setTool(t.key)}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg',
              tool === t.key ? 'bg-[#F4E3CC] text-cinnamon' : 'text-[#7A6A58]',
            )}
          >
            <Icon icon={t.icon} size={19} />
          </button>
        ))}
      </div>
    </div>
  );
}
