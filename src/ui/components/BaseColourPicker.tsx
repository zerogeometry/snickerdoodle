'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { ColourWheel } from '@/ui/primitives/ColourWheel';
import { Modal } from '@/ui/primitives/Modal';
import { colourName, groundHex, isColouredGround, PATTERN_GROUND_WHITE } from '@/lib/patterns';

/**
 * The BASE COLOUR picker (edge-to-edge products, cards and card packs): an ink-outlined pill showing
 * the colour + its friendly name, a "back to white" link, a one-line hint, and the full colour wheel
 * in a bottom sheet. ONE component for the customize page and the card-pack builder, so the look and
 * the copy never drift. The wheel's colour is only USED on 'use this colour', so dragging round the
 * wheel doesn't re-render the product on every step. `children` sits under the hint (the customize
 * page's "lift it off the paper" nudge).
 */
export function BaseColourPicker({
  title,
  noun,
  pattern = false,
  value,
  onChange,
  className = 'mt-5',
  children,
}: {
  /** The section heading + sheet title ("background colour", "sock colour"). */
  title: string;
  /** What the colour colours, in the shopper's words ("cushion", "card front"). */
  noun: string;
  /** A repeat-pattern product: the drawing repeats on the colour. */
  pattern?: boolean;
  /** The current colour (#rrggbb; white = none). */
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(PATTERN_GROUND_WHITE);
  const word = colourName(value);
  return (
    <div className={className}>
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">{title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setDraft(groundHex(value)); setOpen(true); }}
          aria-haspopup="dialog"
          className="press flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-pill border-2 border-cocoa bg-paper py-1 pl-1 pr-4 text-left shadow-[0_2px_0_var(--color-cocoa)]"
        >
          <span aria-hidden className="h-9 w-9 shrink-0 rounded-full border-2 border-cocoa/45" style={{ background: groundHex(value) }} />
          {/* named by what it shows (+ what it's for, for a screen reader): "sock colour: white — change it" */}
          <span className="truncate text-sm font-bold text-cocoa">
            <span className="sr-only">{title}: </span>
            {word}
            <span className="sr-only"> —</span>
          </span>
          <span aria-hidden className="ml-auto h-6 w-6 shrink-0 rounded-full border-2 border-cocoa/30" style={{ background: 'radial-gradient(circle closest-side, #fff, rgb(255 255 255 / 0)), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
          <span className="shrink-0 text-xs font-bold text-cinnamon">
            change<span className="sr-only"> it</span>
          </span>
        </button>
        {isColouredGround(value) ? (
          <button type="button" onClick={() => onChange(PATTERN_GROUND_WHITE)} className="min-h-11 shrink-0 px-1 text-xs font-bold text-ink-soft underline underline-offset-2 hover:text-cinnamon">
            back to white
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {pattern ? <>their drawing on repeat, on a {word} {noun}</> : <>fills the whole {noun}, edge to edge, behind their drawing</>}
      </p>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={title}
        subtitle="any colour you like"
        footer={
          <Button size="lg" className="w-full" onClick={() => { onChange(draft); setOpen(false); }}>
            use this colour
          </Button>
        }
      >
        <ColourWheel value={draft} onChange={setDraft} label={title} />
      </Modal>
    </div>
  );
}
