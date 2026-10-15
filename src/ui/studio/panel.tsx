'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import type { ToolDef } from './tools';

/**
 * The Studio's options panel kit — one look for every tool: a header (what this tool does, in a
 * line), then labelled sections in a steady rhythm, with sliders and switches that all read the
 * same way. Phone: the strip above the toolbar. Desktop: the right-hand panel.
 */

export function PanelHeader({ tool, hint }: { tool: Pick<ToolDef, 'label' | 'icon'>; hint?: ReactNode }) {
  return (
    <header className="flex items-start gap-2.5">
      <span aria-hidden className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-cocoa text-paper shadow-[0_2px_0_var(--color-honey)] md:flex">
        <Icon icon={tool.icon} size={18} />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-[17px] leading-tight text-cocoa">{tool.label}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-snug text-ink-soft">{hint}</p> : null}
      </div>
    </header>
  );
}

export function Section({ label, aside, children }: { label?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {label || aside ? (
        <div className="flex min-h-5 items-center justify-between gap-2">
          {label ? <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</h3> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A panel body: sections spaced evenly, with a soft rule between them. */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 [&>section+section]:border-t [&>section+section]:border-dashed [&>section+section]:border-cocoa/15 [&>section+section]:pt-4">{children}</div>;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  display,
  ariaLabel,
  valueText,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** What's shown at the end of the row — a number, a word, a little preview. */
  display?: ReactNode;
  ariaLabel?: string;
  valueText?: string;
}) {
  return (
    <label className="grid grid-cols-[76px_1fr_40px] items-center gap-2 text-xs font-bold text-cocoa">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[var(--color-cta)]"
        aria-label={ariaLabel ?? label}
        aria-valuetext={valueText}
      />
      <span className="flex justify-end text-[11px] font-semibold text-ink-soft">{display}</span>
    </label>
  );
}

export function ToggleRow({ title, note, on, onChange }: { title: string; note?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
      <span className="text-xs text-cocoa">
        <b>{title}</b>
        {note ? <span className="block text-[11px] text-ink-soft">{note}</span> : null}
      </span>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

/** Two-to-four way switch (fill | outline, and the like). */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[14px] border-2 border-cocoa/15 bg-paper-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] px-2 text-xs font-extrabold ${value === o.value ? 'bg-cocoa text-paper shadow-[0_2px_0_var(--color-honey)]' : 'text-cocoa hover:bg-paper'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A dot showing a line's thickness / a brush's size. */
export const SizeDot = ({ px, colour = 'var(--color-cocoa)' }: { px: number; colour?: string }) => (
  <span aria-hidden className="inline-block rounded-full" style={{ width: Math.max(4, Math.min(28, px)), height: Math.max(4, Math.min(28, px)), background: colour }} />
);
