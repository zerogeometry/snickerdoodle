'use client';

import { IconCookieMan, IconFrame, IconSnowflake } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { presetIsOn, type FestivePreset } from '@/lib/studio-festive';
import type { StudioObject } from '@/lib/studio-objects';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

/** The festive washi tape, from tokens only (cta stripes on paper), as in the Christmas mockups. */
export const HOLLY_TAPE: CSSProperties = {
  background: 'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-cta) 85%, transparent) 0 7px, color-mix(in srgb, var(--color-paper) 90%, transparent) 7px 14px)',
};

/**
 * "festive touches" (Christmas season only; mockups/christmas screen 3): four sticker tiles in the
 * design-tool colour (cobalt). Holly tape, the gold frame and snowfall go on in one tap and come
 * off with another; stickers opens the festive shapes. Each touch is ordinary layers, so undo,
 * move and recolour all work — and the drawing underneath is never changed.
 * Phone: a sheet risen over the picture from behind the toolbar. Desktop: the side panel.
 */
export function FestiveTouches({
  objects,
  onToggle,
  onStickers,
  onDone,
  sheet = false,
}: {
  objects: StudioObject[];
  onToggle: (p: FestivePreset) => void;
  onStickers: () => void;
  onDone: () => void;
  sheet?: boolean;
}) {
  const tile = (key: string, label: string, art: ReactNode, style: string, onClick: () => void, on?: boolean, extra?: CSSProperties) => (
    <li key={key} className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        aria-label={label}
        className="press group flex w-full flex-col items-center gap-1.5 rounded-[16px] text-cocoa focus-visible:outline-2"
      >
        <span
          aria-hidden
          className={`sticker wiggle grid h-[62px] w-full place-items-center rounded-[14px] ${style} ${on ? 'outline-[3px] outline-offset-2 outline-cobalt [outline-style:solid]' : ''}`}
          style={extra}
        >
          {art}
        </span>
        <span aria-hidden className={`text-[11.5px] font-extrabold leading-tight ${on ? 'text-cobalt' : ''}`}>
          {label}
          {on ? ' ✓' : ''}
        </span>
      </button>
    </li>
  );
  return (
    <section aria-label="festive touches" className={sheet ? 'rounded-[22px] border-2 border-cocoa bg-paper px-3.5 pb-3.5 pt-2 shadow-[0_-6px_18px_rgb(43_33_24/0.18)]' : 'flex flex-col gap-1'}>
      {sheet ? <div aria-hidden className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line" /> : null}
      {/* the desktop panel already wears the tool's name in its header */}
      <div className={`flex items-baseline gap-2 ${sheet ? 'justify-between' : 'justify-end'}`}>
        {sheet ? <h2 className="text-[17px] font-extrabold text-cocoa">festive touches</h2> : null}
        <span className="text-xs text-ink-faint">your original stays safe</span>
      </div>
      <ul className="mb-3.5 mt-3 grid grid-cols-4 gap-2.5">
        {tile('tape', 'holly tape', null, '', () => onToggle('hollyTape'), presetIsOn(objects, 'hollyTape'), HOLLY_TAPE)}
        {tile('frame', 'gold frame', <Icon icon={IconFrame} size={28} />, 'bg-honey', () => onToggle('goldFrame'), presetIsOn(objects, 'goldFrame'))}
        {tile('snow', 'snowfall', <Icon icon={IconSnowflake} size={28} />, 'bg-sky-pale text-cobalt', () => onToggle('snowfall'), presetIsOn(objects, 'snowfall'))}
        {tile('stickers', 'stickers', <Icon icon={IconCookieMan} size={28} />, 'bg-honey-band', onStickers)}
      </ul>
      <Button size="md" onClick={onDone} className="w-full">
        looks magic →
      </Button>
    </section>
  );
}
