import { IconChevronDown } from '@tabler/icons-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { plainAnswer, type FaqItem } from '@/lib/faq';
import { Icon } from '../primitives/Icon';

/** Plain text with `[label](/path)` internal links (the FAQ's answer format). */
export function LinkedText({ text, as: Tag = 'p', className }: { text: string; as?: 'p' | 'span'; className?: string }) {
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <Link key={m.index} href={m[2]!} className="font-bold text-cinnamon underline decoration-2 underline-offset-2 hover:text-cta-deep">
        {m[1]}
      </Link>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <Tag className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</Tag>;
}

/**
 * A list of questions in the FAQ's pattern (/faq): each question a real heading inside a native
 * <details>, so the answer is in the page whether or not it's open. Pair it with {@link faqPageJsonLd}
 * from the SAME list, so what engines read is exactly what's on screen.
 */
export function FaqList({ items, headingLevel = 'h3' }: { items: FaqItem[]; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <details key={it.id} id={it.id} className="group scroll-mt-6 rounded-[18px] border-2 border-cocoa/15 bg-paper shadow-[0_3px_0_color-mix(in_srgb,var(--color-cocoa)_10%,transparent)] open:border-cocoa/40">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
            <H className="text-[16px] font-extrabold leading-snug text-cocoa">{it.q}</H>
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cocoa/20 bg-paper-2 text-cocoa transition-transform group-open:rotate-180">
              <Icon icon={IconChevronDown} size={16} />
            </span>
          </summary>
          <div className="px-4 pb-4 text-[15px] leading-relaxed text-ink-soft">
            <LinkedText text={it.a} />
          </div>
        </details>
      ))}
    </div>
  );
}

/** FAQPage structured data for a page's question list. */
export function faqPageJsonLd(items: FaqItem[], pageUrl: string, name: string, dateModified: string) {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    url: pageUrl,
    name,
    inLanguage: 'en-GB',
    dateModified,
    mainEntity: items.map((it) => ({ '@type': 'Question', name: it.q, url: `${pageUrl}#${it.id}`, acceptedAnswer: { '@type': 'Answer', text: plainAnswer(it.a) } })),
  };
}
