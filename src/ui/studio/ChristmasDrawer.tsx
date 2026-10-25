'use client';

import { IconFrame, IconSnowflake, IconX } from '@tabler/icons-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { STICKERS, stickerDataUrl, type StickerId } from '@/lib/stickers';
import { presetIsOn, type FestivePreset } from '@/lib/studio-festive';
import type { StudioObject } from '@/lib/studio-objects';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

/** The festive washi tape, from tokens only (cta stripes on paper), as in the Christmas mockups. */
const HOLLY_TAPE: CSSProperties = {
  background: 'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-cta) 85%, transparent) 0 7px, color-mix(in srgb, var(--color-paper) 90%, transparent) 7px 14px)',
};

interface DrawerProps {
  objects: StudioObject[];
  onSticker: (id: StickerId) => void;
  onToggle: (p: FestivePreset) => void;
  onClose: () => void;
}

/**
 * The Studio's CHRISTMAS drawer (in season only — src/lib/season.ts; it comes back every year):
 * the sticker family in a grid — tap one to add it, then move, size, turn or flip it like anything
 * else — and the festive touches (holly tape · gold frame · snowfall) as one-tap toggles in cobalt,
 * the design-tool colour. Everything is ordinary layers on top: the drawing is never changed.
 * Phone: a bottom sheet over the picture. Desktop: the side panel.
 */
function DrawerBody({ objects, onSticker, onToggle, onClose, compact }: DrawerProps & { compact?: boolean }) {
  const touch = (p: FestivePreset, label: string, art: ReactNode, style: string, extra?: CSSProperties) => {
    const on = presetIsOn(objects, p);
    return (
      <li key={p} className="min-w-0">
        <button type="button" onClick={() => onToggle(p)} aria-pressed={on} aria-label={label} className="press flex w-full flex-col items-center gap-1 rounded-[14px] text-cocoa">
          <span aria-hidden className={`sticker grid h-12 w-full place-items-center rounded-[12px] ${style} ${on ? 'outline-[3px] outline-offset-2 outline-cobalt [outline-style:solid]' : ''}`} style={extra}>
            {art}
          </span>
          <span aria-hidden className={`text-[11.5px] font-extrabold leading-tight ${on ? 'text-cobalt' : ''}`}>
            {label}
            {on ? ' ✓' : ''}
          </span>
        </button>
      </li>
    );
  };
  return (
    <>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">stickers</h3>
      <ul className={`mt-1.5 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-4'}`} aria-label="christmas stickers">
        {STICKERS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSticker(s.id)}
              aria-label={`add ${s.label} sticker`}
              className="press wiggle pop-in flex aspect-square w-full items-center justify-center rounded-[16px] border-2 border-cocoa/15 bg-paper-2 p-1 hover:border-cocoa"
              style={{ '--i': i } as CSSProperties}
            >
              <img src={stickerDataUrl(s.id)} alt="" className="h-full w-full" draggable={false} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">festive touches</h3>
        <span className="text-xs text-ink-faint">your original stays safe</span>
      </div>
      <ul className="mb-3.5 mt-1.5 grid grid-cols-3 gap-2.5">
        {touch('hollyTape', 'holly tape', null, '', HOLLY_TAPE)}
        {touch('goldFrame', 'gold frame', <Icon icon={IconFrame} size={24} />, 'bg-honey')}
        {touch('snowfall', 'snowfall', <Icon icon={IconSnowflake} size={24} />, 'bg-sky-pale text-cobalt')}
      </ul>
      <Button size="md" onClick={onClose} className="w-full">
        looks magic →
      </Button>
    </>
  );
}

/** Phone: the drawer as a bottom sheet (its own fixed layer — never inside a moving ancestor). */
export function ChristmasSheet(p: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = p;
  useEffect(() => {
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="md:hidden">
      <button type="button" aria-label="close the christmas drawer" onClick={onClose} className="fixed inset-0 z-30 bg-cocoa/30" />
      <div ref={ref} role="dialog" aria-label="christmas" className="sheet-up pb-safe fixed inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto rounded-t-[22px] border-t-2 border-cocoa bg-paper px-4 pb-4 pt-2 shadow-[0_-6px_18px_rgb(43_33_24/0.18)]">
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-line" aria-hidden />
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-[17px] font-extrabold text-cocoa">christmas</h2>
          <button type="button" onClick={onClose} aria-label="close" className="flex h-11 w-11 items-center justify-center text-ink-soft">
            <Icon icon={IconX} size={18} />
          </button>
        </div>
        <DrawerBody {...p} />
      </div>
    </div>
  );
}

/** Desktop: the same drawer in the side panel. */
export function ChristmasPanel(p: DrawerProps) {
  return (
    <section aria-label="christmas" className="flex flex-col">
      <DrawerBody {...p} compact />
    </section>
  );
}
