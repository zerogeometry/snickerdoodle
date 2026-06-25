import { IconGift, IconUpload, IconWand } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import type { TablerIconComponent } from '@/ui/primitives/Icon';
import { TrustLine } from '@/ui/primitives/TrustLine';
import { ProductMorph } from '@/ui/components/ProductMorph';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';

type RangeItem = { label: string; tint: string; glyph: ReactNode };

const RANGE: RangeItem[] = [
  {
    label: 'card',
    tint: '#FDF0DC',
    glyph: (
      <svg viewBox="0 0 40 40" width="32" height="32">
        <polygon points="20,5 25,16 37,16 27,23 31,35 20,28 9,35 13,23 3,16 15,16" fill="#F2A640" />
      </svg>
    ),
  },
  {
    label: 'print',
    tint: '#FBE4E1',
    glyph: (
      <svg viewBox="0 0 40 40" width="32" height="32">
        <circle cx="20" cy="20" r="9" fill="#E8786E" />
      </svg>
    ),
  },
  {
    label: 'cushion',
    tint: '#E2F0F4',
    glyph: (
      <svg viewBox="0 0 40 40" width="32" height="32">
        <path d="M20 33 C8 24 4 17 9 12 C13 8 18 11 20 15 C22 11 27 8 31 12 C36 17 32 24 20 33 Z" fill="#84BBD0" />
      </svg>
    ),
  },
  {
    label: 'mug',
    tint: '#E8F0DF',
    glyph: (
      <svg viewBox="0 0 40 40" width="32" height="32">
        <circle cx="18" cy="20" r="7" fill="#93B97C" />
        <line x1="18" y1="27" x2="18" y2="36" stroke="#93B97C" strokeWidth="3" />
      </svg>
    ),
  },
  {
    label: 'storybook',
    tint: '#F6E2D6',
    glyph: (
      <svg viewBox="0 0 40 40" width="32" height="32">
        <rect x="10" y="20" width="20" height="16" rx="1" fill="none" stroke="#C8623A" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M7 22 L20 12 L33 22" fill="none" stroke="#F2A640" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

type Step = { icon: TablerIconComponent; title: string; copy: string };

const STEPS: Step[] = [
  { icon: IconUpload, title: '1 · Upload it', copy: 'Snap their latest masterpiece and pop it in.' },
  { icon: IconWand, title: '2 · See the magic', copy: 'Watch it land on a whole family range in moments.' },
  { icon: IconGift, title: '3 · Keep & give', copy: 'Treasure it, or share a wishlist with the grandparents.' },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative">
        <FloatingDoodles tone="warm" />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-[1.5fr_1fr] md:gap-12 md:py-28">
          <div>
            <CaveatNote className="text-[39px]">they&apos;re only little once</CaveatNote>
            <h1 className="mt-4 font-display text-6xl font-semibold leading-[1.02] tracking-tight md:text-7xl xl:whitespace-nowrap">
              Keep the <span className="text-cinnamon">magic</span>.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#5F564C]">
              Turn your little one&apos;s drawings into beautiful things you&apos;ll treasure forever — cards, prints,
              mugs, tees, and a storybook they&apos;re the hero of.
            </p>
            <div className="hidden md:block">
              <div className="mt-9">
                <Button href="/start-creating" size="lg" attention>
                  start creating
                </Button>
              </div>
              <TrustLine className="mt-6">everything you make is yours</TrustLine>
            </div>
          </div>
          <div className="text-center">
            <ProductMorph />
            <p className="mt-5 font-hand text-[34px] leading-none text-[#6F6358]">by Olivia, age 5</p>
          </div>
        </div>
      </section>

      {/* Range strip */}
      <section className="relative bg-[#D9ECF1] px-6 py-16 md:py-24">
        <FloatingDoodles tone="cool" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h2 className="text-center font-display text-2xl font-semibold text-[#235A68] md:text-3xl">
            A few pictures. A whole family range. In moments.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-[#3E7585]">
            One drawing, turned into everything you&apos;d want to keep or give.
          </p>
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:mt-12 md:grid-cols-5 md:gap-5">
            {RANGE.map((item) => (
              <li
                key={item.label}
                className="rounded-2xl bg-white p-5 text-center shadow-[0_2px_8px_rgba(35,90,104,.1)]"
              >
                <div
                  className="mb-4 flex h-20 items-center justify-center rounded-xl"
                  style={{ background: item.tint }}
                >
                  {item.glyph}
                </div>
                <div className="text-xs font-bold text-[#3E7585]">{item.label}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Three steps */}
      <section className="relative bg-cinnamon px-6 py-16 md:py-24">
        <FloatingDoodles tone="dark" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h2 className="text-center font-display text-2xl font-semibold text-[#FCEFD9] md:text-3xl">
            From fridge door to forever, in three steps
          </h2>
          <ol className="mx-auto mt-12 grid max-w-4xl gap-12 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step) => (
              <li key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-oat">
                  <Icon icon={step.icon} size={28} className="text-cinnamon" />
                </div>
                <h3 className="font-display text-base font-semibold text-white">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-[#F2D7C4]">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative bg-cocoa px-6 py-24 text-center md:py-32">
        <FloatingDoodles tone="dark" />
        <div className="relative z-10">
          <h2 className="font-display text-3xl font-medium leading-snug text-oat md:text-4xl">
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

      {/* Mobile: primary action pinned to the thumb zone */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
        <Button href="/start-creating" size="lg" className="w-full" attention>
          start creating
        </Button>
        <div className="mt-2 flex justify-center">
          <TrustLine>everything you make is yours</TrustLine>
        </div>
      </div>
      <div className="h-24 md:hidden" aria-hidden />
    </>
  );
}
