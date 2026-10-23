'use client';

import { IconSearch, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { searchFaq } from '@/lib/faqSearch';
import { Icon } from '@/ui/primitives/Icon';
import { FaqAnswer } from './FaqAnswer';

/**
 * Search the answers (founder, 23 Oct): type, and the best-matching questions appear with their
 * answers open. Nothing found → a gentle hand-off to the help form. Results are announced politely.
 */
export function FaqSearch({ contactHref = '/help#contact', className = '' }: { contactHref?: string; className?: string }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchFaq(q), [q]);
  const id = useId();
  const typed = q.trim().length > 1;
  return (
    <div className={className}>
      <div role="search" className="relative">
        <label htmlFor={id} className="sr-only">
          search our answers
        </label>
        <Icon icon={IconSearch} size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search — e.g. delivery, phone case, refund"
          autoComplete="off"
          enterKeyHint="search"
          className="h-14 w-full rounded-pill border-2 border-cocoa bg-paper pl-12 pr-12 text-[16px] text-cocoa shadow-[0_3px_0_var(--color-cocoa)] placeholder:text-ink-faint focus:outline-none focus-visible:ring-4 focus-visible:ring-honey"
        />
        {q ? (
          <button type="button" onClick={() => setQ('')} aria-label="clear the search" className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-cocoa">
            <Icon icon={IconX} size={18} />
          </button>
        ) : null}
      </div>

      <div aria-live="polite" className="mt-4">
        {typed && hits.length ? (
          <>
            <p className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-ink-faint">
              {hits.length === 1 ? '1 answer' : `${hits.length} answers`} for “{q.trim()}”
            </p>
            <ul className="flex flex-col gap-3">
              {hits.map((h) => (
                <li key={h.item.id} className="rounded-[18px] border-2 border-cocoa/40 bg-paper p-4 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{h.section}</p>
                  <h3 className="mt-0.5 text-[16px] font-extrabold leading-snug text-cocoa">{h.item.q}</h3>
                  <FaqAnswer text={h.item.a} className="mt-1.5 text-[15px] leading-relaxed text-ink-soft" />
                  {h.item.table === 'products' ? (
                    <Link href={`/faq#${h.item.id}`} className="mt-1 inline-block text-[13px] font-bold text-cinnamon underline underline-offset-2">
                      see every price
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : typed ? (
          <p className="rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper-2 p-4 text-center text-[15px] text-ink-soft">
            We haven’t got an answer for that one yet —{' '}
            <a href={contactHref} className="font-bold text-cinnamon underline underline-offset-2">
              ask us
            </a>{' '}
            and a real person will reply.
          </p>
        ) : null}
      </div>
    </div>
  );
}
