'use client';

import { IconRotate2, IconRotateClockwise2, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { toast } from '@/lib/store';

/**
 * The minimal in-region image studio: rotate + brighten the drawing ITSELF (not on
 * a product), producing one edited image used across every product. Runs entirely
 * client-side on the uploaded data URL — no third party sees it. The full free-form
 * decorating studio (brush / stickers / text) is a future focused project; this is
 * the working subset.
 */
export function ImageStudio({
  open,
  image,
  onClose,
  onApply,
}: {
  open: boolean;
  image: string | null;
  onClose: () => void;
  onApply: (editedDataUrl: string) => void;
}) {
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [brightness, setBrightness] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRotation(0);
      setBrightness(1);
    }
  }, [open]);

  if (!open || !image) return null;

  const rotateBy = (deg: number) => setRotation((r) => (((r + deg) % 360) + 360) % 360);

  // Bake rotation + brightness into a new PNG data URL (the edited image).
  const apply = async () => {
    setBusy(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image load failed'));
        el.src = image;
      });
      const swap = rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? img.naturalHeight : img.naturalWidth;
      canvas.height = swap ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.filter = `brightness(${brightness})`;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      onApply(canvas.toDataURL('image/png'));
      onClose();
    } catch {
      toast('couldn’t apply those edits — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cocoa/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Edit in studio" className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-[#FFFDF8] shadow-[0_20px_50px_rgba(46,39,35,.28)]">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="font-display text-lg font-semibold text-cocoa">Edit in studio</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-1 text-[#B3A491] hover:bg-[#F2EADB]">
            <Icon icon={IconX} size={18} />
          </button>
        </div>
        <p className="px-5 text-xs text-[#9C8E7E]">Edits here apply to your drawing on every product.</p>

        <div className="px-5 py-3">
          <div className="flex h-64 items-center justify-center overflow-hidden rounded-xl bg-[#FBF5E9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="your drawing"
              className="max-h-full max-w-full object-contain transition-transform"
              style={{ transform: `rotate(${rotation}deg)`, filter: `brightness(${brightness})` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <button type="button" onClick={() => rotateBy(-90)} className="inline-flex items-center gap-1.5 rounded-full border border-[#E6D8BE] bg-white px-3 py-1.5 text-xs font-bold text-cocoa hover:border-honey">
              <Icon icon={IconRotate2} size={15} /> rotate left
            </button>
            <button type="button" onClick={() => rotateBy(90)} className="inline-flex items-center gap-1.5 rounded-full border border-[#E6D8BE] bg-white px-3 py-1.5 text-xs font-bold text-cocoa hover:border-honey">
              <Icon icon={IconRotateClockwise2} size={15} /> rotate right
            </button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="brightness" className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
                Brightness
              </label>
              <span className="text-[11px] font-bold text-[#7A6A58]" aria-hidden>
                {Math.round(brightness * 100)}%
              </span>
            </div>
            <input
              id="brightness"
              type="range"
              min={0.6}
              max={1.5}
              step={0.05}
              value={brightness}
              aria-valuetext={`${Math.round(brightness * 100)}% brightness`}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="mt-1 w-full accent-cta"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#F2EADB] px-5 pb-5 pt-3">
          <button type="button" onClick={() => { setRotation(0); setBrightness(1); }} className="text-xs font-bold text-[#9C8772] hover:text-cinnamon">
            reset
          </button>
          <Button size="lg" onClick={apply} disabled={busy}>
            {busy ? 'applying…' : 'apply to all products'}
          </Button>
        </div>
      </div>
    </div>
  );
}
