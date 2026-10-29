'use client';

import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * The BRAND select (Scrapbook look — an ink-outlined pill, a paper card of options): a real listbox,
 * never the browser's native-looking default. Each option can carry a quiet note on its right
 * ("15% off"). Keyboard: Enter / Space / ↓ open it; ↑ ↓ Home End move; Enter / Space choose; Esc
 * closes and hands focus back. Every option is a ≥ 44 px row. No hover-only behaviour.
 */
export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** a quiet note on the right of the option (and of the closed select) */
  note?: string;
  /** colour the note as a saving */
  saving?: boolean;
}

export function Select<T extends string | number>({
  label, value, options, onChange, className = '', hideLabel = false,
}: {
  /** what it chooses — the accessible name (shown above it unless hideLabel) */
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (v: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    setOpen(false);
    button.current?.focus();
    if (o && o.value !== value) onChange(o.value);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <span id={`${id}-label`} className={hideLabel ? 'sr-only' : 'mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-soft'}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
        className="press flex min-h-11 w-full items-center gap-2 rounded-pill border-2 border-cocoa bg-paper pl-4 pr-3 text-left text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] focus-visible:outline-2"
      >
        <span id={`${id}-value`} className="flex flex-1 items-baseline justify-between gap-3">
          <span>{current?.label}</span>
          {current?.note ? <span className={`text-xs ${current.saving ? 'text-green-save' : 'text-ink-soft'}`}>{current.note}</span> : null}
        </span>
        <Icon icon={IconChevronDown} size={16} className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-o${active}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(options.length - 1, a + 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
            else if (e.key === 'Home') setActive(0);
            else if (e.key === 'End') setActive(options.length - 1);
            else if (e.key === 'Enter' || e.key === ' ') choose(active);
            else if (e.key === 'Escape') {
              setOpen(false);
              button.current?.focus();
            } else if (e.key === 'Tab') setOpen(false);
            else return;
            if (e.key !== 'Tab') e.preventDefault();
          }}
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-72 overflow-y-auto rounded-[14px] border-2 border-cocoa bg-paper py-1 shadow-[0_4px_0_var(--color-cocoa)] focus:outline-none"
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-o${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              onClick={() => choose(i)}
              onPointerMove={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-bold text-cocoa ${i === active ? 'bg-honey-band' : ''} ${o.value === value ? 'font-extrabold' : ''}`}
            >
              <span>{o.label}</span>
              {o.note ? <span className={`text-xs font-extrabold ${o.saving ? 'text-green-save' : 'text-ink-soft'}`}>{o.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
