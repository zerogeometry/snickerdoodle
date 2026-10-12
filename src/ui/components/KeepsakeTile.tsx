import type { ReactNode } from 'react';

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];

/**
 * A saved keepsake (a kept drawing/creation) in the Keepsake Home: a taped polaroid with a
 * small resting tilt that straightens + lifts on hover/focus (.lift). `index` varies the tilt
 * and tape colour so a grid feels hand-stuck, deterministically (no layout shift, no random).
 */
export function KeepsakeTile({
  name,
  meta,
  art,
  image,
  badge,
  index = 0,
}: {
  name: string;
  meta?: string;
  art?: ReactNode;
  image?: string;
  /** @deprecated kept for older callers; the polaroid is always white. */
  tint?: string;
  badge?: string;
  index?: number;
}) {
  const tilt = index % 2 === 0 ? '-2deg' : '1.6deg';
  return (
    <article
      className="polaroid tape lift"
      style={{ ['--tilt' as string]: tilt, ['--tape' as string]: TAPES[index % TAPES.length], ['--tape-rot' as string]: index % 2 ? '4deg' : '-3deg' }}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-paper-2">
        {image ? <img src={image} alt="" className="h-full w-full object-contain" /> : art}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-extrabold text-cocoa">{name}</span>
        {badge ? (
          <span className="rounded-md border-[1.5px] border-green-save px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-green-save">
            {badge}
          </span>
        ) : meta ? (
          <span className="text-ink-faint">{meta}</span>
        ) : null}
      </div>
    </article>
  );
}
