import { IconArrowRight, IconChristmasTree, IconGift, IconHeart, IconSchool, IconShieldCheck, IconUsers } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { CHRISTMAS_BUNDLE_SLOT, CHRISTMAS_HUB_FAQ, CHRISTMAS_PAGES, CHRISTMAS_PAGES_UPDATED, CHRISTMAS_SHELVES } from '@/lib/christmas-pages';
import { christmasDeadlines, seasonClock } from '@/lib/season';
import { siteOrigin } from '@/lib/seo';
import { shopListings } from '@/server/shop/listing';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { ChristmasDeadline } from '@/ui/components/ChristmasDeadline';
import { FaqList, faqPageJsonLd } from '@/ui/components/FaqList';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { JsonLd } from '@/ui/components/JsonLd';
import { ShopTile } from '@/ui/components/ShopTile';
import { ThumbCta } from '@/ui/components/ThumbCta';

/**
 * /christmas (C6, GTM plan 27 Oct) — the EVERGREEN Christmas hub (never /christmas-2026): live all
 * year so it gains age and links, with the words in src/lib/christmas-pages.ts, the dates from
 * src/lib/season.ts and the prices from the server catalogue. Not in the main nav (founder, 26 Oct:
 * the homepage carries Christmas for shoppers) — this page is for search + answer engines and the
 * links people share. Shelves by WHO IT'S FOR; every tile goes into the same create flow as the shop.
 * Rendered per request (the deadline card is always today's truth).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Christmas gifts made from your child’s drawings',
  description:
    'Christmas ornaments, cards, wrapping paper and gifts for grandparents and teachers — made from your child’s own drawings, in the UK, with free UK delivery. The present they made themselves.',
  alternates: { canonical: '/christmas' },
  openGraph: { title: 'Christmas, drawn by them — Snickerdoodle', description: 'Ornaments, cards, wrapping paper and gifts, made from your child’s drawings.', url: '/christmas', type: 'website' },
};

const SHELF_ICON: Record<string, TablerIconComponent> = { 'for-the-tree': IconChristmasTree, grandparents: IconHeart, teachers: IconSchool, 'the-whole-family': IconUsers };

export default function ChristmasHub() {
  const site = siteOrigin();
  const listings = new Map(shopListings().map((l) => [l.key, l]));
  const bundles = CHRISTMAS_BUNDLE_SLOT.filter((b) => b.href);
  const inTime = christmasDeadlines(seasonClock(new Date())).state === 'upcoming';
  const updated = new Date(`${CHRISTMAS_PAGES_UPDATED}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              '@id': `${site}/christmas`,
              url: `${site}/christmas`,
              name: 'Christmas gifts made from your child’s drawings',
              inLanguage: 'en-GB',
              dateModified: CHRISTMAS_PAGES_UPDATED,
              hasPart: CHRISTMAS_PAGES.map((p) => ({ '@type': 'WebPage', url: `${site}/christmas/${p.slug}`, name: p.h1 })),
            },
            faqPageJsonLd(CHRISTMAS_HUB_FAQ, `${site}/christmas`, 'Christmas questions — Snickerdoodle', CHRISTMAS_PAGES_UPDATED),
          ],
        }}
      />

      <div className="relative">
        <FloatingDoodles tone="warm" />

        {/* Hero — the one handwritten moment, the answer in the first sentence, the photos taped on */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-8 px-6 pb-8 pt-8 md:grid-cols-[1.05fr_1fr] md:gap-10 md:py-14">
          <div>
            <CaveatNote className="pop-in -rotate-2 text-[26px] leading-none md:text-[30px]">the present they made themselves</CaveatNote>
            <h1 className="pop-in mt-2 font-display text-[44px] leading-[0.98] text-cocoa md:text-6xl" style={{ ['--i' as string]: 1 }}>
              Christmas,
              <br />
              drawn by <span className="rounded-lg bg-honey px-2">them</span>.
            </h1>
            <p className="pop-in mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft" style={{ ['--i' as string]: 2 }}>
              Snickerdoodle makes Christmas presents from your child’s own drawings — ornaments for the tree, cards, wrapping
              paper, the 2027 calendar, and gifts for grandparents and teachers — made to order in the UK with free delivery.
            </p>
            <div className="pop-in mt-5 max-w-md" style={{ ['--i' as string]: 3 }}>
              <ChristmasDeadline />
            </div>
            <div className="mt-6 hidden flex-wrap gap-3 md:flex">
              <Button href="/start-creating" size="lg" attention>
                start creating
              </Button>
              <Button href="/gifts" variant="secondary" size="lg">
                send it to the grandparents
              </Button>
            </div>
          </div>
          <div className="relative mx-auto h-[300px] w-full max-w-[400px] sm:h-[360px]">
            <figure
              className="polaroid tape absolute left-0 top-3 w-[80%]"
              style={{ ['--tilt' as string]: '-3deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-cta) 80%, transparent)' }}
            >
              <Image
                src="/christmas/ball-and-present.webp"
                alt="A plastic ball bauble printed with a child’s crayon Christmas tree, beside a present wrapped in that tree on repeat"
                width={1200}
                height={800}
                className="h-auto w-full"
                priority
              />
            </figure>
            <figure
              className="polaroid tape absolute bottom-0 right-0 w-[40%]"
              style={{ ['--tilt' as string]: '6deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-leaf) 85%, transparent)' }}
            >
              <Image src="/christmas/bauble.webp" alt="A flat round ceramic ornament printed with a child’s crayon snowman, hanging on a Christmas tree" width={896} height={1152} className="h-auto w-full" />
            </figure>
          </div>
        </section>

        {/* Who it's for — chips, then a shelf each */}
        <section aria-labelledby="who" className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="who" className="px-2 font-display text-2xl text-cocoa md:text-3xl sm:px-0">
            who’s it for?
          </h2>
          <nav aria-label="who it’s for" className="mt-3 flex flex-wrap gap-2.5 px-2 sm:px-0">
            {CHRISTMAS_SHELVES.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]"
              >
                <Icon icon={SHELF_ICON[s.id] ?? IconGift} size={16} /> {s.label}
              </a>
            ))}
          </nav>

          {CHRISTMAS_SHELVES.map((s) => {
            const items = s.keys.map((k) => listings.get(k)).filter((l) => l !== undefined);
            if (items.length === 0) return null;
            return (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28 pt-10">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-2 sm:px-0">
                  <div>
                    <h3 id={`${s.id}-title`} className="flex items-center gap-2 font-display text-xl text-cocoa md:text-2xl">
                      <Icon icon={SHELF_ICON[s.id] ?? IconGift} size={22} className="text-cinnamon" /> {s.label}
                    </h3>
                    <p className="mt-0.5 text-sm text-ink-soft">{s.line}</p>
                  </div>
                  {s.page ? (
                    <Link href={`/christmas/${s.page}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-cinnamon underline underline-offset-2">
                      more ideas <Icon icon={IconArrowRight} size={15} />
                    </Link>
                  ) : null}
                </div>
                <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
                  {items.map((l, i) => (
                    <li key={l.key}>
                      <ShopTile listing={l} index={i} headingLevel="h4" />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </section>

        {/* ── SLOT: the Christmas bundles (src/lib/christmas-pages.ts → CHRISTMAS_BUNDLE_SLOT). Renders
            only once a bundle has a real public page to link to — never a teaser for one that isn't there. */}
        {bundles.length > 0 ? (
          <section aria-labelledby="bundles" className="relative mx-auto max-w-6xl px-6 pt-12">
            <h2 id="bundles" className="font-display text-2xl text-cocoa md:text-3xl">
              christmas bundles
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {bundles.map((b) => (
                <li key={b.key}>
                  <Link href={b.href!} className="press tape flex min-h-11 flex-col rounded-[20px] border-2 border-cocoa bg-honey-band p-5 shadow-[0_4px_0_var(--color-cocoa)]">
                    <span className="font-display text-xl text-cocoa">{b.name}</span>
                    <span className="mt-1 text-sm text-ink-soft">{b.line}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Send it to the grandparents (the gift-link loop) */}
        <section className="relative mx-auto max-w-6xl px-6 pt-14">
          <div className="flex flex-col gap-4 rounded-[20px] border-2 border-cocoa/15 bg-paper p-5 sm:flex-row sm:items-center">
            <span className="sticker flex h-14 w-14 shrink-0 -rotate-6 items-center justify-center rounded-full bg-berry-pale text-cinnamon">
              <Icon icon={IconGift} size={26} />
            </span>
            <div className="flex-1">
              <h2 className="font-display text-xl text-cocoa">send it to the grandparents</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Share a ready-to-buy link: they tap it, check out as a guest, done. Only the people you send it to can see it.
              </p>
            </div>
            <Button href="/gifts" variant="secondary" size="md">
              how gift links work
            </Button>
          </div>
        </section>

        {/* Looking for one thing? — the intent pages, each answering one question */}
        <section aria-labelledby="ideas" className="relative mx-auto max-w-6xl px-6 pt-12">
          <h2 id="ideas" className="font-display text-2xl text-cocoa md:text-3xl">
            looking for something in particular?
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHRISTMAS_PAGES.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/christmas/${p.slug}`}
                  className="press flex min-h-14 items-center justify-between gap-3 rounded-[16px] border-2 border-cocoa bg-paper px-4 py-3 font-extrabold text-cocoa shadow-[0_3px_0_var(--color-cocoa)] hover:bg-honey-band"
                >
                  <span>{p.h1.toLowerCase()}</span>
                  <Icon icon={IconArrowRight} size={18} className="shrink-0 text-cinnamon" />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/christmas/delivery-dates"
                className="press flex min-h-14 items-center justify-between gap-3 rounded-[16px] border-2 border-cocoa bg-leaf-pale px-4 py-3 font-extrabold text-cocoa shadow-[0_3px_0_var(--color-cocoa)]"
              >
                <span>christmas last order dates</span>
                <Icon icon={IconArrowRight} size={18} className="shrink-0 text-green-save" />
              </Link>
            </li>
          </ul>
        </section>

        {/* Christmas questions (answer-first; FAQPage data from the same list) */}
        <section aria-labelledby="xmas-faq" className="relative mx-auto max-w-3xl px-4 pb-14 pt-14 sm:px-6">
          <h2 id="xmas-faq" className="text-center font-display text-3xl text-cocoa">
            christmas questions
          </h2>
          <div className="mt-6">
            <FaqList items={CHRISTMAS_HUB_FAQ} />
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-green-save">
            <Icon icon={IconShieldCheck} size={15} /> Your child’s drawings stay private — nothing is ever public.
          </p>
          <p className="mt-3 text-center text-[13px] text-ink-faint">
            Last checked and updated <time dateTime={CHRISTMAS_PAGES_UPDATED}>{updated}</time>.
          </p>
        </section>
      </div>

      <ThumbCta href="/start-creating" label="start creating" note={inTime ? 'draw it this weekend · under the tree by christmas' : undefined} />
    </>
  );
}
