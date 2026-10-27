import { IconArrowRight, IconChevronRight, IconShieldCheck } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHRISTMAS_PAGES, CHRISTMAS_PAGES_UPDATED, christmasPage } from '@/lib/christmas-pages';
import { christmasDeadlines, seasonClock } from '@/lib/season';
import { siteOrigin } from '@/lib/seo';
import { shopListings } from '@/server/shop/listing';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { ChristmasDeadline } from '@/ui/components/ChristmasDeadline';
import { FaqList, LinkedText, faqPageJsonLd } from '@/ui/components/FaqList';
import { JsonLd } from '@/ui/components/JsonLd';
import { ShopTile } from '@/ui/components/ShopTile';
import { ThumbCta } from '@/ui/components/ThumbCta';

/**
 * /christmas/<topic> (C6) — one page per thing families search for at Christmas (ornaments, cards,
 * wrapping paper, grandparents, teachers), from src/lib/christmas-pages.ts. Each answers its ONE
 * question in the first sentence (naming Snickerdoodle), shows the products that answer it with
 * catalogue prices, and ends in an FAQ with FAQPage data from the same list. /christmas/delivery-dates
 * is its own page (a static route wins over this one).
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = christmasPage((await params).topic);
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/christmas/${page.slug}` },
    openGraph: { title: `${page.metaTitle} — Snickerdoodle`, description: page.metaDescription, url: `/christmas/${page.slug}`, type: 'website' },
  };
}

export default async function ChristmasTopicPage({ params }: Params) {
  const page = christmasPage((await params).topic);
  if (!page) notFound();
  const site = siteOrigin();
  const url = `${site}/christmas/${page.slug}`;
  const all = new Map(shopListings().map((l) => [l.key, l]));
  const products = page.products.map((k) => all.get(k)).filter((l) => l !== undefined);
  const lead = products[0];
  const others = CHRISTMAS_PAGES.filter((p) => p.slug !== page.slug);
  const inTime = christmasDeadlines(seasonClock(new Date())).state === 'upcoming';

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              '@id': url,
              url,
              name: page.h1,
              description: page.metaDescription,
              inLanguage: 'en-GB',
              dateModified: CHRISTMAS_PAGES_UPDATED,
              // the products on this page, each with its own Product markup on its own page
              mainEntity: {
                '@type': 'ItemList',
                itemListElement: products.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}${l.path}`, name: l.title })),
              },
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Christmas', item: `${site}/christmas` },
                { '@type': 'ListItem', position: 2, name: page.h1, item: url },
              ],
            },
            faqPageJsonLd(page.faq, url, `${page.h1} — questions`, CHRISTMAS_PAGES_UPDATED),
          ],
        }}
      />

      <div className="mx-auto max-w-5xl px-6 pb-6 pt-6 md:pt-10">
        <nav aria-label="breadcrumb" className="text-[13px] font-bold text-ink-soft">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/christmas" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-cinnamon hover:underline">
                christmas
              </Link>
            </li>
            <li aria-hidden>
              <Icon icon={IconChevronRight} size={14} />
            </li>
            <li aria-current="page" className="text-cocoa">
              {page.h1.toLowerCase()}
            </li>
          </ol>
        </nav>

        <div className="mt-2 max-w-3xl">
          <CaveatNote className="pop-in -rotate-2 text-[26px] leading-none">{page.note}</CaveatNote>
          <h1 className="pop-in mt-2 font-display text-[36px] leading-[1.04] text-cocoa md:text-5xl" style={{ ['--i' as string]: 1 }}>
            {page.h1}
          </h1>
          <p className="pop-in mt-4 text-[17px] leading-relaxed text-cocoa" style={{ ['--i' as string]: 2 }}>
            {page.answer}
          </p>
          {page.more.map((m) => (
            <LinkedText key={m} text={m} className="mt-3 text-[15px] leading-relaxed text-ink-soft" />
          ))}
          <ChristmasDeadline className="mt-5" />
          {lead ? (
            <div className="mt-6 hidden flex-wrap gap-3 md:flex">
              <Button href={`/start-creating?for=${lead.key}`} size="lg" attention>
                start creating
              </Button>
              <Button href="/christmas" variant="secondary" size="lg">
                all things christmas
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {products.length > 0 ? (
        <section aria-labelledby="the-range" className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <h2 id="the-range" className="px-2 font-display text-2xl text-cocoa sm:px-0 md:text-3xl">
            {products.length === 1 ? 'make it' : 'pick one (or two)'}
          </h2>
          <ul className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-7 ${products.length > 2 ? 'sm:grid-cols-3 lg:grid-cols-4' : 'sm:max-w-xl'}`}>
            {products.map((l, i) => (
              <li key={l.key}>
                <ShopTile listing={l} index={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="questions" className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h2 id="questions" className="font-display text-2xl text-cocoa md:text-3xl">
          questions families ask
        </h2>
        <div className="mt-5">
          <FaqList items={page.faq} />
        </div>
        <p className="mt-6 flex items-center gap-2 text-xs font-semibold text-green-save">
          <Icon icon={IconShieldCheck} size={15} className="shrink-0" /> Your child’s drawings stay private — nothing is ever public.{' '}
          <Link href="/trust/family-promise" className="underline underline-offset-2">
            our promise
          </Link>
        </p>
      </section>

      <section aria-labelledby="more-ideas" className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        <h2 id="more-ideas" className="font-display text-xl text-cocoa">
          more christmas ideas
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2.5">
          {others.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/christmas/${p.slug}`}
                className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]"
              >
                {p.h1.toLowerCase()} <Icon icon={IconArrowRight} size={14} />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/christmas/delivery-dates"
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-leaf-pale px-4 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]"
            >
              last order dates <Icon icon={IconArrowRight} size={14} />
            </Link>
          </li>
        </ul>
      </section>

      <ThumbCta
        href={lead ? `/start-creating?for=${lead.key}` : '/start-creating'}
        label="start creating"
        note={inTime ? 'draw it this weekend · under the tree by christmas' : undefined}
      />
    </>
  );
}
