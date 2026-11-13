import {
  IconBrush,
  IconCalendarHeart,
  IconGift,
  IconHomeHeart,
  IconLock,
  IconPencil,
  IconPlant2,
  IconStairsUp,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { brandSeason, DRAW_LOGO_RATIO, drawBrandFiles } from '@/lib/brand';
import { COMPANY } from '@/lib/company';
import { DRAW_SCREENSHOTS, storeHref } from '@/lib/drawApp';
import { DRAW_FAQ, FAQ_UPDATED } from '@/lib/faq';
import { siteOrigin } from '@/lib/seo';
import { FaqList, faqPageJsonLd } from '@/ui/components/FaqList';
import { JsonLd } from '@/ui/components/JsonLd';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { cn } from '@/ui/cn';
import { DrawFilm } from '@/ui/components/DrawFilm';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { StoreBadges } from '@/ui/components/StoreBadge';
import { PeekScroller } from '@/ui/components/PeekScroller';

/**
 * Snickerdoodle Draw, the companion drawing app (not in a mockup: extended in the Scrapbook language).
 * Every claim here is from the app's own store listing (snickerdoodle-draw docs/store/google-play-listing.md):
 * no invented features or ratings. Talks to parents. Nothing here tracks anyone: self-hosted pictures, the
 * film loads only on play, store links carry nothing extra.
 */
// Screen or paper, side by side (founder, 10 Nov): we value real, physical art, and the app is there to support it, never to replace it.
const DESCRIPTION =
  'An educational drawing app for children aged 3 to 12, made by designers and artists: step-by-step lessons on screen or with real crayons and paper. No ads.';

export function generateMetadata(): Metadata {
  const d = drawBrandFiles(brandSeason());
  return {
    title: 'Snickerdoodle Draw — step-by-step drawing for children',
    description: DESCRIPTION,
    openGraph: {
      siteName: 'Snickerdoodle',
      locale: 'en_GB',
      type: 'website',
      title: 'Snickerdoodle Draw',
      description: DESCRIPTION,
      images: [{ url: d.og, width: 1200, height: 630, alt: 'Snickerdoodle Draw' }],
    },
  };
}

/** The facts, app-store style. "No ads" first and in honey: the one parents look for. */
const FACTS: { label: string; strong?: boolean }[] = [
  { label: 'no ads', strong: true },
  { label: 'educational' },
  { label: 'ages 3 to 12' },
  { label: 'works offline' },
];

const HOW: { icon: TablerIcon; title: string; body: string }[] = [
  { icon: IconStairsUp, title: 'a few friendly steps', body: 'A round body, two ears, a smile. Never marked right or wrong.' },
  { icon: IconBrush, title: 'screen or paper', body: 'Draw on screen, or with crayons and paint, then snap a photo.' },
  { icon: IconPlant2, title: 'grows with them', body: 'From tracing at 3 to shading and faces at 12.' },
  { icon: IconCalendarHeart, title: 'weekly, not daily', body: 'No streaks to lose. A week off is just a rest.' },
];

const TOGETHER: { icon: TablerIcon; title: string; body: string; tape: string }[] = [
  { icon: IconPencil, title: 'draw in the app', body: 'Step by step, on screen or on paper.', tape: 'var(--color-sky)' },
  { icon: IconHomeHeart, title: 'keep it here', body: 'Snap it into your private keepsake box.', tape: 'var(--color-berry)' },
  { icon: IconGift, title: 'make it real', body: 'A print, a mug or a cushion for Grandma.', tape: 'var(--color-leaf)' },
];

export default function DrawPage() {
  const season = brandSeason();
  const d = drawBrandFiles(season);
  const logoW = 400;
  const site = siteOrigin();
  const pageUrl = `${site}/draw`;
  const links = [storeHref('appStore'), storeHref('googlePlay')].filter((l): l is string => l !== null);
  // For search + answer engines: the app itself (only facts from its store listing; no ratings), and the questions.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MobileApplication',
        '@id': `${pageUrl}#app`,
        name: 'Snickerdoodle Draw',
        url: pageUrl,
        description: DESCRIPTION,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'iOS, iPadOS, Android',
        inLanguage: 'en-GB',
        image: `${site}${d.icon}`,
        audience: { '@type': 'PeopleAudience', suggestedMinAge: 3, suggestedMaxAge: 12 },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
        publisher: { '@type': 'Organization', name: 'Snickerdoodle', legalName: COMPANY.legalName, url: site },
        ...(links.length ? { sameAs: links } : {}),
      },
      faqPageJsonLd(DRAW_FAQ, pageUrl, 'Snickerdoodle Draw questions', FAQ_UPDATED),
    ],
  };
  return (
    <>
      {/* ── Hero: the logo, then the app at a glance (store style) and the download buttons ── */}
      <section aria-labelledby="draw-title" className="relative overflow-hidden">
        <FloatingDoodles tone="warm" />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-9 px-6 pb-14 pt-6 md:grid-cols-[1fr_1.15fr] md:gap-14 md:pb-20 md:pt-14">
          <div className="pop-in flex justify-center">
            <div
              className="tape rounded-[24px] border-2 border-cocoa/15 bg-paper px-7 py-8 shadow-[0_6px_14px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:px-12 md:py-14"
              style={{ rotate: '-1.5deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-honey) 80%, transparent)' }}
            >
              <img
                src={d.logo}
                alt=""
                width={logoW}
                height={Math.round(logoW / DRAW_LOGO_RATIO[season])}
                decoding="async"
                className="block h-auto w-[230px] sm:w-[280px] md:w-[400px]"
              />
            </div>
          </div>

          <div className="pop-in min-w-0" style={{ ['--i' as string]: 1 }}>
            {/* Phones: the title shrinks with the screen so "Snickerdoodle" always fits inside the page's margins (founder,
                11 Nov: it ran off the right edge). Desktop is unchanged. */}
            <div className="flex items-center gap-3 md:gap-4">
              <img
                src={d.icon}
                alt=""
                width={88}
                height={88}
                decoding="async"
                className="sticker size-16 shrink-0 rounded-[22%] min-[400px]:size-[72px] md:size-[88px]"
              />
              <div className="min-w-0">
                <h1 id="draw-title" className="font-display text-[clamp(22px,7.4vw,32px)] leading-[1.02] text-cocoa md:text-5xl">
                  Snickerdoodle Draw
                </h1>
                <p className="mt-1 text-sm text-ink-soft">free · made in the UK</p>
              </div>
            </div>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft">
              Step-by-step drawing for little ones, spoken aloud before reading age. On real paper or on screen. No ads, no
              account, nothing uploaded.
            </p>
            {/* one line where it fits; on a narrow phone (or with bigger text) it wraps rather than running off the edge */}
            <ul aria-label="at a glance" className="mt-5 flex flex-wrap gap-1 min-[400px]:gap-1.5 sm:flex-nowrap sm:gap-2">
              {FACTS.map((f) => (
                <li
                  key={f.label}
                  className={cn(
                    'inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border-2 px-1.5 py-1 text-[11px] font-bold min-[400px]:px-2 min-[400px]:text-[12px] sm:px-3 sm:text-[13px]',
                    f.strong ? 'sticker -rotate-2 bg-honey font-extrabold text-cocoa' : 'border-cocoa/25 bg-paper text-ink-soft',
                  )}
                >
                  {f.label}
                </li>
              ))}
            </ul>
            <StoreBadges className="mt-7" />
          </div>
        </div>
      </section>

      {/* ── Why it works: step by step, with real crayons — and the film ── */}
      {/* on the cobalt doodle paper, as the homepage's "from fridge door to forever" band */}
      <section aria-labelledby="learn-title" className="doodle-paper doodle-paper-everyday px-6 py-14 md:py-20">
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.05fr_1fr] md:gap-14">
          <div>
            <CaveatNote className="-rotate-2 text-[26px] leading-none !text-honey">crayons at the ready</CaveatNote>
            <h2 id="learn-title" className="mt-2 font-display text-[32px] leading-[1.05] text-white md:text-[42px]">
              Learning to draw, one little step at a time
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-sky-pale">
              Real drawing skills, learned one step at a time. On screen or on paper, it’s here to help real art along, never to replace it.
            </p>
            <ul className="mt-7 space-y-4">
              {HOW.map((h, i) => (
                <li key={h.title} className="pop-in-view flex items-start gap-4" style={{ ['--i' as string]: i }}>
                  <span aria-hidden className="sticker flex size-11 shrink-0 items-center justify-center rounded-full bg-paper text-cobalt">
                    <Icon icon={h.icon} size={22} />
                  </span>
                  <div>
                    <h3 className="font-display text-[18px] text-white">{h.title}</h3>
                    <p className="mt-0.5 text-[15px] leading-snug text-sky-pale">{h.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <DrawFilm className="pop-in-view" />
        </div>
      </section>

      {/* ── A peek inside: phone and tablet screenshots in one row that scrolls sideways, on phones and desktop ── */}
      <section aria-labelledby="peek-title" className="py-14 md:py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 id="peek-title" className="font-display text-[32px] leading-[1.05] text-cocoa md:text-[42px]">
            A peek inside
          </h2>
        </div>
        <PeekScroller label="app screenshots (scrolls sideways)">
          {DRAW_SCREENSHOTS.map((s, i) => (
            <li
              key={s.src}
              className={cn('flex-none snap-center md:w-auto md:max-w-none', s.width > s.height ? 'w-[82vw] max-w-[440px]' : 'w-[58vw] max-w-[230px]')}
            >
              <figure
                className="polaroid lift pop-in-view rounded-[14px]"
                style={{ ['--tilt' as string]: i % 2 ? '1.5deg' : '-1.5deg', ['--i' as string]: Math.min(i, 3) }}
              >
                <img src={s.src} alt={s.alt} width={s.width} height={s.height} loading="lazy" decoding="async" className="block h-auto w-full rounded-[10px] md:h-[min(34vw,440px)] md:w-auto" />
                <figcaption className="mt-2 px-1 text-center text-[13px] font-bold leading-snug text-ink-soft">{s.caption}</figcaption>
              </figure>
            </li>
          ))}
        </PeekScroller>
      </section>

      {/* ── Better together: draw in the app, keep it here — and the download buttons again ── */}
      {/* on the honey doodle paper (the christmas doodles in season, as the homepage's christmas shelf) */}
      <section
        aria-labelledby="together-title"
        className={cn('doodle-paper px-6 py-14 md:py-20', season === 'christmas' ? 'doodle-paper-christmas' : 'doodle-paper-honey')}
      >
        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="text-center">
            <h2 id="together-title" className="font-display text-[32px] leading-[1.05] text-cocoa md:text-[42px]">
              They&apos;re only little once
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
              The app teaches the drawing. Snickerdoodle keeps it.
            </p>
          </div>

          <ol className="mt-10 grid gap-7 md:grid-cols-3 md:gap-6">
            {TOGETHER.map((t, i) => (
              <li
                key={t.title}
                className="tape pop-in-view rounded-[18px] border-2 border-cocoa/15 bg-paper p-5 shadow-[0_6px_14px_color-mix(in_srgb,var(--color-cocoa)_10%,transparent)]"
                style={{
                  ['--i' as string]: i,
                  ['--tape' as string]: `color-mix(in srgb, ${t.tape} 75%, transparent)`,
                  ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg',
                  rotate: i === 1 ? '0.8deg' : '-0.6deg',
                }}
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden className="sticker flex size-10 shrink-0 items-center justify-center rounded-full bg-honey font-display text-[17px] text-cocoa">
                    {i + 1}
                  </span>
                  <h3 className="flex items-center gap-2 font-display text-[19px] text-cocoa">
                    <Icon icon={t.icon} size={20} className="text-cinnamon" />
                    {t.title}
                  </h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{t.body}</p>
              </li>
            ))}
          </ol>

          <p className="mx-auto mt-6 max-w-2xl text-center text-[14px] text-ink-soft">
            <b className="text-cocoa">Coming soon:</b> link the app, and favourite drawings land in your keepsake box.
          </p>

          <p className="mx-auto mt-8 flex max-w-fit items-center gap-2.5 rounded-pill border-2 border-cocoa/15 bg-leaf-pale px-4 py-2.5 text-sm text-ink-soft">
            <Icon icon={IconLock} size={18} className="shrink-0 text-green-save" />
            <span>
              <b className="text-cocoa">Set up by grown-ups.</b> No chat, no sign-up, settings behind a lock.
            </span>
          </p>

          <div className="mt-10 flex flex-col items-center gap-5 text-center">
            <h3 className="font-display text-[22px] text-cocoa">Get Snickerdoodle Draw</h3>
            <StoreBadges align="center" />
            <Link href="/start-creating" className="inline-flex min-h-11 items-center text-[14px] font-bold text-cinnamon underline underline-offset-4">
              or keep a drawing on snickerdoodle now
            </Link>
          </div>
        </div>
      </section>

      {/* ── Questions parents ask: collapsible, each a real heading, with matching FAQPage structured data ── */}
      <section aria-labelledby="draw-faq-title" className="px-4 py-14 sm:px-6 md:py-20">
        <JsonLd data={jsonLd} />
        <div className="mx-auto max-w-3xl">
          <h2 id="draw-faq-title" className="text-center font-display text-[32px] leading-[1.05] text-cocoa md:text-[42px]">
            Questions parents ask
          </h2>
          <div className="mt-8">
            <FaqList items={DRAW_FAQ} />
          </div>
          <p className="mt-6 text-center text-[14px] text-ink-soft">
            More about keepsakes in our{' '}
            <Link href="/faq" className="font-bold text-cinnamon underline underline-offset-2">
              FAQs
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
