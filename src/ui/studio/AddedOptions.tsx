'use client';

import { IconCopy, IconLock, IconLockOpen, IconPencil, IconRestore, IconStackPop, IconStackPush, IconTrash, IconTypography } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { CARD_FONTS, cardFontCss, type CardFontToken } from '@/lib/card-fonts';
import { SHAPE_KINDS, SHAPE_PATHS, MAX_SHAPE_STROKE, MAX_TEXT_LENGTH, type ShapeKind, type StudioObject } from '@/lib/studio-objects';
import { TEXTURES, type TextureKind } from '@/lib/textures';
import type { Placement } from '@/lib/studio-geometry';
import { Icon } from '@/ui/primitives/Icon';
import { ColourPicker } from './ColourPicker';
import { drawStroke, drawTextured } from './objects-canvas';
import { Section, Segmented, SizeDot, SliderRow, Stack, ToggleRow } from './panel';
import { AngleControl } from './AngleControl';
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
/** The drawing itself as a layer: locked by default; unlocked, it moves / sizes / turns. */
export interface DrawingLayer {
  unlocked: boolean;
  selected: boolean;
  place: Placement;
  onToggleLock: () => void;
  onSize: (scale: number) => void;
  onReset: () => void;
  /** Its tilt as seen, and turning it there. */
  angle: number;
  onTurn: (deg: number, group?: boolean) => void;
}
export interface ShapeStyle {
  fill: string;
  stroke: string;
  /** Outline thickness as a fraction of the shape's size (0 = no outline). */
  strokeWidth: number;
  texture: TextureKind;
}


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
  /** The drawing layer's lock + controls (null on a blank canvas — nothing to move). */
  drawing: DrawingLayer | null;
  onSelect: (id: string | null) => void;
  /** Turn what's selected to an exact angle (pen lines turn about their middle). */
  onTurn: (deg: number, group?: boolean) => void;
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
      <Stack>
        <Section label="colour">
          <ColourPicker value={p.pen.colour} onChange={(colour) => p.setPen({ ...p.pen, colour })} label="pen colour" />
        </Section>
        <Section label="line">
          <SliderRow label="thickness" min={2} max={60} value={Math.round(p.pen.width * 1000)} onChange={(v) => p.setPen({ ...p.pen, width: v / 1000 })} ariaLabel="line thickness" display={<SizeDot px={p.pen.width * 600} colour={p.pen.colour} />} />
          <SliderRow label="smoothing" min={0} max={100} value={Math.round(p.pen.smooth * 100)} onChange={(v) => p.setPen({ ...p.pen, smooth: v / 100 })} ariaLabel="smooth out wobbles" display={p.pen.smooth < 0.2 ? 'off' : p.pen.smooth > 0.7 ? 'lots' : 'some'} />
        </Section>
        <TextureSection value={p.pen.texture} colour={p.pen.colour} onChange={(texture) => p.setPen({ ...p.pen, texture })} />
        <Section>
          <ToggleRow title="stylus only" note="fingers move the picture; only the pen draws" on={p.pen.stylusOnly} onChange={(stylusOnly) => p.setPen({ ...p.pen, stylusOnly })} />
        </Section>
      </Stack>
    );
  }

  const actions = (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="this layer">
      <ActionButton icon={IconCopy} label="duplicate" onClick={p.onDuplicate} />
      <ActionButton icon={IconStackPop} label="forward" onClick={p.onForward} />
      <ActionButton icon={IconStackPush} label="back" onClick={p.onBack} />
      <ActionButton icon={IconTrash} label="delete" onClick={p.onDelete} danger />
    </div>
  );

  // the editor for whatever's selected: its actions first, then its look
  const editor = (o: StudioObject) => {
    if (o.type === 'text') {
      return (
        <Stack>
          <Section>{actions}</Section>
          <Section label="your words">
            <TextEditor key={o.id} value={o.text} onChange={(text) => p.onUpdate({ text }, true)} />
          </Section>
          <Section label="font">
            <FontChips value={o.font} onChange={(font) => p.onUpdate({ font })} />
            <SliderRow label="size" min={2} max={40} value={Math.round(o.size * 100)} onChange={(v) => p.onUpdate({ size: v / 100 }, true)} ariaLabel="text size" display={<span style={{ fontFamily: cardFontCss(o.font), fontSize: Math.max(11, Math.min(24, o.size * 110)) }}>Aa</span>} />
          </Section>
          <Section label="colour">
            <ColourPicker value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="text colour" />
          </Section>
          <TextureSection value={o.texture} colour={o.colour} onChange={(texture) => p.onUpdate({ texture })} />
          <AngleControl angle={o.rotation} onAngle={p.onTurn} what="the words" />
        </Stack>
      );
    }
    if (o.type === 'shape') {
      return (
        <Stack>
          <Section>{actions}</Section>
          <ShapeStyleControls style={{ fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, texture: o.texture }} onChange={(patch, group) => p.onUpdate(patch as Partial<StudioObject>, group)} />
          <AngleControl angle={o.rotation} onAngle={p.onTurn} what={`the ${o.shape}`} />
        </Stack>
      );
    }
    return (
      <Stack>
        <Section>{actions}</Section>
        <Section label="colour">
          <ColourPicker value={o.colour} onChange={(colour) => p.onUpdate({ colour }, true)} label="line colour" />
        </Section>
        <Section label="line">
          <SliderRow label="thickness" min={2} max={60} value={Math.round(o.width * 1000)} onChange={(v) => p.onUpdate({ width: v / 1000 } as Partial<StudioObject>, true)} ariaLabel="line thickness" display={<SizeDot px={o.width * 600} colour={o.colour} />} />
        </Section>
        <TextureSection value={o.texture} colour={o.colour} onChange={(texture) => p.onUpdate({ texture })} />
        <AngleControl angle={o.rotation ?? 0} onAngle={p.onTurn} what="the pen line" />
      </Stack>
    );
  };

  if (tool === 'select') {
    const d = p.drawing;
    return (
      <Stack>
        <Section label="layers · top first">
          <LayersList objects={p.objects} selectedId={d?.selected ? '__drawing' : selected?.id ?? null} baseLabel={p.baseLabel} drawing={d} onSelect={p.onSelect} />
          {!selected && !d?.selected ? <p className="text-xs text-ink-soft">{p.objects.length ? 'tap a layer — here or on the picture — to move it, size it or change it.' : 'nothing added yet — try add text, draw or shapes.'}</p> : null}
        </Section>
        {d?.selected ? (
          <Section
            label={`editing · ${p.baseLabel}`}
            aside={
              <button type="button" onClick={() => p.onSelect(null)} className="min-h-8 px-1 text-[11px] font-bold text-cinnamon">
                done
              </button>
            }
          >
            <p className="text-xs text-ink-soft">drag it to move, the yellow corner to size, the blue dot to turn — it clicks into place at every 45°.</p>
            <SliderRow
              label="size"
              min={5}
              max={300}
              value={Math.round(d.place.scale * 100)}
              onChange={(v) => d.onSize(v / 100)}
              ariaLabel="drawing size"
              display={`${Math.round(d.place.scale * 100)}%`}
            />
            <AngleControl angle={d.angle} onAngle={d.onTurn} what="your drawing" label="its angle" />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={IconRestore} label="put it back" onClick={d.onReset} />
              <ActionButton icon={IconLock} label="lock it" onClick={d.onToggleLock} />
            </div>
          </Section>
        ) : null}
        {selected ? (
          <Section
            label={`editing · ${layerName(selected)}`}
            aside={
              <button type="button" onClick={() => p.onSelect(null)} className="min-h-8 px-1 text-[11px] font-bold text-cinnamon">
                done
              </button>
            }
          >
            {editor(selected)}
          </Section>
        ) : null}
      </Stack>
    );
  }

  if (tool === 'shapes') {
    if (selected?.type === 'shape') return editor(selected);
    return (
      <Stack>
        <Section label="add a shape">
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="shapes">
            {SHAPE_KINDS.map((k) => (
              <button key={k} type="button" aria-label={`add a ${k}`} onClick={() => p.onAddShape(k)} className="press flex h-14 items-center justify-center rounded-xl border-2 border-cocoa/20 bg-paper hover:border-cocoa">
                <svg viewBox="-12 -12 124 124" className="h-9 w-9" aria-hidden>
                  <path d={SHAPE_PATHS[k]} fill={p.shapeStyle.fill} fillRule="evenodd" stroke={p.shapeStyle.strokeWidth > 0 ? p.shapeStyle.stroke : 'none'} strokeWidth={Math.max(3, p.shapeStyle.strokeWidth * 100)} strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        </Section>
        <ShapeStyleControls style={p.shapeStyle} onChange={(patch) => p.setShapeStyle({ ...p.shapeStyle, ...patch })} />
      </Stack>
    );
  }

  // add text
  if (selected?.type === 'text') return editor(selected);
  return (
    <Stack>
      <Section label="font">
        <FontChips value={p.textStyle.font} onChange={(font) => p.setTextStyle({ ...p.textStyle, font })} />
      </Section>
      <Section label="colour">
        <ColourPicker value={p.textStyle.colour} onChange={(colour) => p.setTextStyle({ ...p.textStyle, colour })} label="text colour" />
      </Section>
      <TextureSection value={p.textStyle.texture} colour={p.textStyle.colour} onChange={(texture) => p.setTextStyle({ ...p.textStyle, texture })} />
    </Stack>
  );
}

/**
 * Fill and outline share ONE palette — a switch picks which one it paints — so a shape's options
 * stay short; outline thickness (0 = none) and texture follow.
 */
function ShapeStyleControls({ style, onChange }: { style: ShapeStyle; onChange: (patch: Partial<ShapeStyle>, group?: boolean) => void }) {
  const [part, setPart] = useState<'fill' | 'outline'>('fill');
  const dot = (c: string, ring = false) => (
    <span aria-hidden className={`inline-block h-3.5 w-3.5 rounded-full ${ring ? 'border-[3px]' : 'border border-cocoa/30'}`} style={ring ? { borderColor: c, background: '#fffbf2' } : { background: c, boxShadow: '0 0 0 1.5px #fffbf2' }} />
  );
  return (
    <>
      <Section label="colour">
        <Segmented
          label="which colour"
          value={part}
          onChange={setPart}
          options={[
            { value: 'fill', label: <>{dot(style.fill)} fill</> },
            { value: 'outline', label: <>{dot(style.strokeWidth > 0 ? style.stroke : '#d9c7a9', true)} outline</> },
          ]}
        />
        {part === 'fill' ? (
          <ColourPicker value={style.fill} onChange={(fill) => onChange({ fill }, true)} label="fill colour" />
        ) : (
          <ColourPicker value={style.strokeWidth > 0 ? style.stroke : null} onChange={(stroke) => onChange({ stroke, strokeWidth: style.strokeWidth || 0.05 }, true)} label="outline colour" />
        )}
      </Section>
      <Section label="outline">
        <SliderRow
          label="thickness"
          min={0}
          max={Math.round(MAX_SHAPE_STROKE * 100)}
          value={Math.round(style.strokeWidth * 100)}
          onChange={(v) => onChange({ strokeWidth: v / 100 }, true)}
          ariaLabel="outline thickness"
          valueText={style.strokeWidth === 0 ? 'no outline' : String(Math.round(style.strokeWidth * 100))}
          display={style.strokeWidth === 0 ? 'none' : <SizeDot px={style.strokeWidth * 120} colour={style.stroke} />}
        />
      </Section>
      <TextureSection value={style.texture} colour={style.fill} onChange={(texture) => onChange({ texture })} />
    </>
  );
}

const TextureSection = (p: { value: TextureKind; colour: string; onChange: (t: TextureKind) => void }) => (
  <Section label="texture">
    <TextureChips {...p} />
  </Section>
);

export const layerName = (o: StudioObject) =>
  o.type === 'text' ? `“${o.text.split('\n')[0]!.slice(0, 22)}${o.text.length > 22 ? '…' : ''}”` : o.type === 'shape' ? o.shape : 'pen line';

/** Every added thing as its own layer, top first; the drawing itself is the locked bottom layer. */
function LayersList({
  objects,
  selectedId,
  baseLabel,
  drawing,
  onSelect,
}: {
  objects: StudioObject[];
  selectedId: string | null;
  baseLabel: string;
  drawing: DrawingLayer | null;
  onSelect: (id: string | null) => void;
}) {
  const rows = [...objects].reverse();
  return (
    <div>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label="layers">
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
        <li className="flex items-center gap-1.5">
          {drawing?.unlocked ? (
            <button
              type="button"
              aria-pressed={drawing.selected}
              onClick={() => onSelect(drawing.selected ? null : '__drawing')}
              className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-2.5 text-left text-xs font-bold ${drawing.selected ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/15 bg-paper text-cocoa hover:border-cocoa/50'}`}
            >
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg border border-cocoa/20 bg-paper-2">
                <Icon icon={IconLockOpen} size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate">{baseLabel}</span>
            </button>
          ) : (
            <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 border-dashed border-cocoa/15 px-2.5 text-xs font-bold text-ink-soft">
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-paper-2">
                <Icon icon={IconLock} size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate">{baseLabel}</span>
            </span>
          )}
          {drawing ? (
            <button
              type="button"
              onClick={drawing.onToggleLock}
              aria-pressed={drawing.unlocked}
              aria-label={drawing.unlocked ? `lock ${baseLabel}` : `unlock ${baseLabel} to move, size or turn it`}
              title={drawing.unlocked ? 'lock it' : 'unlock to move, size or turn it'}
              className="press flex h-11 shrink-0 items-center gap-1 rounded-xl border-2 border-cocoa/20 bg-paper px-2.5 text-[11px] font-extrabold text-cocoa hover:border-cocoa"
            >
              <Icon icon={drawing.unlocked ? IconLock : IconLockOpen} size={14} /> {drawing.unlocked ? 'lock' : 'unlock'}
            </button>
          ) : null}
        </li>
      </ul>
    </div>
  );
}

function TextureChips({ value, colour, onChange }: { value: TextureKind; colour: string; onChange: (t: TextureKind) => void }) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="texture">
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
  return (
    <label className="block">
      <span className="sr-only">your words</span>
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
      className={`press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[12px] border-2 px-1 text-[11px] font-extrabold ${danger ? 'border-berry bg-paper text-cinnamon' : 'border-cocoa/20 bg-paper text-cocoa hover:border-cocoa'}`}
    >
      <Icon icon={icon} size={16} /> {text}
    </button>
  );
}

