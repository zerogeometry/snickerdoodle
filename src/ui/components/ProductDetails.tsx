'use client';

import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';

/** The collapsible, scrollable-in-container "product details" every product page shows (the product
 * page, the card pack, the calendar — one look). */
export function ProductDetails({ description, specs }: { description: string | null; specs?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  if (!description) return null;
  return (
    <div className="mt-5 rounded-[16px] border-2 border-cocoa/15 bg-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-extrabold text-cocoa"
      >
        product details
        <Icon icon={IconChevronDown} size={16} className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="brand-scroll max-h-44 overflow-y-auto border-t-2 border-cocoa/10 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          <p>{description}</p>
          {specs && Object.keys(specs).length > 0 ? (
            <dl className="mt-3 space-y-1">
              {Object.entries(specs).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="min-w-20 font-bold capitalize text-cocoa">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
