'use client';

import { IconCopy, IconStackPop, IconStackPush, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { CARD_FONTS, cardFontCss, type CardFontToken } from '@/lib/card-fonts';
import { SHAPE_KINDS, SHAPE_PATHS, MAX_TEXT_LENGTH, type ShapeKind, type StudioObject } from '@/lib/studio-objects';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { ColourPicker } from './ColourPicker';
import type { ToolId } from './tools';

export interface PenStyle {
  colour: string;
  /** Line width as a fraction of the picture's shorter side. */
  width: number;
  /** 0–1: how much wobble is smoothed out. */
  smooth: number;
  stylusOnly: boolean;
}
export interface TextStyle {
  font: CardFontToken;
  colour: string;
}
export interface ShapeStyle {
  fill: string;
  outline: boolean;
}

const hint = (t: string) => <p className="text-xs text-ink-soft">{t}</p>;
const label = (t: string) => <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{t}</p>;

/** Options for the "adding things" tools: draw, add text, shapes, move & size. */
export function AddedOptions(p: {
  tool: ToolId;
  pen: PenStyle;
  setPen: (s: PenStyle) => void;
  textStyle: TextStyle;
  setTextStyle: (s: TextStyle) => void;
  shapeStyle: ShapeStyle;
  setShapeStyle: (s: ShapeStyle) => void;
  selected: StudioObject | null;
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

  if (tool === 'shapes') {
    return (
      <div className="flex flex-col gap-2.5">
        {hint('tap a shape to add it.')}
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="shapes">
          {SHAPE_KINDS.map((k) => (
            <button key={k} type="button" aria-label={`add a ${k}`} onClick={() => p.onAddShape(k)} className="press flex h-14 items-center justify-center rounded-xl border-2 border-cocoa/20 bg-paper hover:border-cocoa">
              <svg viewBox="-6 -6 112 112" className="h-9 w-9" aria-hidden>
                <path d={SHAPE_PATHS[k]} fill={p.shapeStyle.fill} fillRule="evenodd" stroke={p.shapeStyle.outline ? '#2b2118' : 'none'} strokeWidth={6} strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
        {label('colour')}
        <ColourPicker value={p.shapeStyle.fill} onChange={(fill) => p.setShapeStyle({ ...p.shapeStyle, fill })} label="shape colour" />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
          <span className="text-xs font-bold text-cocoa">dark outline</span>
          <Toggle on={p.shapeStyle.outline} onChange={(outline) => p.setShapeStyle({ ...p.shapeStyle, outline })} label="dark outline" />
        </div>
      </div>
    );
  }

  // text + move & size: edit what's selected
  if (!selected) {
    return tool === 'text' ? (
      <div className="flex flex-col gap-2.5">
        {hint('tap the picture where you’d like your words.')}
        {label('font')}
        <FontChips value={p.textStyle.font} onChange={(font) => p.setTextStyle({ ...p.textStyle, font })} />
        {label('colour')}
        <ColourPicker value={p.textStyle.colour} onChange={(colour) => p.setTextStyle({ ...p.textStyle, colour })} label="text colour" />
      </div>
    ) : (
      hint('tap anything you’ve added to move it, size it or change it.')
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

  if (selected.type === 'text') {
    return (
      <div className="flex flex-col gap-2.5">
        <TextEditor value={selected.text} onChange={(text) => p.onUpdate({ text }, true)} />
        {label('font')}
        <FontChips value={selected.font} onChange={(font) => p.onUpdate({ font })} />
        <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
          size
          <input type="range" min={2} max={40} value={Math.round(selected.size * 100)} onChange={(e) => p.onUpdate({ size: Number(e.target.value) / 100 }, true)} className="flex-1 accent-[var(--color-cta)]" aria-label="text size" />
        </label>
        {label('colour')}
        <ColourPicker value={selected.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="text colour" />
        {actions}
      </div>
    );
  }
  if (selected.type === 'shape') {
    return (
      <div className="flex flex-col gap-2.5">
        {label('colour')}
        <ColourPicker value={selected.fill} onChange={(fill) => p.onUpdate({ fill } as Partial<StudioObject>, true)} label="shape colour" />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
          <span className="text-xs font-bold text-cocoa">dark outline</span>
          <Toggle on={selected.outline} onChange={(outline) => p.onUpdate({ outline } as Partial<StudioObject>)} label="dark outline" />
        </div>
        {actions}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {label('line colour')}
      <ColourPicker value={selected.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="line colour" />
      <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
        thickness
        <input type="range" min={2} max={60} value={Math.round(selected.width * 1000)} onChange={(e) => p.onUpdate({ width: Number(e.target.value) / 1000 } as Partial<StudioObject>, true)} className="flex-1 accent-[var(--color-cta)]" aria-label="line thickness" />
      </label>
      {actions}
    </div>
  );
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
