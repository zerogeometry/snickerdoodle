'use client';

import { IconFrame, IconX } from '@tabler/icons-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { stickerDataUrl, stickersIn, type StickerId } from '@/lib/stickers';
import { presetIsOn, type FestivePreset } from '@/lib/studio-festive';
import type { StudioObject } from '@/lib/studio-objects';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

interface DrawerProps {
  objects: StudioObject[];
  onSticker: (id: StickerId) => void;
  /** "framed in gold" is the same one-tap frame as the christmas drawer's — one frame, wherever it's tapped. */
  onToggle: (p: FestivePreset) => void;
  onClose: () => void;
}

/**
 * The Studio's everyday STICKERS drawer, all year round: the brand doodles in a grid — tap one to
 * add it, then move, size, turn or flip it like anything else — and "framed in gold" as a one-tap
 * toggle. The same sticker system as the christmas drawer (one manifest, ordinary layers on top):
 * the drawing underneath is never changed. Phone: a bottom sheet. Desktop: the side panel.
 */
function DrawerBody({ objects, onSticker, onToggle, onClose, compact }: DrawerProps & { compact?: boolean }) {
  const framed = presetIsOn(objects, 'goldFrame');
  return (
    <>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">stickers</h3>
      <ul className={`mt-1.5 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-4'}`} aria-label="stickers">
        {stickersIn('everyday').map((s, i) => (
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
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">frame it</h3>
        <span className="text-xs text-ink-faint">your original stays safe</span>
      </div>
      <button
        type="button"
        onClick={() => onToggle('goldFrame')}
        aria-pressed={framed}
        className={`press mb-3.5 mt-1.5 flex min-h-12 w-full items-center gap-2.5 rounded-[14px] border-2 px-3 text-left text-cocoa ${framed ? 'border-cobalt bg-honey-band' : 'border-cocoa/15 bg-paper hover:border-cocoa'}`}
      >
        <span aria-hidden className="sticker grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-honey">
          <Icon icon={IconFrame} size={20} />
        </span>
        <span className={`text-[13px] font-extrabold ${framed ? 'text-cobalt' : ''}`}>
          framed in gold{framed ? ' ✓' : ''}
        </span>
      </button>
      <Button size="md" onClick={onClose} className="w-full">
        looks magic →
      </Button>
    </>
  );
}

/** Phone: the drawer as a bottom sheet (its own fixed layer — never inside a moving ancestor). */
export function StickersSheet(p: DrawerProps) {
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
      <button type="button" aria-label="close the stickers drawer" onClick={onClose} className="fixed inset-0 z-30 bg-cocoa/30" />
      <div ref={ref} role="dialog" aria-label="stickers" className="sheet-up pb-safe fixed inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto rounded-t-[22px] border-t-2 border-cocoa bg-paper px-4 pb-4 pt-2 shadow-[0_-6px_18px_rgb(43_33_24/0.18)]">
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-line" aria-hidden />
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-[17px] font-extrabold text-cocoa">stickers</h2>
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
export function StickersPanel(p: DrawerProps) {
  return (
    <section aria-label="stickers" className="flex flex-col">
      <DrawerBody {...p} compact />
    </section>
  );
}
