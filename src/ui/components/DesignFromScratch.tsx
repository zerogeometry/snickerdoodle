'use client';

import { IconBrush } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUpload } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/**
 * Canvas shapes for designing from scratch. Big enough that everything drawn prints crisp on the
 * largest products (the Studio's words, lines and shapes are vectors, rendered at this size).
 */
const CANVASES = [
  { id: 'square', label: 'square', note: 'cushions, mugs, blankets', w: 3600, h: 3600 },
  { id: 'tall', label: 'tall', note: 'prints, cards', w: 3000, h: 4000 },
  { id: 'wide', label: 'wide', note: 'prints, jigsaws', w: 4000, h: 3000 },
] as const;

/** A blank, see-through canvas as a PNG (a few KB — it compresses to almost nothing). */
function blankCanvas(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.toDataURL('image/png');
}

/**
 * "design from scratch": pick a canvas shape, land in the Studio with the drawing tools —
 * brushes, words, shapes — and make a brand-new keepsake from nothing.
 */
export function DesignFromScratch({ className = '', variant = 'secondary', size = 'lg', label = 'design from scratch' }: { className?: string; variant?: 'secondary' | 'ghost' | 'designOutline'; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const setUpload = useUpload((s) => s.setUpload);

  const start = (c: (typeof CANVASES)[number]) => {
    setUpload({ dataUrl: blankCanvas(c.w, c.h), name: 'my-design.png', scratch: true, opaqueBg: false, aspect: c.w / c.h });
    router.push('/studio');
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Icon icon={IconBrush} size={18} /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="design from scratch" subtitle="a blank canvas — draw, add words and shapes, then make it into anything">
        <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="canvas shape">
          {CANVASES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => start(c)}
              className="press pop-in flex flex-col items-center gap-2 rounded-[16px] border-2 border-cocoa/20 bg-paper px-2 pb-3 pt-4 text-center hover:border-cocoa"
              style={{ ['--i' as string]: i }}
            >
              <span className="flex h-16 items-center justify-center" aria-hidden>
                <span className="block rounded-[6px] border-2 border-cocoa bg-white shadow-[0_3px_0_var(--color-cocoa)]" style={{ width: (c.w / Math.max(c.w, c.h)) * 56, height: (c.h / Math.max(c.w, c.h)) * 56 }} />
              </span>
              <span className="text-sm font-extrabold text-cocoa">{c.label}</span>
              <span className="text-[11px] leading-tight text-ink-soft">{c.note}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
          You can change the background colour, or make it see-through, in the studio. By starting you accept our{' '}
          <Link href="/trust/terms" className="font-bold text-cinnamon">terms</Link> &amp;{' '}
          <Link href="/trust/privacy" className="font-bold text-cinnamon">privacy notice</Link>.
        </p>
      </Modal>
    </>
  );
}
