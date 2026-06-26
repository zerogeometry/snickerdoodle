import type { ReactNode } from 'react';

/** A saved keepsake (a kept drawing/creation) shown in the Keepsake Home grid. */
export function KeepsakeTile({
  name,
  meta,
  art,
  image,
  tint = '#FDF0DC',
  badge,
}: {
  name: string;
  meta?: string;
  art?: ReactNode;
  image?: string;
  tint?: string;
  badge?: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-[#EFE6D6] bg-white shadow-[0_2px_5px_rgba(46,39,35,.06)]">
      {badge ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-cocoa/85 px-2 py-0.5 text-[10px] font-bold text-oat">
          {badge}
        </span>
      ) : null}
      <div className="flex h-[88px] items-center justify-center" style={{ backgroundColor: tint }}>
        {image ? (
          <img src={image} alt="" className="h-[68px] w-[68px] rounded-md border border-white object-cover shadow-sm" />
        ) : (
          art
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#EFE6D6] px-3 py-2 text-xs">
        <span className="font-semibold text-[#7A6A58]">{name}</span>
        {meta ? <span className="text-[#B3A491]">{meta}</span> : null}
      </div>
    </article>
  );
}
