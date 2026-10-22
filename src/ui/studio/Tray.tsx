'use client';

import {
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconLock,
  IconLockOpen,
  IconMinus,
  IconPencil,
  IconPlus,
  IconRestore,
  IconRotate,
  IconRotateClockwise,
  IconStackPop,
  IconStackPush,
  IconTrash,
  IconTypography,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { CARD_FONTS, cardFontCss, type CardFontToken } from '@/lib/card-fonts';
import { SHAPE_KINDS, SHAPE_PATHS, MAX_SHAPE_STROKE, type ShapeKind, type StudioObject } from '@/lib/studio-objects';
import { normAngle, snapAngle } from '@/lib/studio-geometry';
import { TEXTURES, type TextureKind } from '@/lib/textures';
import { Icon } from '@/ui/primitives/Icon';
import { layerName, type DrawingLayer, type PenStyle, type ShapeStyle, type TextStyle } from './AddedOptions';
import { STANDARD_COLOURS } from './ColourPicker';
import { ToolGlyph } from './ToolGlyph';
import { toolById, type ToolId } from './tools';

/**
 * The PHONE Studio's tool options (founder, 22 Oct): not a pane, but one slim, frosted row that rises
 * from behind the toolbar over the picture — like a phone camera's modes — and scrolls sideways.
 * Every option is a ≥44px target, labelled for screen readers; little uppercase words name each
 * group so the row still reads at a glance. Desktop keeps its side panel (panel.tsx).
 */

// ── the row kit ──

/** The frosted strip itself. `key` it by tool so each tool's row rises afresh. */
export function TrayRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="studio-glass flex items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-[20px] px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

const CHIP = 'press flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-[12px] font-extrabold transition-colors';
const CHIP_ON = 'bg-cocoa text-paper shadow-[0_2px_0_var(--color-honey)] [--glyph-ring:var(--color-cocoa)]';
const CHIP_OFF = 'border border-cocoa/15 bg-paper/85 text-cocoa';

export function TChip({ on, onClick, children, label, disabled, primary, className }: { on?: boolean; onClick?: () => void; children: ReactNode; label?: string; disabled?: boolean; primary?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      className={`${CHIP} ${primary ? 'bg-cta text-white shadow-[0_2px_0_var(--color-cta-deep)] [--glyph-ring:var(--color-cta)]' : on ? CHIP_ON : CHIP_OFF} disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** An icon-only chip (a round 44px button). */
export function TIcon({ icon, label, onClick, danger, disabled }: { icon: typeof IconCopy; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40 ${danger ? 'border-berry bg-paper/85 text-cinnamon' : 'border-cocoa/15 bg-paper/85 text-cocoa'}`}
    >
      <Icon icon={icon} size={18} />
    </button>
  );
}

export const TSep = () => <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-cocoa/20" />;
export const TLabel = ({ children }: { children: ReactNode }) => (
  <span aria-hidden className="shrink-0 pl-1 text-[10px] font-extrabold uppercase tracking-wide text-ink-soft">
    {children}
  </span>
);

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
};

/** The crayon-box colours as dots, plus the device's own picker for any shade. */
export function TSwatches({ value, onChange, label }: { value: string | null; onChange: (hex: string) => void; label: string }) {
  const custom = value && !STANDARD_COLOURS.some((c) => c.hex === value.toLowerCase()) ? value : null;
  return (
    <>
      {STANDARD_COLOURS.map((c) => {
        const on = value?.toLowerCase() === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            aria-label={`${label}: ${c.name}`}
            aria-pressed={on}
            onClick={() => onChange(c.hex)}
            className="flex h-11 w-9 shrink-0 items-center justify-center"
          >
            <span
              aria-hidden
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${on ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/25'}`}
              style={{ background: c.hex }}
            >
              {on ? <Icon icon={IconCheck} size={14} className={isLight(c.hex) ? 'text-cocoa' : 'text-white'} /> : null}
            </span>
          </button>
        );
      })}
      <label className="relative flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center" title="more colours">
        <span className="sr-only">{label}: more colours</span>
        <span
          aria-hidden
          className={`h-8 w-8 rounded-full border-2 ${custom ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/25'}`}
          style={{ background: custom ?? 'conic-gradient(#d7352c, #f6c445, #4f9d3a, #5fb4e5, #7b4bb3, #ef7fae, #d7352c)' }}
        />
        <input type="color" value={custom ?? '#d7352c'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label}: more colours`} />
      </label>
    </>
  );
}

/** Size presets as dots of that size (nearest one shows as picked). */
function TDots({ values, value, onChange, label, colour = 'var(--color-cocoa)', px }: { values: number[]; value: number; onChange: (v: number) => void; label: string; colour?: string; px: (v: number) => number }) {
  const near = values.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a), values[0]!);
  return (
    <>
      {values.map((v, i) => (
        <button
          key={v}
          type="button"
          aria-label={`${label} ${i + 1} of ${values.length}`}
          aria-pressed={v === near}
          onClick={() => onChange(v)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${v === near ? 'bg-cocoa/10 ring-2 ring-cocoa' : ''}`}
        >
          <span aria-hidden className="rounded-full" style={{ width: Math.max(4, Math.min(26, px(v))), height: Math.max(4, Math.min(26, px(v))), background: colour }} />
        </button>
      ))}
    </>
  );
}

function TTextures({ value, onChange }: { value: TextureKind; onChange: (t: TextureKind) => void }) {
  return (
    <>
      <TLabel>texture</TLabel>
      {TEXTURES.map((t) => (
        <TChip key={t.kind} on={value === t.kind} onClick={() => onChange(t.kind)}>
          {t.label}
        </TChip>
      ))}
    </>
  );
}

function TFonts({ value, onChange }: { value: CardFontToken; onChange: (f: CardFontToken) => void }) {
  return (
    <>
      {CARD_FONTS.map((f) => (
        <TChip key={f.token} on={value === f.token} onClick={() => onChange(f.token)} className="!text-[16px] !font-normal">
          <span style={{ fontFamily: cardFontCss(f.token) }}>{f.label}</span>
        </TChip>
      ))}
    </>
  );
}

/** Turn: quarter turns both ways, straight, and a slim slider that clicks in at every 45°. */
function TTurn({ angle, onAngle, what }: { angle: number; onAngle: (deg: number, group?: boolean) => void; what: string }) {
  return (
    <>
      <TLabel>turn</TLabel>
      <TIcon icon={IconRotate} label={`turn ${what} a quarter turn anticlockwise`} onClick={() => onAngle(normAngle(angle - 90))} />
      <TIcon icon={IconRotateClockwise} label={`turn ${what} a quarter turn clockwise`} onClick={() => onAngle(normAngle(angle + 90))} />
      <input
        type="range"
        min={0}
        max={360}
        step={0.1}
        value={angle}
        onChange={(e) => onAngle(snapAngle(Number(e.target.value)), true)}
        aria-label={`turn ${what}`}
        aria-valuetext={`${Math.round(angle * 10) / 10} degrees`}
        className="h-11 w-28 shrink-0 accent-[var(--color-cta)]"
      />
      <span className="w-12 shrink-0 text-center font-display text-sm text-cocoa">{Math.round(angle * 10) / 10}°</span>
      <TChip onClick={() => onAngle(0)} disabled={angle === 0}>
        straight
      </TChip>
    </>
  );
}

// ── what each tool shows ──

export interface TrayProps {
  tool: ToolId;
  onTool: (id: ToolId) => void;
  busy: boolean;
  // cut out
  hadCutout: boolean;
  keepWhite: boolean;
  onKeepWhite: (on: boolean) => void;
  onRemoveBg: () => void;
  everywhere: boolean;
  setEverywhere: (v: boolean) => void;
  fussy: number;
  setFussy: (v: number) => void;
  brush: number;
  setBrush: (v: number) => void;
  // frame + colour
  angle: number;
  onAngle: (visual: number, group?: boolean) => void;
  onFlip: (axis: 'h' | 'v') => void;
  onResetCrop: () => void;
  onDoneCrop: () => void;
  background: string | null;
  setBackground: (bg: string | null) => void;
  // added things
  pen: PenStyle;
  setPen: (s: PenStyle) => void;
  textStyle: TextStyle;
  setTextStyle: (s: TextStyle) => void;
  shapeStyle: ShapeStyle;
  setShapeStyle: (s: ShapeStyle) => void;
  objects: StudioObject[];
  selected: StudioObject | null;
  baseLabel: string;
  drawing: DrawingLayer | null;
  onSelect: (id: string | null) => void;
  /** Open the selected words for typing, in place on the picture. */
  onEditWords: () => void;
  onTurn: (deg: number, group?: boolean) => void;
  onUpdate: (patch: Partial<StudioObject>, group?: boolean) => void;
  onAddShape: (k: ShapeKind) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBack: () => void;
}

/** The rows for the active tool (one, or two for layers / an item being changed), or null. */
export function StudioTray(p: TrayProps): ReactNode {
  const jump = (id: ToolId, label: string) => (
    <TChip onClick={() => p.onTool(id)}>
      <ToolGlyph tool={toolById(id)} size={16} /> {label}
    </TChip>
  );
  const row = (children: ReactNode, label = toolById(p.tool).label) => <TrayRow label={`${label} options`}>{children}</TrayRow>;

  switch (p.tool) {
    case 'removeBg':
      return row(
        <>
          {p.hadCutout ? (
            <span className={`${CHIP} bg-leaf-pale text-green-save`}>
              <Icon icon={IconCircleCheck} size={16} /> background removed
            </span>
          ) : (
            <TChip primary onClick={p.onRemoveBg} disabled={p.busy}>
              <ToolGlyph tool={toolById('removeBg')} size={16} /> remove background
            </TChip>
          )}
          <TChip on={p.keepWhite} onClick={() => p.onKeepWhite(!p.keepWhite)} label="keep the white inside shapes — the whites of eyes, a snowman, a cloud">
            keep white inside shapes
          </TChip>
          <TSep />
          <TLabel>tidy</TLabel>
          {jump('erase', 'eraser')}
          {jump('restore', 'bring back')}
        </>,
      );
    case 'removeColour': {
      const near = p.fussy < 20 ? 14 : p.fussy > 42 ? 50 : 28;
      return row(
        <>
          <TChip on={p.everywhere} onClick={() => p.setEverywhere(true)} label="remove that colour everywhere it appears">
            everywhere
          </TChip>
          <TChip on={!p.everywhere} onClick={() => p.setEverywhere(false)} label="remove only the patch you tap">
            just that patch
          </TChip>
          <TSep />
          <TLabel>match</TLabel>
          {([
            [14, 'exact'],
            [28, 'close'],
            [50, 'loose'],
          ] as const).map(([v, l]) => (
            <TChip key={v} on={near === v} onClick={() => p.setFussy(v)} label={`match ${l}`}>
              {l}
            </TChip>
          ))}
        </>,
      );
    }
    case 'erase':
    case 'restore':
      return row(
        <>
          <TLabel>brush</TLabel>
          <TDots values={[12, 24, 40, 70, 120]} value={p.brush} onChange={p.setBrush} label="brush size" px={(v) => v / 4.5} />
          <TSep />
          {p.tool === 'erase' ? jump('restore', 'bring back') : jump('erase', 'eraser')}
        </>,
      );
    case 'background':
      return row(
        <>
          <TChip on={!p.background} onClick={() => p.setBackground(null)} label="see-through — white on cards and prints">
            <span aria-hidden className="h-5 w-5 rounded-full border border-cocoa/30" style={{ background: 'repeating-conic-gradient(#ece4d6 0 25%, #fff 0 50%) 50% / 8px 8px' }} />
            see-through
          </TChip>
          <TSep />
          <TSwatches value={p.background} onChange={(hex) => p.setBackground(hex)} label="background colour" />
        </>,
      );
    case 'rotate':
      return row(<TTurn angle={p.angle} onAngle={p.onAngle} what="the design" />);
    case 'flip':
      return row(
        <>
          <TChip onClick={() => p.onFlip('h')}>
            <Icon icon={IconArrowsHorizontal} size={16} /> sideways
          </TChip>
          <TChip onClick={() => p.onFlip('v')}>
            <Icon icon={IconArrowsVertical} size={16} /> upside down
          </TChip>
        </>,
      );
    case 'crop':
      return row(
        <>
          <TChip onClick={p.onResetCrop}>reset</TChip>
          <TChip primary onClick={p.onDoneCrop}>
            <Icon icon={IconCheck} size={16} /> done cropping
          </TChip>
        </>,
      );
    case 'draw':
      return row(
        <>
          <TSwatches value={p.pen.colour} onChange={(colour) => p.setPen({ ...p.pen, colour })} label="pen colour" />
          <TSep />
          <TLabel>line</TLabel>
          <TDots values={[0.004, 0.008, 0.014, 0.024, 0.04]} value={p.pen.width} onChange={(width) => p.setPen({ ...p.pen, width })} label="line thickness" colour={p.pen.colour} px={(v) => v * 600} />
          <TSep />
          <TTextures value={p.pen.texture} onChange={(texture) => p.setPen({ ...p.pen, texture })} />
          <TSep />
          <TChip
            onClick={() => p.setPen({ ...p.pen, smooth: p.pen.smooth < 0.2 ? 0.5 : p.pen.smooth > 0.7 ? 0 : 0.9 })}
            label="smooth out wobbles — tap to change"
          >
            smoothing: {p.pen.smooth < 0.2 ? 'off' : p.pen.smooth > 0.7 ? 'lots' : 'some'}
          </TChip>
          <TChip on={p.pen.stylusOnly} onClick={() => p.setPen({ ...p.pen, stylusOnly: !p.pen.stylusOnly })} label="stylus only — fingers move the picture, only the pen draws">
            stylus only
          </TChip>
        </>,
      );
    case 'text':
      if (p.selected?.type === 'text') return <ItemEditor {...p} o={p.selected} />;
      return row(
        <>
          <TFonts value={p.textStyle.font} onChange={(font) => p.setTextStyle({ ...p.textStyle, font })} />
          <TSep />
          <TSwatches value={p.textStyle.colour} onChange={(colour) => p.setTextStyle({ ...p.textStyle, colour })} label="text colour" />
          <TSep />
          <TTextures value={p.textStyle.texture} onChange={(texture) => p.setTextStyle({ ...p.textStyle, texture })} />
        </>,
      );
    case 'shapes':
      if (p.selected?.type === 'shape') return <ItemEditor {...p} o={p.selected} />;
      return row(
        <>
          {SHAPE_KINDS.map((k) => (
            <button key={k} type="button" aria-label={`add a ${k}`} onClick={() => p.onAddShape(k)} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-cocoa/15 bg-paper/85">
              <svg viewBox="-12 -12 124 124" className="h-7 w-7" aria-hidden>
                <path d={SHAPE_PATHS[k]} fill={p.shapeStyle.fill} fillRule="evenodd" stroke={p.shapeStyle.strokeWidth > 0 ? p.shapeStyle.stroke : 'none'} strokeWidth={Math.max(3, p.shapeStyle.strokeWidth * 100)} strokeLinejoin="round" />
              </svg>
            </button>
          ))}
          <TSep />
          <TLabel>fill</TLabel>
          <TSwatches value={p.shapeStyle.fill} onChange={(fill) => p.setShapeStyle({ ...p.shapeStyle, fill })} label="shape colour" />
        </>,
      );
    case 'select':
      return <LayersTray {...p} />;
    default:
      return null;
  }
}

/** Changing one added thing: its own look, its turn, then duplicate / forward / back / delete. */
function ItemEditor(p: TrayProps & { o: StudioObject }) {
  const { o } = p;
  const [part, setPart] = useState<'fill' | 'outline'>('fill');
  // the two you reach for most come first; the rest of the layer's actions close the row
  const quick = (
    <>
      <TChip onClick={() => p.onSelect(null)} label="done changing it">
        <Icon icon={IconCheck} size={16} /> done
      </TChip>
      <TIcon icon={IconTrash} label="delete" onClick={p.onDelete} danger />
      <TSep />
    </>
  );
  const actions = (
    <>
      <TSep />
      <TIcon icon={IconCopy} label="duplicate" onClick={p.onDuplicate} />
      <TIcon icon={IconStackPop} label="bring forward" onClick={p.onForward} />
      <TIcon icon={IconStackPush} label="send back" onClick={p.onBack} />
    </>
  );
  if (o.type === 'text') {
    return (
      <TrayRow label={`changing ${layerName(o)}`}>
        <TChip primary onClick={p.onEditWords} label="type the words — right there on the picture">
          <Icon icon={IconPencil} size={16} /> type
        </TChip>
        {quick}
        <TFonts value={o.font} onChange={(font) => p.onUpdate({ font })} />
        <TSep />
        <TLabel>size</TLabel>
        <TIcon icon={IconMinus} label="smaller words" onClick={() => p.onUpdate({ size: Math.max(0.02, Math.round((o.size - 0.02) * 100) / 100) })} disabled={o.size <= 0.02} />
        <TIcon icon={IconPlus} label="bigger words" onClick={() => p.onUpdate({ size: Math.min(0.4, Math.round((o.size + 0.02) * 100) / 100) })} disabled={o.size >= 0.4} />
        <TSep />
        <TSwatches value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="text colour" />
        <TSep />
        <TTextures value={o.texture} onChange={(texture) => p.onUpdate({ texture })} />
        <TSep />
        <TTurn angle={o.rotation} onAngle={p.onTurn} what="the words" />
        {actions}
      </TrayRow>
    );
  }
  if (o.type === 'shape') {
    return (
      <TrayRow label={`changing the ${o.shape}`}>
        {quick}
        <TChip on={part === 'fill'} onClick={() => setPart('fill')}>
          fill
        </TChip>
        <TChip on={part === 'outline'} onClick={() => setPart('outline')}>
          outline
        </TChip>
        {part === 'fill' ? (
          <TSwatches value={o.fill} onChange={(fill) => p.onUpdate({ fill } as Partial<StudioObject>, true)} label="fill colour" />
        ) : (
          <>
            {([
              [0, 'none'],
              [0.05, 'thin'],
              [Math.min(MAX_SHAPE_STROKE, 0.1), 'thick'],
            ] as const).map(([w, l]) => (
              <TChip key={l} on={Math.abs(o.strokeWidth - w) < 0.01} onClick={() => p.onUpdate({ strokeWidth: w } as Partial<StudioObject>)} label={`outline ${l}`}>
                {l}
              </TChip>
            ))}
            <TSwatches value={o.strokeWidth > 0 ? o.stroke : null} onChange={(stroke) => p.onUpdate({ stroke, strokeWidth: o.strokeWidth || 0.05 } as Partial<StudioObject>, true)} label="outline colour" />
          </>
        )}
        <TSep />
        <TTextures value={o.texture} onChange={(texture) => p.onUpdate({ texture })} />
        <TSep />
        <TTurn angle={o.rotation} onAngle={p.onTurn} what={`the ${o.shape}`} />
        {actions}
      </TrayRow>
    );
  }
  return (
    <TrayRow label="changing the pen line">
      {quick}
      <TSwatches value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="line colour" />
      <TSep />
      <TLabel>line</TLabel>
      <TDots values={[0.004, 0.008, 0.014, 0.024, 0.04]} value={o.width} onChange={(width) => p.onUpdate({ width } as Partial<StudioObject>)} label="line thickness" colour={o.colour} px={(v) => v * 600} />
      <TSep />
      <TTextures value={o.texture} onChange={(texture) => p.onUpdate({ texture })} />
      <TSep />
      <TTurn angle={o.rotation ?? 0} onAngle={p.onTurn} what="the pen line" />
      {actions}
    </TrayRow>
  );
}

/** Layers: every added thing as a chip (top first) and the drawing's lock — and, once one's picked,
 * its own row above. */
function LayersTray(p: TrayProps) {
  const d = p.drawing;
  const rows = [...p.objects].reverse();
  const editing = d?.selected ? (
    <TrayRow label={`changing ${p.baseLabel}`}>
      <TLabel>size</TLabel>
      <TIcon icon={IconMinus} label="smaller" onClick={() => d.onSize(Math.max(0.05, Math.round((d.place.scale - 0.1) * 100) / 100))} disabled={d.place.scale <= 0.05} />
      <span className="w-12 shrink-0 text-center font-display text-sm text-cocoa">{Math.round(d.place.scale * 100)}%</span>
      <TIcon icon={IconPlus} label="bigger" onClick={() => d.onSize(Math.min(3, Math.round((d.place.scale + 0.1) * 100) / 100))} disabled={d.place.scale >= 3} />
      <TSep />
      <TTurn angle={d.angle} onAngle={d.onTurn} what="your drawing" />
      <TSep />
      <TChip onClick={d.onReset}>
        <Icon icon={IconRestore} size={16} /> put it back
      </TChip>
      <TChip onClick={d.onToggleLock}>
        <Icon icon={IconLock} size={16} /> lock it
      </TChip>
    </TrayRow>
  ) : p.selected ? (
    <ItemEditor {...p} o={p.selected} />
  ) : null;
  return (
    <div className="flex flex-col gap-1.5">
      {editing}
      <TrayRow label="layers, top first">
        <TLabel>layers</TLabel>
        {rows.length === 0 ? <span className="shrink-0 px-1 text-[12px] font-bold text-ink-soft">nothing added yet — try add text, draw or shapes</span> : null}
        {rows.map((o) => {
          const on = o.id === p.selected?.id;
          return (
            <TChip key={o.id} on={on} onClick={() => p.onSelect(on ? null : o.id)} label={`layer: ${layerName(o)}`}>
              {o.type === 'shape' ? (
                <svg viewBox="-10 -10 120 120" className="h-4 w-4" aria-hidden>
                  <path d={SHAPE_PATHS[o.shape]} fill={o.fill} fillRule="evenodd" />
                </svg>
              ) : (
                <span style={{ color: on ? undefined : o.colour }}>
                  <Icon icon={o.type === 'text' ? IconTypography : IconPencil} size={15} />
                </span>
              )}
              <span className="max-w-[9rem] truncate">{layerName(o)}</span>
            </TChip>
          );
        })}
        {d ? (
          <>
            <TSep />
            <TChip
              on={d.unlocked && d.selected}
              onClick={() => (d.unlocked ? p.onSelect(d.selected ? null : '__drawing') : d.onToggleLock())}
              label={d.unlocked ? `${p.baseLabel} — tap to change it` : `unlock ${p.baseLabel} to move, size or turn it`}
            >
              <Icon icon={d.unlocked ? IconLockOpen : IconLock} size={15} /> {p.baseLabel}
            </TChip>
          </>
        ) : null}
      </TrayRow>
    </div>
  );
}
