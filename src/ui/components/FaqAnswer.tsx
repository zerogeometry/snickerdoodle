import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

/** An FAQ answer: plain text with `[label](/path)` internal links (server or client). */
export function FaqAnswer({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <Link key={m.index} href={m[2]!} className="font-bold text-cinnamon underline decoration-2 underline-offset-2 hover:text-cta-deep">
        {m[1]}
      </Link>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <p className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </p>
  );
}
