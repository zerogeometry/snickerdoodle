import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Fragment, type ReactNode } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { definedPriceList } from '@/server/catalogue';
import { FAQ, FAQ_PRODUCT_NAMES, FAQ_UPDATED, plainAnswer, type FaqItem } from '@/lib/faq';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FaqSearch } from '@/ui/components/FaqSearch';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = {
  title: 'FAQs — turning children’s drawings into keepsakes',
  description:
    'Answers about Snickerdoodle: what you can make from your child’s drawing, prices, free UK delivery, print quality, gifts for grandparents, and how we keep your child’s artwork private.',
  alternates: { canonical: '/faq' },
  openGraph: { title: 'Snickerdoodle FAQs', description: 'Everything families ask about turning children’s drawings into keepsakes and gifts.', url: '/faq', type: 'website' },
};

/** Lowest live price per product in the shop (the catalogue is the one source of truth). */
function fromPrices(): { key: string; name: string; pence: number }[] {
  const lowest = new Map<string, number>();
  for (const r of definedPriceList()) {
    if (!r.visibleInShop || r.paused) continue;
    lowest.set(r.productKey, Math.min(lowest.get(r.productKey) ?? Infinity, r.pricePence));
  }
  return Object.entries(FAQ_PRODUCT_NAMES)
    .filter(([key]) => lowest.has(key))
    .map(([key, name]) => ({ key, name, pence: lowest.get(key)! }));
}
const gbp = (p: number) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;

/** Plain text with `[label](/path)` internal links. */
function Answer({ text }: { text: string }) {
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
  return <p>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</p>;
}

/**
 * FAQ (founder, 23 Oct) — for families, and for search + answer engines: each question is a real
 * heading in plain HTML (open or not, the answer is in the page), each answer opens with a
 * self-contained sentence, prices come live from the catalogue, and the FAQPage structured data is
 * generated from the same list — so what engines read is exactly what's on screen.
 */
export default async function FaqPage() {
  const prices = fromPrices();
  const site = (process.env.APP_URL || 'https://snickerdoodle.co.uk').replace(/\/+$/, '');
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const priceSentence = prices.map((p) => `${p.name} from ${gbp(p.pence)}`).join('; ');
  const answerText = (it: FaqItem) => plainAnswer(it.a) + (it.table === 'products' ? ` ${priceSentence}.` : '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: 'Snickerdoodle',
        legalName: COMPANY.legalName,
        email: COMPANY.email,
        vatID: COMPANY.vatNumber.replace(/\s+/g, ''),
        identifier: { '@type': 'PropertyValue', propertyID: 'Companies House company number', value: COMPANY.companyNumber },
        address: { '@type': 'PostalAddress', streetAddress: COMPANY.street, addressLocality: COMPANY.city, postalCode: COMPANY.postcode, addressCountry: COMPANY.country },
        url: site,
        logo: `${site}/brand/snickerlogo.png`,
        description: 'A UK service that turns children’s drawings and photos into personalised keepsakes and gifts, kept safe in a private Family Keepsake Home.',
        areaServed: { '@type': 'Country', name: 'United Kingdom' },
        slogan: 'Keep the magic.',
      },
      {
        '@type': 'FAQPage',
        '@id': `${site}/faq#faq`,
        url: `${site}/faq`,
        name: 'Snickerdoodle FAQs',
        inLanguage: 'en-GB',
        dateModified: FAQ_UPDATED,
        publisher: { '@id': `${site}/#organization` },
        mainEntity: FAQ.flatMap((s) =>
          s.items.map((it) => ({
            '@type': 'Question',
            name: it.q,
            url: `${site}/faq#${it.id}`,
            acceptedAnswer: { '@type': 'Answer', text: answerText(it) },
          })),
        ),
      },
    ],
  };
  const updated = new Date(`${FAQ_UPDATED}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <section className="relative px-6 pb-10 pt-8 md:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <CaveatNote className="-rotate-2 text-[28px] leading-none md:text-[34px]">questions? we&apos;ve got you</CaveatNote>
          <h1 className="mt-3 font-display text-4xl leading-tight text-cocoa md:text-5xl">Snickerdoodle questions, answered</h1>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
            Snickerdoodle turns your child’s drawings and photos into personalised keepsakes and gifts — made to order in the UK,
            delivered free, and kept private in your Family Keepsake Home. Here’s everything families usually ask.
          </p>
          <FaqSearch className="mx-auto mt-6 max-w-2xl text-left" />
          <nav aria-label="FAQ topics" className="mt-6 flex flex-wrap justify-center gap-2">
            {FAQ.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="press inline-flex min-h-11 items-center rounded-pill border-2 border-cocoa/20 bg-paper px-4 text-sm font-bold text-cocoa hover:border-cocoa">
                {s.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="px-4 pb-16 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          {FAQ.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-6">
              <h2 id={`${s.id}-title`} className="font-display text-2xl text-cocoa md:text-3xl">
                {s.title}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {s.items.map((it) => (
                  <details key={it.id} id={it.id} className="group scroll-mt-6 rounded-[18px] border-2 border-cocoa/15 bg-paper shadow-[0_3px_0_color-mix(in_srgb,var(--color-cocoa)_10%,transparent)] open:border-cocoa/40">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                      <h3 className="text-[16px] font-extrabold leading-snug text-cocoa">{it.q}</h3>
                      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cocoa/20 bg-paper-2 text-cocoa transition-transform group-open:rotate-180">
                        <Icon icon={IconChevronDown} size={16} />
                      </span>
                    </summary>
                    <div className="px-4 pb-4 text-[15px] leading-relaxed text-ink-soft">
                      <Answer text={it.a} />
                      {it.table === 'products' ? (
                        <table className="mt-3 w-full border-collapse text-left text-[14px]">
                          <caption className="sr-only">Snickerdoodle products and their starting prices, with free UK delivery included</caption>
                          <thead>
                            <tr className="border-b-2 border-cocoa/15 text-[12px] uppercase tracking-wide text-ink-faint">
                              <th scope="col" className="py-2 font-extrabold">Product</th>
                              <th scope="col" className="py-2 text-right font-extrabold">From</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prices.map((p) => (
                              <tr key={p.key} className="border-b border-cocoa/10">
                                <td className="py-2 text-cocoa">{p.name}</td>
                                <td className="py-2 text-right font-bold text-cocoa">{gbp(p.pence)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <div className="rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper-2 p-5 text-center">
            <p className="font-display text-xl text-cocoa">Can’t find your answer?</p>
            <p className="mt-1 text-[15px] text-ink-soft">
              Send us a message on our{' '}
              <Link href="/help#contact" className="font-bold text-cinnamon underline underline-offset-2">help page</Link> — a real person will reply.
            </p>
          </div>
          <p className="text-center text-[13px] text-ink-faint">
            Last checked and updated <time dateTime={FAQ_UPDATED}>{updated}</time>. Something we haven’t answered? Our{' '}
            <Link href="/trust/privacy" className="underline underline-offset-2 hover:text-cinnamon">privacy notice</Link> and{' '}
            <Link href="/trust/terms" className="underline underline-offset-2 hover:text-cinnamon">terms</Link> have the full detail.
          </p>
          <div className="flex justify-center">
            <Button href="/start-creating" size="lg" attention>
              start creating — it’s free to try
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
