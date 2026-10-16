'use client';

import { IconRotate, IconRotateClockwise } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { normAngle, snapAngle } from '@/lib/studio-geometry';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Section } from './panel';

const fmt = (a: number) => (Math.round(a * 10) / 10).toString();

/**
 * One way to turn anything in the Studio — the whole design, a word, a shape, a pen line, the
 * unlocked drawing: a slider that clicks gently into place at every 45°, an exact number (to 0.1°,
 * typed = exactly that, no snap), quarter turns both ways, and "straight". `onAngle(v, true)` marks
 * a continuous drag (one undo step).
 */
export function AngleControl({ angle, onAngle, label = 'angle', what = 'it', hint }: { angle: number; onAngle: (deg: number, group?: boolean) => void; label?: string; what?: string; hint?: React.ReactNode }) {
  const [text, setText] = useState(fmt(angle));
  useEffect(() => setText(fmt(angle)), [angle]);
  const ticks = useId();
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v)) onAngle(normAngle(v));
    else setText(fmt(angle));
  };
  return (
    <Section label={label} aside={<span className="font-display text-xl leading-none text-cocoa">{fmt(angle)}°</span>}>
      <input
        type="range"
        min={0}
        max={360}
        step={0.1}
        value={angle}
        onChange={(e) => onAngle(snapAngle(Number(e.target.value)), true)}
        className="h-11 w-full accent-[var(--color-cta)]"
        aria-label={`turn ${what}`}
        aria-valuetext={`${fmt(angle)} degrees`}
        list={ticks}
      />
      <datalist id={ticks}>
        {[0, 45, 90, 135, 180, 225, 270, 315, 360].map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <div aria-hidden className="-mt-1 flex justify-between px-0.5 text-[10px] font-bold text-ink-faint">
        <span>0°</span>
        <span>90°</span>
        <span>180°</span>
        <span>270°</span>
        <span>360°</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
          exact
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={360}
            step={0.1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="min-h-11 w-20 rounded-lg border border-line bg-paper px-2.5 text-[15px] text-cocoa"
            aria-label={`exact angle for ${what}, in degrees`}
          />
          °
        </label>
        <div className="ml-auto flex gap-1.5">
          <Button variant="secondary" size="sm" className="!px-2.5" onClick={() => onAngle(angle - 90)} aria-label={`turn ${what} a quarter turn anticlockwise`}>
            <Icon icon={IconRotate} size={15} />
          </Button>
          <Button variant="secondary" size="sm" className="!px-2.5" onClick={() => onAngle(angle + 90)} aria-label={`turn ${what} a quarter turn clockwise`}>
            <Icon icon={IconRotateClockwise} size={15} />
          </Button>
          <Button variant="secondary" size="sm" className="!px-3" onClick={() => onAngle(0)} disabled={angle === 0}>
            straight
          </Button>
        </div>
      </div>
      {hint ? <p className="text-[11px] leading-snug text-ink-soft">{hint}</p> : null}
    </Section>
  );
}
