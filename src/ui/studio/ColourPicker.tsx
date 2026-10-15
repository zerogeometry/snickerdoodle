'use client';

import { IconCheck, IconPlus } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';

/** The standard colour range — bright crayon-box colours plus the neutrals a design needs. */
export const STANDARD_COLOURS: { name: string; hex: string }[] = [
  { name: 'white', hex: '#ffffff' },
  { name: 'cream', hex: '#fbf3e1' },
  { name: 'black', hex: '#111111' },
  { name: 'cocoa', hex: '#2b2118' },
  { name: 'red', hex: '#d7352c' },
  { name: 'orange', hex: '#f08a24' },
  { name: 'sunshine', hex: '#f6c445' },
  { name: 'green', hex: '#4f9d3a' },
  { name: 'sky', hex: '#5fb4e5' },
  { name: 'blue', hex: '#2f5da8' },
  { name: 'purple', hex: '#7b4bb3' },
  { name: 'pink', hex: '#ef7fae' },
  { name: 'kraft', hex: '#c8a57a' },
  { name: 'grey', hex: '#9a9a9a' },
];

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
};

/**
 * Pick a colour: the standard range as big, tappable swatches (≥44px), plus "more colours" — the
 * device's own colour picker for any shade. Swatches are labelled for screen readers.
 */
export function ColourPicker({ value, onChange, label = 'colour' }: { value: string | null; onChange: (hex: string) => void; label?: string }) {
  const custom = value && !STANDARD_COLOURS.some((c) => c.hex === value.toLowerCase()) ? value : null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {STANDARD_COLOURS.map((c) => {
        const on = value?.toLowerCase() === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            aria-label={c.name}
            aria-pressed={on}
            onClick={() => onChange(c.hex)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${on ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/25'}`}
            style={{ background: c.hex }}
          >
            {on ? <Icon icon={IconCheck} size={16} className={isLight(c.hex) ? 'text-cocoa' : 'text-white'} /> : null}
          </button>
        );
      })}
      <label
        className={`relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 ${custom ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/25'}`}
        style={{ background: custom ?? 'conic-gradient(#d7352c, #f6c445, #4f9d3a, #5fb4e5, #7b4bb3, #ef7fae, #d7352c)' }}
        title="more colours"
      >
        <span className="sr-only">more colours</span>
        {custom ? null : <Icon icon={IconPlus} size={16} className="text-white drop-shadow" />}
        <input type="color" value={custom ?? '#d7352c'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="more colours" />
      </label>
    </div>
  );
}
