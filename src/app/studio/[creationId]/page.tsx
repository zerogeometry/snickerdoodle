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
  IconLock,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconPointer,
  IconSparkles,
  IconStack2,
  IconSticker,
  IconSun,
  IconTypography,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { cn } from '@/ui/cn';

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

const MAGIC: { label: string; icon: TablerIconComponent }[] = [
  { label: 'Remove bg', icon: IconBackground },
  { label: 'Tidy lines', icon: IconEraser },
  { label: 'Brighten', icon: IconSun },
  { label: 'Watercolour', icon: IconBrush },
];

const LAYERS: { name: string; icon: TablerIconComponent; locked?: boolean }[] = [
  { name: 'Happy Birthday', icon: IconTypography },
  { name: "Olivia's drawing", icon: IconPhoto },
  { name: 'Background', icon: IconColorSwatch, locked: true },
];

function CanvasArt() {
  return (
    <svg viewBox="0 0 170 150" className="h-auto w-[60%] max-w-[280px]" aria-label="Olivia's drawing on the canvas">
      <rect x="32" y="56" width="74" height="56" fill="none" stroke="#C8623A" strokeWidth="4" />
      <path d="M24 58 L69 28 L114 58" fill="none" stroke="#E8786E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="58" y="80" width="22" height="32" fill="none" stroke="#84BBD0" strokeWidth="3.5" />
      <circle cx="134" cy="28" r="11" fill="#F2A640" />
      <path d="M12 122 q16 -9 32 0 t32 0 t32 0 t30 0" fill="none" stroke="#93B97C" strokeWidth="3.5" strokeLinecap="round" />
      <text x="69" y="138" textAnchor="middle" fontFamily="var(--font-hand)" fontSize="14" fill="#C8623A">
        Happy Birthday!
      </text>
    </svg>
  );
}

function DpiBadge() {
  return (
    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#EAF1E4] px-2.5 py-1 text-[11px] font-bold text-green-save">
      <Icon icon={IconCircleCheck} size={13} /> 300 dpi · print-ready
    </span>
  );
}

function VisualSlider({ label, pct, value }: { label: string; pct: number; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-[11px] text-[#6F6358]">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-[#EAD9BE]">
        <div className="absolute left-0 top-0 h-1.5 rounded-full bg-cinnamon" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cinnamon bg-white"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] text-[#9C8E7E]">{value}</span>
    </div>
  );
}

export default function StudioPage() {
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState(SWATCHES[0]!);

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

  return (
    <div className="flex h-dvh flex-col bg-[#FFFDF8]">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-[#EDE2CD] px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <a href="/home" aria-label="Back" className="md:hidden">
            <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
          </a>
          <span className="hidden items-center gap-1.5 font-display text-base font-semibold md:flex">
            snickerdoodle
            <span className="rounded-full bg-[#EFE4D0] px-2 py-0.5 text-[11px] font-bold text-[#7A6A58]">studio</span>
          </span>
        </div>
        <button className="flex items-center gap-1.5 rounded-full border border-[#E6D8BE] bg-white px-3 py-1.5 text-[11px] text-[#6F6358]">
          <span className="md:hidden">A4 print</span>
          <span className="hidden md:inline">A4 print · 210 × 297 mm</span>
          <Icon icon={IconChevronDown} size={12} />
        </button>
        <div className="flex items-center gap-2.5">
          <Icon icon={IconArrowBackUp} size={16} className="hidden text-[#9C8E7E] md:block" />
          <Icon icon={IconArrowForwardUp} size={16} className="hidden text-[#9C8E7E] md:block" />
          <Button size="sm" className="text-[11px]">
            <span className="md:hidden">save</span>
            <span className="hidden md:inline">save · basket</span>
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
            <DpiBadge />
            <div className="relative">
              <div className="pointer-events-none absolute -inset-3 rounded-sm border-[1.5px] border-dashed border-cinnamon" />
              <CanvasArt />
            </div>
            {/* Floating brush HUD (mobile) */}
            <div className="absolute bottom-4 right-3 flex flex-col items-center gap-2 rounded-[22px] border border-[#EADFC9] bg-white/95 px-1.5 py-2 shadow-[0_4px_12px_rgba(46,39,35,.12)] md:hidden">
              <span className="h-[22px] w-[22px] rounded-full border-2 border-white" style={{ background: color, boxShadow: '0 0 0 1px #E0C7A8' }} />
              <span className="h-3.5 w-3.5 rounded-full bg-cocoa" />
              <Icon icon={IconPlus} size={15} className="text-[#9C8E7E]" />
            </div>
          </div>
          {/* Zoom (desktop) */}
          <div className="mt-2 hidden items-center gap-2 text-[11px] text-[#7A6A58] md:flex">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[#E6D8BE] bg-white">
              <Icon icon={IconMinus} size={12} />
            </span>
            <span className="rounded-full bg-[#F1E7D4] px-2 py-0.5">100%</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[#E6D8BE] bg-white">
              <Icon icon={IconPlus} size={12} />
            </span>
            <span className="ml-auto">bleed &amp; safe area shown</span>
          </div>
        </div>

        {/* Right panel (desktop) */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-l border-[#EDE2CD] p-3 md:block">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
            <Icon icon={IconBrush} size={12} /> Brush
          </p>
          <div className="space-y-2">
            <VisualSlider label="Size" pct={42} value="24px" />
            <VisualSlider label="Smoothness" pct={70} value="70%" />
          </div>
          <div className="mt-3">{swatches}</div>

          <p className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
            <Icon icon={IconStack2} size={12} /> Layers
          </p>
          <div className="space-y-1.5">
            {LAYERS.map((l, i) => (
              <div
                key={l.name}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px]',
                  i === 0 ? 'border-cinnamon bg-[#FBEFE0]' : 'border-[#EADFC9] bg-white',
                )}
              >
                <Icon icon={l.icon} size={14} className="text-[#9C8E7E]" />
                <span className="flex-1 font-semibold text-cocoa">{l.name}</span>
                <Icon icon={l.locked ? IconLock : IconEye} size={14} className="text-[#9C8E7E]" />
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
                className="flex items-center gap-1.5 rounded-lg border border-[#EADFC9] bg-white px-2 py-1.5 text-[11px] font-semibold text-cocoa hover:border-honey"
              >
                <Icon icon={m.icon} size={13} className="text-cinnamon" /> {m.label}
              </button>
            ))}
            <button
              type="button"
              className="col-span-2 flex items-center gap-1.5 rounded-lg border border-[#E2A86C] bg-[#FBEFE0] px-2 py-1.5 text-[11px] font-semibold text-cocoa"
            >
              <Icon icon={IconArrowsMaximize} size={13} className="text-cinnamon" /> Upscale to print quality
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
        <div className="space-y-2">
          <VisualSlider label="Size" pct={42} value="24px" />
          <VisualSlider label="Smoothness" pct={70} value="70%" />
        </div>
        <div className="mt-2.5">{swatches}</div>
      </div>

      {/* Tool bar (mobile) */}
      <div className="flex gap-2 overflow-x-auto border-t border-[#EFE6D6] bg-oat px-3 pb-5 pt-2.5 md:hidden">
        {MOBILE_TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-label={t.key}
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
