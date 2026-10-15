'use client';

import { IconCopy, IconLock, IconPencil, IconStackPop, IconStackPush, IconTrash, IconTypography } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { CARD_FONTS, cardFontCss, type CardFontToken } from '@/lib/card-fonts';
import { SHAPE_KINDS, SHAPE_PATHS, MAX_SHAPE_STROKE, MAX_TEXT_LENGTH, type ShapeKind, type StudioObject } from '@/lib/studio-objects';
import { TEXTURES, type TextureKind } from '@/lib/textures';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { ColourPicker } from './ColourPicker';
import { drawStroke, drawTextured } from './objects-canvas';
import type { ToolId } from './tools';

export interface PenStyle {
  colour: string;
  /** Line width as a fraction of the picture's shorter side. */
  width: number;
  /** 0–1: how much wobble is smoothed out. */
  smooth: number;
  stylusOnly: boolean;
  texture: TextureKind;
}
export interface TextStyle {
  font: CardFontToken;
  colour: string;
  texture: TextureKind;
}
export interface ShapeStyle {
  fill: string;
  stroke: string;
  /** Outline thickness as a fraction of the shape's size (0 = no outline). */
  strokeWidth: number;
  texture: TextureKind;
}

const hint = (t: string) => <p className="text-xs text-ink-soft">{t}</p>;
const label = (t: string) => <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{t}</p>;

/** Options for the "adding things" tools: draw, add text, shapes, layers. */
export function AddedOptions(p: {
  tool: ToolId;
  pen: PenStyle;
  setPen: (s: PenStyle) => void;
  textStyle: TextStyle;
  setTextStyle: (s: TextStyle) => void;
  shapeStyle: ShapeStyle;
  setShapeStyle: (s: ShapeStyle) => void;
  objects: StudioObject[];
  selected: StudioObject | null;
  /** What the base layer is called: "your drawing", or "your canvas" when designing from scratch. */
  baseLabel: string;
  onSelect: (id: string | null) => void;
  onUpdate: (patch: Partial<StudioObject>, group?: boolean) => void;
  onAddShape: (k: ShapeKind) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBack: () => void;
}) {
  const { tool, selected } = p;

  if (tool === 'draw') {
    return (
      <div className="flex flex-col gap-2.5">
        {hint('draw with a finger, mouse or stylus.')}
        <ColourPicker value={p.pen.colour} onChange={(colour) => p.setPen({ ...p.pen, colour })} label="pen colour" />
        <TextureChips value={p.pen.texture} colour={p.pen.colour} onChange={(texture) => p.setPen({ ...p.pen, texture })} />
        <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
          thickness
          <input type="range" min={2} max={60} value={Math.round(p.pen.width * 1000)} onChange={(e) => p.setPen({ ...p.pen, width: Number(e.target.value) / 1000 })} className="flex-1 accent-[var(--color-cta)]" aria-label="line thickness" />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
          smoothing
          <input type="range" min={0} max={100} value={Math.round(p.pen.smooth * 100)} onChange={(e) => p.setPen({ ...p.pen, smooth: Number(e.target.value) / 100 })} className="flex-1 accent-[var(--color-cta)]" aria-label="smooth out wobbles" />
        </label>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
          <span className="text-xs text-cocoa">
            <b>stylus only</b>
            <span className="block text-[11px] text-ink-soft">fingers move the picture; only the pen draws</span>
          </span>
          <Toggle on={p.pen.stylusOnly} onChange={(stylusOnly) => p.setPen({ ...p.pen, stylusOnly })} label="stylus only" />
        </div>
      </div>
    );
  }

  const actions = (
    <div className="flex flex-wrap gap-1.5">
      <ActionButton icon={IconCopy} label="duplicate" onClick={p.onDuplicate} />
      <ActionButton icon={IconStackPop} label="bring forward" onClick={p.onForward} />
      <ActionButton icon={IconStackPush} label="send back" onClick={p.onBack} />
      <ActionButton icon={IconTrash} label="delete" onClick={p.onDelete} danger />
    </div>
  );

  // the editor for whatever's selected
  const editor = (o: StudioObject) => {
    if (o.type === 'text') {
      return (
        <div className="flex flex-col gap-2.5">
          <TextEditor key={o.id} value={o.text} onChange={(text) => p.onUpdate({ text }, true)} />
          {label('font')}
          <FontChips value={o.font} onChange={(font) => p.onUpdate({ font })} />
          <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
            size
            <input type="range" min={2} max={40} value={Math.round(o.size * 100)} onChange={(e) => p.onUpdate({ size: Number(e.target.value) / 100 }, true)} className="flex-1 accent-[var(--color-cta)]" aria-label="text size" />
          </label>
          {label('colour')}
          <ColourPicker value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="text colour" />
          <TextureChips value={o.texture} colour={o.colour} onChange={(texture) => p.onUpdate({ texture })} />
          {actions}
        </div>
      );
    }
    if (o.type === 'shape') {
      return (
        <div className="flex flex-col gap-2.5">
          <ShapeStyleControls
            style={{ fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, texture: o.texture }}
            onChange={(patch, group) => p.onUpdate(patch as Partial<StudioObject>, group)}
          />
          {actions}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2.5">
        {label('line colour')}
        <ColourPicker value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="line colour" />
        <TextureChips value={o.texture} colour={o.colour} onChange={(texture) => p.onUpdate({ texture })} />
        <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
          thickness
          <input type="range" min={2} max={60} value={Math.round(o.width * 1000)} onChange={(e) => p.onUpdate({ width: Number(e.target.value) / 1000 } as Partial<StudioObject>, true)} className="flex-1 accent-[var(--color-cta)]" aria-label="line thickness" />
        </label>
        {actions}
      </div>
    );
  };

  if (tool === 'select') {
    return (
      <div className="flex flex-col gap-3">
        <LayersList objects={p.objects} selectedId={selected?.id ?? null} baseLabel={p.baseLabel} onSelect={p.onSelect} />
        {selected ? (
          <div className="flex flex-col gap-2.5 border-t-2 border-dashed border-cocoa/15 pt-3">
            {label(`editing · ${layerName(selected)}`)}
            {editor(selected)}
          </div>
        ) : (
          hint(p.objects.length ? 'tap a layer — here or on the picture — to move it, size it or change it.' : 'nothing added yet — try draw, add text or shapes.')
        )}
      </div>
    );
  }

  if (tool === 'shapes') {
    if (selected?.type === 'shape') return editor(selected);
    return (
      <div className="flex flex-col gap-2.5">
        {hint('tap a shape to add it.')}
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="shapes">
          {SHAPE_KINDS.map((k) => (
            <button key={k} type="button" aria-label={`add a ${k}`} onClick={() => p.onAddShape(k)} className="press flex h-14 items-center justify-center rounded-xl border-2 border-cocoa/20 bg-paper hover:border-cocoa">
              <svg viewBox="-12 -12 124 124" className="h-9 w-9" aria-hidden>
                <path d={SHAPE_PATHS[k]} fill={p.shapeStyle.fill} fillRule="evenodd" stroke={p.shapeStyle.strokeWidth > 0 ? p.shapeStyle.stroke : 'none'} strokeWidth={Math.max(3, p.shapeStyle.strokeWidth * 100)} strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
        <ShapeStyleControls style={p.shapeStyle} onChange={(patch) => p.setShapeStyle({ ...p.shapeStyle, ...patch })} />
      </div>
    );
  }

  // add text
  if (selected?.type === 'text') return editor(selected);
  return (
    <div className="flex flex-col gap-2.5">
      {hint('tap the picture where you’d like your words — or tap words you’ve added to change them.')}
      {label('font')}
      <FontChips value={p.textStyle.font} onChange={(font) => p.setTextStyle({ ...p.textStyle, font })} />
      {label('colour')}
      <ColourPicker value={p.textStyle.colour} onChange={(colour) => p.setTextStyle({ ...p.textStyle, colour })} label="text colour" />
      <TextureChips value={p.textStyle.texture} colour={p.textStyle.colour} onChange={(texture) => p.setTextStyle({ ...p.textStyle, texture })} />
    </div>
  );
}

/** Fill, outline (colour + thickness) and texture — for new shapes and the selected one. */
function ShapeStyleControls({ style, onChange }: { style: ShapeStyle; onChange: (patch: Partial<ShapeStyle>, group?: boolean) => void }) {
  return (
    <>
      {label('fill')}
      <ColourPicker value={style.fill} onChange={(fill) => onChange({ fill }, true)} label="fill colour" />
      {label('outline')}
      <ColourPicker value={style.stroke} onChange={(stroke) => onChange({ stroke, strokeWidth: style.strokeWidth || 0.05 }, true)} label="outline colour" />
      <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
        thickness
        <input
          type="range"
          min={0}
          max={Math.round(MAX_SHAPE_STROKE * 100)}
          value={Math.round(style.strokeWidth * 100)}
          onChange={(e) => onChange({ strokeWidth: Number(e.target.value) / 100 }, true)}
          className="flex-1 accent-[var(--color-cta)]"
          aria-label="outline thickness"
          aria-valuetext={style.strokeWidth === 0 ? 'no outline' : `${Math.round(style.strokeWidth * 100)}`}
        />
        <span className="w-12 text-right text-[11px] font-normal text-ink-soft">{style.strokeWidth === 0 ? 'none' : ''}</span>
      </label>
      <TextureChips value={style.texture} colour={style.fill} onChange={(texture) => onChange({ texture })} />
    </>
  );
}

export const layerName = (o: StudioObject) =>
  o.type === 'text' ? `“${o.text.split('\n')[0]!.slice(0, 22)}${o.text.length > 22 ? '…' : ''}”` : o.type === 'shape' ? o.shape : 'pen line';

/** Every added thing as its own layer, top first; the drawing itself is the locked bottom layer. */
function LayersList({ objects, selectedId, baseLabel, onSelect }: { objects: StudioObject[]; selectedId: string | null; baseLabel: string; onSelect: (id: string | null) => void }) {
  const rows = [...objects].reverse();
  return (
    <div>
      {label('layers · top first')}
      <ul className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label="layers">
        {rows.map((o) => {
          const on = o.id === selectedId;
          return (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : o.id)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl border-2 px-2.5 text-left text-xs font-bold ${on ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/15 bg-paper text-cocoa hover:border-cocoa/50'}`}
              >
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cocoa/20 bg-paper-2">
                  {o.type === 'shape' ? (
                    <svg viewBox="-10 -10 120 120" className="h-5 w-5">
                      <path d={SHAPE_PATHS[o.shape]} fill={o.fill} fillRule="evenodd" stroke={o.strokeWidth > 0 ? o.stroke : 'none'} strokeWidth={Math.max(4, o.strokeWidth * 100)} />
                    </svg>
                  ) : (
                    <span style={{ color: o.colour }}>
                      <Icon icon={o.type === 'text' ? IconTypography : IconPencil} size={15} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{layerName(o)}</span>
                {o.texture !== 'smooth' ? <span className="shrink-0 text-[11px] font-normal text-ink-faint">{o.texture}</span> : null}
              </button>
            </li>
          );
        })}
        <li className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-dashed border-cocoa/15 px-2.5 text-xs font-bold text-ink-soft">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-paper-2">
            <Icon icon={IconLock} size={14} />
          </span>
          {baseLabel}
        </li>
      </ul>
    </div>
  );
}

function TextureChips({ value, colour, onChange }: { value: TextureKind; colour: string; onChange: (t: TextureKind) => void }) {
  return (
    <div>
      {label('texture')}
      <div className="mt-1.5 grid grid-cols-4 gap-1.5" role="group" aria-label="texture">
        {TEXTURES.map((t) => (
          <button
            key={t.kind}
            type="button"
            aria-pressed={value === t.kind}
            onClick={() => onChange(t.kind)}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1 text-[11px] font-extrabold ${value === t.kind ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 bg-paper text-cocoa hover:border-cocoa'}`}
          >
            <TextureSwatch kind={t.kind} colour={colour} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A little textured squiggle, drawn with the same code as the canvas. */
function TextureSwatch({ kind, colour }: { kind: TextureKind; colour: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 56, H = 18;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const points: number[] = [];
    for (let i = 0; i <= 24; i++) points.push((4 + i * 2) / W, (9 + Math.sin(i / 3.2) * 4.5) / H, 0.5);
    const f = { gw: W, gh: H };
    drawTextured(ctx, { texture: kind, draw: (x) => drawStroke(x, { colour, width: 7 / H, points }, f) }, { gw: 260, gh: 260 }, new DOMMatrix().scale(dpr), { x: 0, y: 0, w: W, h: H });
  }, [kind, colour]);
  return <canvas ref={ref} aria-hidden style={{ width: 56, height: 18 }} />;
}

function FontChips({ value, onChange }: { value: CardFontToken; onChange: (f: CardFontToken) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="font">
      {CARD_FONTS.map((f) => (
        <button
          key={f.token}
          type="button"
          aria-pressed={value === f.token}
          onClick={() => onChange(f.token)}
          className={`min-h-11 rounded-pill border-2 px-3.5 text-[17px] ${value === f.token ? 'border-cocoa bg-cocoa text-paper' : 'border-cocoa/20 bg-paper text-cocoa hover:border-cocoa'}`}
          style={{ fontFamily: cardFontCss(f.token) }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function TextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // a fresh text box: select the placeholder so typing replaces it
    if (ref.current && value === 'your words') {
      ref.current.focus({ preventScroll: true });
      ref.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">your words</span>
      <textarea
        ref={ref}
        value={value}
        maxLength={MAX_TEXT_LENGTH}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[15px] text-cocoa"
      />
    </label>
  );
}

function ActionButton({ icon, label: text, onClick, danger }: { icon: typeof IconCopy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex min-h-11 items-center gap-1.5 rounded-pill border-2 px-3 text-xs font-extrabold ${danger ? 'border-berry bg-paper text-cinnamon' : 'border-cocoa/25 bg-paper text-cocoa hover:border-cocoa'}`}
    >
      <Icon icon={icon} size={15} /> {text}
    </button>
  );
}

