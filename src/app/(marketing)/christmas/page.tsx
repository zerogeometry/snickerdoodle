import { IconChristmasTree, IconGift, IconHeart, IconPackage, IconSchool, IconShieldCheck, IconUsers } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { definedPriceList } from '@/server/catalogue';
import { FAQ, plainAnswer } from '@/lib/faq';
import { exampleBySlug } from '@/lib/examples';
import { PARCEL_SAVING_PER_EXTRA_PENCE } from '@/pricing/parcels';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { ProductArt } from '@/ui/components/ProductArt';
import { ChristmasPromise } from '@/ui/components/ChristmasPromise';

/**
 * /christmas (D24; mockups/christmas, screen 5) — an EVERGREEN page (never /christmas-2026), live all
 * year so it gains age and links; the copy + dates come from src/lib/season.ts and the catalogue, so
 * next Christmas is an edit, not a rebuild. Every tile goes into the SAME create flow as the rest of
 * the shop (`/start-creating?for=<product>`) — Christmas works with the catalogue, never beside it.
 */
export const metadata: Metadata = {
  title: 'Christmas gifts made from your child’s drawings',
  description:
    'Christmas baubles, cards, wrapping paper, sacks and the 2027 calendar — made from your child’s own drawings, in the UK, with free delivery. The present they made themselves.',
  alternates: { canonical: '/christmas' },
  openGraph: { title: 'Christmas, drawn by them — Snickerdoodle', description: 'Baubles, cards, wrapping paper and more, made from your child’s drawings.', url: '/christmas', type: 'website' },
};

/** Who it's for → the products that suit them (only those on show in the shop appear). */
const FOR: { id: string; label: string; icon: typeof IconHeart; keys: string[] }[] = [
  { id: 'for-the-tree', label: 'for the tree', icon: IconChristmasTree, keys: ['bauble', 'sack', 'wrappingPaper', 'cardPack'] },
  { id: 'grandparents', label: 'grandparents', icon: IconHeart, keys: ['calendar', 'mug', 'teaTowel', 'bauble', 'framedPrint', 'cushion'] },
  { id: 'teacher', label: 'teacher', icon: IconSchool, keys: ['mug', 'teaTowel', 'card'] },
  { id: 'the-whole-family', label: 'the whole family', icon: IconUsers, keys: ['kidsJumper', 'christmasJumper', 'kidsTee', 'adultTee', 'socks', 'playingCards'] },
];

/** The lowest live price per product on show (the catalogue is the one source of truth). */
function shown(): Map<string, number> {
  const lowest = new Map<string, number>();
  for (const r of definedPriceList()) {
    if (!r.visibleInShop || r.paused) continue;
    lowest.set(r.productKey, Math.min(lowest.get(r.productKey) ?? Infinity, r.pricePence));
  }
  return lowest;
}
const gbp = (p: number) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;

const LABELS: Record<string, { name: string; line: string }> = {
  bauble: { name: 'this year’s bauble', line: 'one for every christmas they’re little' },
  sack: { name: 'christmas sack', line: 'where the magic waits on christmas eve' },
  wrappingPaper: { name: 'wrapping paper', line: 'every present wrapped in their art' },
  cardPack: { name: 'christmas cards', line: 'a different drawing on every card' },
  card: { name: 'a card for teacher', line: 'one little masterpiece' },
  calendar: { name: '2027 calendar', line: 'a year of their masterpieces' },
  mug: { name: 'mug', line: 'a morning cuppa, made magic' },
  teaTowel: { name: 'tea towel', line: 'for gran’s kitchen' },
  framedPrint: { name: 'framed print', line: 'their masterpiece, ready to hang' },
  cushion: { name: 'cushion', line: 'a squishy keepsake for the sofa' },
  kidsJumper: { name: 'kids jumper', line: 'the christmas jumper they drew' },
  christmasJumper: { name: 'christmas jumper', line: 'matching ones for the grown-ups' },
  kidsTee: { name: 'kids tee', line: 'worn with pride' },
  adultTee: { name: 'adult tee', line: 'for their biggest fan' },
  socks: { name: 'socks', line: 'on repeat, on your feet' },
  playingCards: { name: 'playing cards', line: 'for family card nights' },
};

export default function ChristmasPage() {
  const prices = shown();
  const card = exampleBySlug('christmascard');
  const tee = exampleBySlug('christmastee');
  const christmasFaq = FAQ.find((s) => s.id === 'christmas')?.items ?? [];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: christmasFaq.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: plainAnswer(it.a) } })),
  };

  return (
    <div className="relative">
      <FloatingDoodles tone="warm" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 md:grid-cols-[1.05fr_1fr] md:py-16">
        <div>
          <CaveatNote className="pop-in -rotate-2 text-[26px] leading-none md:text-[30px]">the present they made themselves</CaveatNote>
          <h1 className="pop-in mt-2 font-display text-[44px] leading-[0.98] text-cocoa md:text-6xl" style={{ ['--i' as string]: 1 }}>
            Christmas,
            <br />
            drawn by <span className="bg-[linear-gradient(transparent_55%,var(--color-honey)_55%_92%,transparent_92%)]">them</span>.
          </h1>
          <p className="pop-in mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft" style={{ ['--i' as string]: 2 }}>
            Baubles, cards, wrapping paper and the 2027 calendar — made in the UK from your little one’s drawings, and
            posted to whoever needs a happy cry this year.
          </p>
          <div className="pop-in mt-6 flex flex-wrap gap-3" style={{ ['--i' as string]: 3 }}>
            <Button href="/start-creating" size="lg" attention>
              start creating
            </Button>
            <Button href="/christmas/delivery-dates" variant="secondary" size="lg">
              christmas dates
            </Button>
          </div>
          <div className="mt-4">
            <ChristmasPromise productKey="bauble" />
          </div>
        </div>
        <div className="relative mx-auto mb-6 h-[420px] w-full max-w-[440px] sm:h-[380px] md:mb-0">
          <figure className="polaroid tape absolute left-0 top-2 w-[68%]" style={{ ['--tilt' as string]: '-3deg', ['--tape' as string]: 'repeating-linear-gradient(-45deg, rgb(200 64 42 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)' }}>
            <Image src={card.src} alt={card.alt} width={card.width} height={card.height} className="h-auto w-full" priority />
            <figcaption className="mt-1 text-center font-hand text-sm text-ink-soft">{card.caption}</figcaption>
          </figure>
          <figure className="polaroid tape absolute bottom-0 right-0 w-[52%]" style={{ ['--tilt' as string]: '5deg', ['--tape' as string]: 'repeating-linear-gradient(-45deg, rgb(127 166 94 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)' }}>
            <Image src={tee.src} alt={tee.alt} width={tee.width} height={tee.height} className="h-auto w-full" />
          </figure>
        </div>
      </section>

      {/* Who it's for */}
      <section aria-labelledby="who" className="relative mx-auto max-w-6xl px-6">
        <h2 id="who" className="font-display text-2xl text-cocoa">who’s it for?</h2>
        <nav aria-label="who it’s for" className="mt-3 flex flex-wrap gap-2.5">
          {FOR.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
              <Icon icon={f.icon} size={16} /> {f.label}
            </a>
          ))}
        </nav>

        {FOR.map((f) => {
          const keys = f.keys.filter((k) => prices.has(k));
          if (keys.length === 0) return null;
          return (
            <div key={f.id} id={f.id} className="scroll-mt-28 pt-10">
              <h3 className="flex items-center gap-2 font-display text-xl text-cocoa">
                <Icon icon={f.icon} size={20} className="text-cinnamon" /> {f.label}
              </h3>
              <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {keys.map((k) => (
                  <li key={k} className="flex flex-col">
                    <Link
                      href={`/start-creating?for=${k}`}
                      className="press flex flex-1 flex-col overflow-hidden rounded-[18px] border-2 border-cocoa bg-paper shadow-[0_4px_0_var(--color-cocoa)]"
                    >
                      <span className="flex aspect-square items-center justify-center bg-paper-2">
                        <ProductArt product={k} size={120} />
                      </span>
                      <span className="flex flex-1 flex-col p-3">
                        <span className="font-extrabold text-cocoa">{LABELS[k]?.name ?? k}</span>
                        <span className="mt-0.5 text-xs text-ink-soft">{LABELS[k]?.line}</span>
                        <span className="mt-2 text-sm font-extrabold text-cocoa">from {gbp(prices.get(k)!)}</span>
                      </span>
                    </Link>
                    <div className="mt-2">
                      <ChristmasPromise productKey={k} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* The honest bundle (D24: no Black Friday discount) */}
      <section className="relative mx-auto max-w-6xl px-6 pt-14">
        <div className="tape flex flex-col gap-4 rounded-[20px] border-2 border-cocoa bg-honey-band p-5 shadow-[0_4px_0_var(--color-cocoa)] sm:flex-row sm:items-center">
          <span className="sticker flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper text-cinnamon">
            <Icon icon={IconPackage} size={26} />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl text-cocoa">same parcel, {gbp(PARCEL_SAVING_PER_EXTRA_PENCE)} off each extra</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              A bauble and a mug, two rolls of wrap, a sack and a tea towel — when things are made and packed together,
              posting them costs us less, so we take {gbp(PARCEL_SAVING_PER_EXTRA_PENCE)} off every extra one. Automatically, at
              checkout. No Black Friday games.
            </p>
          </div>
        </div>
      </section>

      {/* Send it to the grandparents */}
      <section className="relative mx-auto max-w-6xl px-6 pt-10">
        <div className="flex flex-col gap-4 rounded-[20px] border-2 border-cocoa/15 bg-paper p-5 sm:flex-row sm:items-center">
          <span className="sticker flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-berry-pale text-cinnamon">
            <Icon icon={IconGift} size={26} />
          </span>
          <div className="flex-1">
            <CaveatNote className="text-lg leading-none">they’ll cry, in a good way</CaveatNote>
            <h2 className="mt-1 font-display text-xl text-cocoa">send it to the grandparents</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Share a ready-to-buy link: they tap it, check out as a guest, done. Only the people you send it to can see it.
            </p>
          </div>
          <Button href="/gifts" variant="secondary" size="lg">
            how gift links work
          </Button>
        </div>
      </section>

      {/* Christmas questions (answer-first, FAQPage data from the same list) */}
      <section aria-labelledby="xmas-faq" className="relative mx-auto max-w-3xl px-6 py-14">
        <h2 id="xmas-faq" className="text-center font-display text-3xl text-cocoa">christmas questions</h2>
        <div className="mt-6 space-y-3">
          {christmasFaq.map((it) => (
            <details key={it.id} className="group rounded-[16px] border-2 border-cocoa/15 bg-paper p-4 open:border-cocoa/40">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-extrabold text-cocoa">
                {it.q}
                <span aria-hidden className="text-cinnamon transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{plainAnswer(it.a)}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-green-save">
          <Icon icon={IconShieldCheck} size={15} /> Your child’s drawings stay private — nothing is ever public, and they’re
          never used to train anything.
        </p>
      </section>
    </div>
  );
}
