import type { Metadata } from 'next';
import Link from 'next/link';
import { FAQ } from '@/lib/faq';
import { HELLO_EMAIL, SUPPORT_TOPICS, cleanOrderRef, supportTopic } from '@/lib/support';
import { getCurrentAccount } from '@/server/session';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { FaqAnswer } from '@/ui/components/FaqAnswer';
import { FaqSearch } from '@/ui/components/FaqSearch';
import { SupportForm } from '@/ui/components/SupportForm';

export const metadata: Metadata = {
  title: 'help & contact',
  description: 'Get help with Snickerdoodle: search our answers on orders, delivery, the studio, gifts and privacy — or send our team a message and a real person will reply.',
  alternates: { canonical: '/help' },
};

/** The answers most people need, shown before anyone has to ask. */
const POPULAR = ['delivery-cost', 'change-order', 'returns', 'print-quality', 'grandparents-buy', 'how-long-kept'];

/**
 * Help & contact (founder, 23 Oct): answers first — search, then the most-asked — and only then a
 * person: pick a topic, see the likeliest answers once more, send a message (to support@). Order
 * questions come through here too, with the order reference. Linked from the footer and each order.
 */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topic?: string; order?: string }> }) {
  const { topic, order } = await searchParams;
  const account = await getCurrentAccount();
  const byId = new Map(FAQ.flatMap((s) => s.items).map((it) => [it.id, it]));
  const popular = POPULAR.map((id) => byId.get(id)).filter((x) => !!x);
  // the topics' "these might help" answers, as plain props for the form
  const suggestions = Object.fromEntries(
    [...new Set(SUPPORT_TOPICS.flatMap((t) => t.suggest))].map((id) => byId.get(id)).filter((x) => !!x).map((it) => [it.id, { id: it.id, q: it.q, a: it.a }]),
  );

  return (
    <>
      <section className="px-6 pb-8 pt-8 md:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <CaveatNote className="-rotate-2 text-[28px] leading-none md:text-[34px]">we&apos;re here to help</CaveatNote>
          <h1 className="mt-3 font-display text-4xl leading-tight text-cocoa md:text-5xl">How can we help?</h1>
          <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-ink-soft">Most answers are a search away — and if yours isn’t, a real person is just below.</p>
          <FaqSearch className="mx-auto mt-6 max-w-2xl text-left" contactHref="#contact" />
        </div>
      </section>

      <div className="px-4 pb-16 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          <section aria-labelledby="popular-title">
            <h2 id="popular-title" className="font-display text-2xl text-cocoa md:text-3xl">
              What people ask most
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {popular.map((it) => (
                <details key={it.id} className="group rounded-[18px] border-2 border-cocoa/15 bg-paper open:border-cocoa/40">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                    <h3 className="text-[16px] font-extrabold leading-snug text-cocoa">{it.q}</h3>
                  </summary>
                  <FaqAnswer text={it.a} className="px-4 pb-4 text-[15px] leading-relaxed text-ink-soft" />
                </details>
              ))}
            </div>
            <p className="mt-4 text-[15px] text-ink-soft">
              Browse every answer on our <Link href="/faq" className="font-bold text-cinnamon underline underline-offset-2">FAQs</Link> — products and prices, delivery, gifts, privacy and more.
            </p>
          </section>

          <section id="contact" aria-labelledby="contact-title" className="scroll-mt-6 rounded-[24px] border-2 border-cocoa bg-paper p-5 shadow-[0_4px_0_var(--color-cocoa)] md:p-7">
            <h2 id="contact-title" className="font-display text-2xl text-cocoa md:text-3xl">
              Still need a hand?
            </h2>
            <p className="mt-1 text-[15px] text-ink-soft">Tell us what it’s about and send us a message — a real person reads every one and replies by email. Order questions too: include your order reference and we’ll do what we can.</p>
            <div className="mt-5">
              <SupportForm suggestions={suggestions} defaultEmail={account?.email ?? ''} defaultTopic={supportTopic(topic)?.id ?? ''} defaultOrderRef={cleanOrderRef(order) ?? ''} />
            </div>
          </section>

          <p className="text-center text-[14px] text-ink-soft">
            Anything else — partnerships, press or just to say hello:{' '}
            <a href={`mailto:${HELLO_EMAIL}`} className="font-bold text-cinnamon underline underline-offset-2">
              {HELLO_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
