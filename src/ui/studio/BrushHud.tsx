'use client';

import { useState } from 'react';
import { STANDARD_COLOURS } from './ColourPicker';

// the crayon-box colours a quick switch needs most (the full range is in the panel)
const QUICK = ['cocoa', 'red', 'orange', 'sunshine', 'green', 'sky', 'blue', 'pink', 'white'].map((n) => STANDARD_COLOURS.find((c) => c.name === n)!);

/**
 * The floating brush HUD (Studio spec §19a, docs/03 mobile pattern): on a phone, the brush's
 * colour and size stay a thumb away on the canvas — the full options are in the panel below.
 * Size steps through small / medium / big; colour opens a row of crayons.
 */
export function BrushHud({
  colour,
  onColour,
  sizes,
  size,
  onSize,
  what,
}: {
  /** null = a tool with no colour (the eraser): size only. */
  colour: string | null;
  onColour: (hex: string) => void;
  /** Three steps, small → big, and the dot size to show each at. */
  sizes: { value: number; dot: number; label: string }[];
  size: number;
  onSize: (v: number) => void;
  what: string;
}) {
  const [open, setOpen] = useState(false);
  // the nearest step to the current size, so the HUD reads right after a slider change
  const at = sizes.reduce((best, s, i) => (Math.abs(s.value - size) < Math.abs(sizes[best]!.value - size) ? i : best), 0);
  const step = sizes[at]!;
  const next = sizes[(at + 1) % sizes.length]!;
  return (
    <div className="absolute bottom-[5.5rem] right-2.5 z-10 flex items-center gap-2 md:hidden">
      {open && colour ? (
        <div role="group" aria-label={`${what} colour`} className="pop-in flex max-w-[calc(100vw-6rem)] gap-1 overflow-x-auto rounded-pill border-2 border-cocoa/15 bg-paper p-1 shadow-[0_3px_0_var(--color-line)]">
          {QUICK.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.name}
              aria-pressed={c.hex === colour}
              onClick={() => {
                onColour(c.hex);
                setOpen(false);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <span aria-hidden className={`h-8 w-8 rounded-full border-2 ${c.hex === colour ? 'border-cocoa' : 'border-cocoa/20'}`} style={{ background: c.hex }} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-1 rounded-pill border-2 border-cocoa/15 bg-paper p-1 shadow-[0_3px_0_var(--color-line)]">
        {colour ? (
          <button type="button" aria-label={`${what} colour — tap for crayons`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="press flex h-11 w-11 items-center justify-center rounded-full">
            <span aria-hidden className="h-7 w-7 rounded-full border-2 border-paper shadow-[0_0_0_1.5px_var(--color-line)]" style={{ background: colour }} />
          </button>
        ) : null}
        <button type="button" aria-label={`${what} size: ${step.label} — tap for ${next.label}`} onClick={() => onSize(next.value)} className="press flex h-11 w-11 items-center justify-center rounded-full">
          <span aria-hidden className="rounded-full bg-cocoa" style={{ width: step.dot, height: step.dot, background: colour ?? undefined }} />
        </button>
      </div>
    </div>
  );
}
