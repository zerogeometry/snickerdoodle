import { IconGift, IconUpload, IconWand } from '@tabler/icons-react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import type { TablerIconComponent } from '@/ui/primitives/Icon';
import { TrustLine } from '@/ui/primitives/TrustLine';
import { ExampleMorph } from '@/ui/components/ExampleMorph';
import { ExampleCarousel } from '@/ui/components/ExampleCarousel';
import { RangeHero } from '@/ui/components/RangeHero';
import { exampleBySlug } from '@/lib/examples';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { DesignFromScratch } from '@/ui/components/DesignFromScratch';
import { ChristmasHeroVisual } from '@/ui/components/ChristmasHeroVisual';
import { isChristmasSeason, seasonClock } from '@/lib/season';
import Image from 'next/image';
import Link from 'next/link';

/** The range strip: real keepsakes, one per product we sell (founder-made examples). */
const RANGE = [
  { label: 'framed print', slug: 'zebra-framed-print' },
  { label: 'cushion', slug: 'tractor-cushion' },
  { label: 'mug', slug: 'family-mug' },
  { label: 'heart cushion', slug: 'rainbow-heart-cushion' },
  { label: 'card', slug: 'puppy-card' },
].map((r) => ({ ...r, example: exampleBySlug(r.slug) }));

/** The six files the range hero needs; until they're all there, the hero falls back to the morph. */
const RANGE_HERO_FILES = ['drawing', 'framed-print', 'heart-cushion', 'jigsaw', 'card', 'blanket'];
function rangeHeroReady(): boolean {
  return RANGE_HERO_FILES.every((f) => existsSync(path.join(process.cwd(), 'public', 'examples', 'range', `${f}.webp`)));
}

type Step = { icon: TablerIconComponent; title: string; copy: string };

const STEPS: Step[] = [
  { icon: IconUpload, title: '1 · Upload it', copy: 'Snap their latest masterpiece and pop it in.' },
  { icon: IconWand, title: '2 · See the magic', copy: 'Watch it land on a whole family range in moments.' },
  { icon: IconGift, title: '3 · Keep & give', copy: 'Treasure it, or share a wishlist with the grandparents.' },
];

const TAPE = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)', 'rgb(246 196 69 / .8)'];

/** The Christmas shelf under the hero, in season (D24): three placeholder photos into /christmas. */
const XMAS_SHELF = [
  { src: '/christmas/bauble.webp', w: 896, h: 1152, label: 'this year’s bauble', alt: 'A ceramic bauble printed with a child’s crayon snowman' },
  { src: '/christmas/presents.webp', w: 1200, h: 800, label: 'wrapping paper', alt: 'Presents wrapped in papers printed with children’s drawings on repeat' },
  { src: '/christmas/sack.webp', w: 1000, h: 778, label: 'christmas sack', alt: 'A cotton Christmas sack printed with a child’s crayon reindeer' },
];

export default function LandingPage() {
  // Christmas (D24): 1 Nov → 6 Jan the hero becomes the Christmas one (mockups/christmas, screen 1).
  const christmas = isChristmasSeason(seasonClock(new Date()));
  const heroVisual = christmas ? <ChristmasHeroVisual /> : rangeHeroReady() ? <RangeHero /> : <ExampleMorph />;
  return (
    <>
      {/* Hero — the one handwritten moment, the headline, and the drawing taped to the page */}
      <section className="relative overflow-hidden">
        <FloatingDoodles tone="warm" />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-10 md:grid-cols-[1.4fr_1fr] md:gap-12 md:py-24">
          <div>
            <CaveatNote
              className={`pop-in -rotate-2 leading-none tracking-tight md:text-[40px] ${christmas ? 'text-[26px] leading-tight md:whitespace-nowrap' : 'whitespace-nowrap text-[30px]'}`}
            >
              {christmas ? 'the present they made themselves' : <>they&apos;re only little once</>}
            </CaveatNote>
            <h1
              className="pop-in mt-3 font-display text-[58px] leading-[0.95] tracking-tight md:text-7xl xl:whitespace-nowrap"
              style={{ ['--i' as string]: 1 }}
            >
              Keep the{' '}
              <span className="relative inline-block">
                <span className="relative z-10 rounded-lg bg-honey px-2">magic</span>
                <svg aria-hidden viewBox="0 0 200 20" className="absolute -bottom-3 left-0 w-full" preserveAspectRatio="none">
                  <path
                    className="scribble"
                    style={{ ['--len' as string]: 230 }}
                    d="M4 12 C40 4, 70 18, 104 10 S170 4, 196 12"
                    fill="none"
                    stroke="var(--color-cta)"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              {christmas ? <span className="mt-1 block text-[46px] md:text-6xl">this christmas.</span> : '.'}
            </h1>
            {/* Phones: the keepsakes come straight after the headline — no scrolling to see the magic */}
            <div className="mx-auto mt-6 w-full max-w-[300px] md:hidden">{heroVisual}</div>
            <p className="pop-in mt-7 max-w-md text-lg leading-relaxed text-ink-soft" style={{ ['--i' as string]: 2 }}>
              {christmas ? (
                <>
                  Baubles, cards, wrapping paper and the 2027 calendar — made from their own drawings, and posted in time
                  for christmas. Draw it this weekend.
                </>
              ) : (
                <>
                  Turn your little one&apos;s drawings into beautiful things you&apos;ll treasure forever — framed prints,
                  mugs, cushions, jigsaws, blankets and cards.
                </>
              )}
            </p>
            <div className="hidden md:block">
              <div className="pop-in mt-9 flex flex-wrap items-center gap-3" style={{ ['--i' as string]: 3 }}>
                <Button href="/start-creating" size="lg" attention>
                  start creating
                </Button>
                {christmas ? (
                  <Button href="/christmas" variant="secondary" size="lg">
                    the christmas range
                  </Button>
                ) : (
                  <DesignFromScratch />
                )}
              </div>
              <TrustLine className="mt-6">everything you make is yours</TrustLine>
            </div>
          </div>

          <div className="relative mx-auto hidden w-full max-w-[420px] md:block">{heroVisual}</div>
        </div>
      </section>

      {/* Christmas shelf (in season only) — three taped snapshots into /christmas */}
      {christmas ? (
        <section className="relative bg-honey-band px-6 py-12 md:py-16" aria-labelledby="xmas-shelf">
          <div className="relative z-10 mx-auto max-w-6xl">
            <h2 id="xmas-shelf" className="text-center font-display text-3xl text-cocoa md:text-4xl">
              Christmas, drawn by them
            </h2>
            <ul className="mt-9 grid grid-cols-3 gap-4 md:gap-8">
              {XMAS_SHELF.map((it, i) => (
                <li key={it.label}>
                  <Link
                    href="/christmas"
                    className="polaroid tape lift block text-center"
                    style={{ ['--tilt' as string]: i % 2 ? '2deg' : '-2deg', ['--tape' as string]: TAPE[i], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}
                  >
                    <span className="relative mb-2 block aspect-square overflow-hidden bg-paper-2">
                      <Image src={it.src} alt={it.alt} fill sizes="(min-width: 768px) 30vw, 33vw" className="object-cover" />
                    </span>
                    <span className="text-xs font-extrabold text-cocoa md:text-sm">{it.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 text-center">
              <Button href="/christmas" size="lg">
                see the christmas range
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Range strip — every product as a taped snapshot */}
      <section className="relative bg-sky-pale px-6 py-16 md:py-24">
        <FloatingDoodles tone="cool" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl text-cobalt-deep md:text-4xl">
            A few pictures. A whole family range. In moments.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-[15px] text-cobalt-deep">
            One drawing, turned into everything you&apos;d want to keep or give.
          </p>
          {/* phones: four, two by two (the fifth joins from md up, five across) */}
          <ul className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-5">
            {RANGE.map((item, i) => (
              <li
                key={item.label}
                className={`polaroid tape lift pop-in text-center ${i >= 4 ? 'max-md:hidden' : ''}`}
                style={{ ['--tilt' as string]: i % 2 ? '2deg' : '-2deg', ['--tape' as string]: TAPE[i], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg', ['--i' as string]: i }}
              >
                <div className="mb-2 flex aspect-square items-center justify-center bg-paper-2 p-2">
                  <img
                    src={item.example.src}
                    alt={item.example.alt}
                    width={item.example.width}
                    height={item.example.height}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="text-sm font-extrabold text-cocoa">{item.label}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* A scrapbook wall of real keepsakes */}
      <section className="relative px-6 py-16 md:py-24">
        <div className="relative z-10 mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl text-cocoa md:text-4xl">Made from little drawings, kept for years</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-[15px] text-ink-soft">
            A peek inside a few families&apos; keepsake boxes — every one started life on the fridge door.
          </p>
          <ExampleCarousel className="mt-10" />
        </div>
      </section>

      {/* Three steps — numbered stickers on cobalt */}
      <section className="relative bg-cobalt px-6 py-16 md:py-24">
        <FloatingDoodles tone="dark" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl text-white md:text-4xl">From fridge door to forever, in three steps</h2>
          <ol className="mx-auto mt-12 grid max-w-4xl gap-12 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="text-center">
                <div
                  className="wiggle mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-cocoa bg-honey shadow-[0_4px_0_var(--color-cocoa)]"
                  style={{ rotate: i === 1 ? '6deg' : '-6deg' }}
                >
                  <Icon icon={step.icon} size={28} className="text-cocoa" />
                </div>
                <h3 className="font-display text-lg text-white">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-[15px] leading-relaxed text-sky-pale">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative bg-cocoa px-6 py-24 text-center md:py-32">
        <FloatingDoodles tone="dark" />
        <div className="relative z-10">
          <h2 className="font-display text-4xl leading-tight text-oat md:text-5xl">
            They&apos;re only little once.
            <br />
            Let&apos;s keep some of it.
          </h2>
          <div className="mt-10 flex justify-center">
            <Button href="/start-creating" size="lg" attention>
              start creating
            </Button>
          </div>
        </div>
      </section>

      {/* Mobile: primary action pinned to the thumb zone, app-style */}
      <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_rgba(43,33,24,.12)] md:hidden">
        <Button href="/start-creating" size="lg" className="w-full" attention>
          start creating
        </Button>
        <DesignFromScratch variant="ghost" size="sm" className="mt-1 w-full" label="or design from scratch" />
        <div className="mt-1 flex justify-center">
          <TrustLine>everything you make is yours</TrustLine>
        </div>
      </div>
      <div className="h-28 md:hidden" aria-hidden />
    </>
  );
}
