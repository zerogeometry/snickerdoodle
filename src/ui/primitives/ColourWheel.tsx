'use client';

import { useEffect, useRef, useState } from 'react';
import { colourName } from '@/lib/patterns';

/**
 * A full COLOUR WHEEL (founder, 22 Oct — "a full colour wheel rather than selected colours"): round
 * the wheel is the colour, out from the middle is how strong it is, and the slider underneath is
 * how light or dark. Finger, stylus, mouse and keyboard all work:
 *   ←/→ turn round the wheel · ↑/↓ stronger / softer · the slider (or Page Up/Down) lighter / darker.
 * A colour code can be typed too. `onChange` fires live with lowercase `#rrggbb`.
 */
export function ColourWheel({ value, onChange, label = 'colour' }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [code, setCode] = useState(value);
  const disc = useRef<HTMLDivElement>(null);
  // follow the outside value when it changes from elsewhere (not our own echo)
  const last = useRef(value);
  useEffect(() => {
    if (value.toLowerCase() !== last.current.toLowerCase()) {
      setHsv(hexToHsv(value));
      setCode(value);
      last.current = value;
    }
  }, [value]);

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setCode(hex);
    onChange(hex);
  };

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = disc.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const h = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360; // 0° at the top, clockwise
    const s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
    // picking on the wheel at full dark would only ever give black — lift it so the pick shows
    set({ h, s, v: hsv.v < 0.15 ? 0.6 : hsv.v });
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 15 : 5;
    const k = e.key;
    if (k === 'ArrowLeft') set({ ...hsv, h: (hsv.h - step + 360) % 360 });
    else if (k === 'ArrowRight') set({ ...hsv, h: (hsv.h + step) % 360 });
    else if (k === 'ArrowUp') set({ ...hsv, s: Math.min(1, hsv.s + step / 100) });
    else if (k === 'ArrowDown') set({ ...hsv, s: Math.max(0, hsv.s - step / 100) });
    else if (k === 'PageUp') set({ ...hsv, v: Math.min(1, hsv.v + 0.1) });
    else if (k === 'PageDown') set({ ...hsv, v: Math.max(0, hsv.v - 0.1) });
    else return;
    e.preventDefault();
  };

  const hex = hsvToHex(hsv);
  const pure = hsvToHex({ ...hsv, v: 1 });
  const rad = (hsv.h * Math.PI) / 180;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={disc}
        role="slider"
        tabIndex={0}
        aria-label={`${label} — arrows left and right change the colour, up and down how strong it is`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuetext={`${colourName(hex)} (${hex})`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
        }}
        className="relative aspect-square w-full max-w-[240px] touch-none select-none rounded-full border-2 border-cocoa shadow-[0_3px_0_var(--color-cocoa)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-honey"
        style={{ background: 'radial-gradient(circle closest-side, #fff, rgb(255 255 255 / 0) 100%), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        {/* how dark: the whole wheel dims with the slider, so what you see is what you pick */}
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
        <span
          aria-hidden
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_var(--color-cocoa)]"
          style={{ left: `${50 + 50 * hsv.s * Math.sin(rad)}%`, top: `${50 - 50 * hsv.s * Math.cos(rad)}%`, background: hex }}
        />
      </div>

      <label className="w-full max-w-[240px] text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
        light or dark
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsv.v * 100)}
          onChange={(e) => set({ ...hsv, v: Number(e.target.value) / 100 })}
          aria-valuetext={`${Math.round(hsv.v * 100)}% light`}
          className="wheel-range mt-1.5 h-11 w-full cursor-pointer appearance-none rounded-pill border-2 border-cocoa"
          style={{ background: `linear-gradient(to right, #000, ${pure})` }}
        />
      </label>

      <div className="flex w-full max-w-[240px] items-center gap-2.5">
        <span aria-hidden className="h-11 w-11 shrink-0 rounded-full border-2 border-cocoa" style={{ background: hex }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-cocoa" aria-live="polite">{colourName(hex)}</p>
          <label className="flex items-center gap-1 text-[11px] text-ink-faint">
            <span>colour code</span>
            <input
              value={code}
              onChange={(e) => {
                const v = e.target.value.trim();
                setCode(v);
                const full = /^#?[0-9a-f]{6}$/i.test(v) ? `#${v.replace('#', '').toLowerCase()}` : null;
                if (full) set(hexToHsv(full));
              }}
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              className="h-8 w-[5.5rem] rounded-[8px] border-2 border-cocoa/30 bg-paper px-1.5 font-mono text-[12px] text-cocoa focus:border-cocoa focus:outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

type Hsv = { h: number; s: number; v: number };

export function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1]!, 16) : 0xffffff;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}
