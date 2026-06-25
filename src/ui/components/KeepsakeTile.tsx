import type { ReactNode } from 'react';

/** A saved keepsake (a kept drawing/creation) shown in the Keepsake Home grid. */
export function KeepsakeTile({
  name,
  meta,
  art,
  tint = '#FDF0DC',
}: {
  name: string;
  meta?: string;
  art: ReactNode;
  tint?: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#EFE6D6] bg-white shadow-[0_2px_5px_rgba(46,39,35,.06)]">
      <div className="flex h-[88px] items-center justify-center" style={{ backgroundColor: tint }}>
        {art}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#EFE6D6] px-3 py-2 text-xs">
        <span className="font-semibold text-[#7A6A58]">{name}</span>
        {meta ? <span className="text-[#B3A491]">{meta}</span> : null}
      </div>
    </article>
  );
}
