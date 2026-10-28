'use client';

import { IconCalendarHeart, IconCake, IconConfetti, IconEgg, IconGift, IconHeart, IconPlus, IconSparkles, IconStar, IconTree, IconUsers } from '@tabler/icons-react';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/**
 * DEV-ONLY design review (founder, 27 Oct): three takes on "your family circles" in the Scrapbook
 * look, the calendar + coming-up feed, and the "days we celebrate" settings. Mock data, no child's
 * picture. Not linked anywhere; 404 in production.
 */
type Person = { name: string; role: string; ring: 'home' | 'family' | 'extended'; colour: string; kid?: boolean };
const PEOPLE: Person[] = [
  { name: 'Simon', role: 'you', ring: 'home', colour: 'var(--color-honey)' },
  { name: 'Olivia', role: 'age 5', ring: 'home', colour: 'var(--color-berry)', kid: true },
  { name: 'Max', role: 'age 8', ring: 'home', colour: 'var(--color-sky)', kid: true },
  { name: 'Jo', role: 'parent', ring: 'family', colour: 'var(--color-leaf)' },
  { name: 'Rosie', role: 'grandma', ring: 'extended', colour: 'var(--color-berry-pale)' },
  { name: 'Pete', role: 'grandad', ring: 'extended', colour: 'var(--color-honey-band)' },
  { name: 'Aunt Kate', role: 'aunt', ring: 'extended', colour: 'var(--color-sky-pale)' },
  { name: 'Uncle Dan', role: 'uncle', ring: 'extended', colour: 'var(--color-leaf-pale)' },
  { name: 'Priya', role: 'close friend', ring: 'extended', colour: 'var(--color-paper-2)' },
];
const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .8)', 'rgb(232 120 110 / .75)', 'rgb(127 166 94 / .75)'];

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mx-auto mt-14 max-w-5xl px-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-cinnamon">{note}</p>
      <h2 className="font-display text-3xl font-extrabold text-cocoa">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Initial({ p, size = 56 }: { p: Person; size?: number }) {
  return (
    <span className="sticker flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-cocoa" style={{ width: size, height: size, background: p.colour, fontSize: size * 0.4 }}>
      {p.name[0]}
    </span>
  );
}

function Stats() {
  const s = [
    { n: '9', l: 'people', i: IconUsers },
    { n: '3', l: 'generations', i: IconTree },
    { n: '41', l: 'keepsakes kept', i: IconHeart },
    { n: '6', l: 'occasions', i: IconCalendarHeart },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {s.map((x, i) => (
        <div key={x.l} className="sticker rounded-[16px] bg-paper px-3 py-3 text-center" style={{ rotate: `${i % 2 ? 1.5 : -1.5}deg` }}>
          <Icon icon={x.i} size={18} className="mx-auto text-cinnamon" />
          <p className="font-display text-3xl font-extrabold text-cocoa">{x.n}</p>
          <p className="text-xs font-bold text-ink-soft">{x.l}</p>
        </div>
      ))}
    </div>
  );
}

/* ── A: the pinboard — taped polaroid portraits in three rows, string between them ── */
function Pinboard() {
  const row = (ring: Person['ring'], label: string, sub: string, tape: string) => (
    <div className="relative">
      <span className="sticker absolute -left-1 -top-3 z-10 -rotate-3 rounded-pill bg-honey px-3 py-1 text-xs font-extrabold text-cocoa" style={{ background: tape }}>
        {label}
      </span>
      <div className="flex flex-wrap items-end justify-center gap-5 rounded-[20px] border-2 border-dashed border-cocoa/20 px-4 pb-5 pt-7">
        {PEOPLE.filter((p) => p.ring === ring).map((p, i) => (
          <figure key={p.name} className="polaroid tape w-[104px]" style={{ ['--tilt' as string]: `${i % 2 ? 2.5 : -2.5}deg`, ['--tape' as string]: TAPES[(i + 1) % 4] }}>
            <div className="flex aspect-square items-center justify-center" style={{ background: p.colour }}>
              <span className="font-display text-4xl font-extrabold text-cocoa">{p.name[0]}</span>
            </div>
            <figcaption className="mt-1.5 text-center">
              <span className="block text-[13px] font-extrabold leading-tight text-cocoa">{p.name}</span>
              <span className="block text-[11px] text-ink-soft">{p.role}</span>
            </figcaption>
          </figure>
        ))}
        {ring === 'extended' ? (
          <button className="press flex h-[132px] w-[104px] flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-tomato bg-paper-2 text-cinnamon">
            <Icon icon={IconPlus} size={22} />
            <span className="text-xs font-bold">invite</span>
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-center text-xs text-ink-soft">{sub}</p>
    </div>
  );
  return (
    <div className="kraft rounded-[28px] border-2 border-cocoa/10 p-6 shadow-[0_6px_18px_rgb(43_33_24/0.08)]">
      <div className="text-center">
        <CaveatNote className="text-xl">the whole gang</CaveatNote>
        <p className="font-display text-4xl font-extrabold text-cocoa">The Jewell Family</p>
      </div>
      <div className="mt-6">
        <Stats />
      </div>
      <div className="mt-8 grid gap-8">
        {row('home', 'home', 'you and the little ones — every keepsake starts here', TAPES[0]!)}
        {row('family', 'family circle', 'sees everything you share with family', TAPES[1]!)}
        {row('extended', 'extended family', 'grandparents, aunts, uncles and close friends — sees what you share with them', TAPES[3]!)}
      </div>
    </div>
  );
}

/* ── B: the doodled family tree — crayon trunk, branches, sticker people as fruit ── */
function DoodleTree() {
  // [left %, top %] in the picture: home on the honey blob, family beside it, extended in the canopy
  const at: Record<string, [number, number]> = {
    Simon: [42, 62], Olivia: [51, 66], Max: [60, 62],
    Jo: [72, 52],
    Rosie: [20, 44], Pete: [30, 22], 'Aunt Kate': [50, 14], 'Uncle Dan': [70, 22], Priya: [82, 40],
  };
  return (
    <div className="relative overflow-hidden rounded-[28px] border-2 border-cocoa/10 bg-paper p-4 shadow-[0_6px_18px_rgb(43_33_24/0.08)]">
      <div className="relative mx-auto aspect-[16/11] max-w-3xl">
        <svg viewBox="0 0 100 69" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* canopy — three crayon blobs, one per circle */}
          <path d="M8 36 C2 18 22 2 46 4 C70 0 94 14 92 34 C96 50 74 58 50 54 C26 58 10 52 8 36Z" fill="var(--color-leaf-pale)" stroke="var(--color-leaf)" strokeWidth=".6" strokeDasharray="1.6 .7" />
          <path d="M30 44 C28 34 42 30 52 32 C64 30 72 38 68 46 C66 54 52 56 44 54 C36 56 31 50 30 44Z" fill="var(--color-honey-band)" stroke="var(--color-sunshine-deep)" strokeWidth=".5" strokeDasharray="1.4 .7" />
          {/* trunk */}
          <path d="M45 69 C46 62 44 58 46 52 L52 52 C53 58 52 63 54 69Z" fill="#b98b5e" stroke="var(--color-cocoa)" strokeWidth=".5" />
          <path d="M47 55 C40 48 34 44 28 38 M51 55 C58 47 66 42 74 36" stroke="#b98b5e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        {PEOPLE.map((p) => {
          const [x, y] = at[p.name]!;
          return (
            <div key={p.name} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
              <Initial p={p} size={p.ring === 'home' ? 58 : 48} />
              <span className="mt-1 rounded-pill bg-paper/90 px-2 text-[11px] font-extrabold text-cocoa">{p.name}</span>
            </div>
          );
        })}
        <span className="sticker absolute left-[6%] top-[6%] -rotate-6 rounded-pill bg-leaf-pale px-3 py-1 text-xs font-extrabold text-cocoa">extended family</span>
        <span className="sticker absolute left-[26%] top-[72%] -rotate-3 rounded-pill bg-honey-band px-3 py-1 text-xs font-extrabold text-cocoa">home + family</span>
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">grows a leaf every time someone joins — tap a person to see what they can see and do</p>
    </div>
  );
}

/* ── C: the sticker-sheet rings — crayon-scribble rings, washi labels, chunky stickers ── */
function StickerRings() {
  const ring: Record<Person['ring'], { r: number; people: Person[] }> = {
    home: { r: 0, people: PEOPLE.filter((p) => p.ring === 'home') },
    family: { r: 27, people: PEOPLE.filter((p) => p.ring === 'family') },
    extended: { r: 43, people: PEOPLE.filter((p) => p.ring === 'extended') },
  };
  const placed: { p: Person; x: number; y: number }[] = [];
  ring.home.people.forEach((p, i) => placed.push({ p, x: 50 + (i - 1) * 11, y: 50 }));
  // on each ring's own ellipse (the SVG's rx/ry as % of the box), spread evenly around it
  const ell = { family: { rx: 31.25, ry: 30 }, extended: { rx: 48.75, ry: 47 } } as const;
  (['family', 'extended'] as const).forEach((k) => {
    const { people } = ring[k];
    const { rx, ry } = ell[k];
    people.forEach((p, i) => {
      const a = (k === 'family' ? -0.6 : -2.4) + (i * 2 * Math.PI) / (k === 'extended' ? people.length + 1 : Math.max(1, people.length));
      placed.push({ p, x: 50 + Math.cos(a) * rx, y: 50 + Math.sin(a) * ry });
    });
  });
  return (
    <div className="rounded-[28px] border-2 border-cocoa/10 bg-oat p-4 shadow-[0_6px_18px_rgb(43_33_24/0.08)]">
      <div className="relative mx-auto aspect-[16/10] max-w-3xl">
        <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="80" cy="50" rx="78" ry="47" fill="var(--color-sky-pale)" stroke="var(--color-cobalt)" strokeWidth=".7" strokeDasharray="3 1.2" />
          <ellipse cx="80" cy="50" rx="50" ry="30" fill="var(--color-berry-pale)" stroke="var(--color-tomato)" strokeWidth=".7" strokeDasharray="3 1.2" />
          <ellipse cx="80" cy="50" rx="26" ry="15" fill="var(--color-honey-band)" stroke="var(--color-sunshine-deep)" strokeWidth=".7" />
        </svg>
        {placed.map(({ p, x, y }) => (
          <div key={p.name} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <Initial p={p} size={p.ring === 'home' ? 52 : 46} />
            <span className="mt-0.5 text-[11px] font-extrabold text-cocoa">{p.name}</span>
          </div>
        ))}
        <span className="absolute left-[3%] top-[3%] -rotate-3 px-3 py-1 text-xs font-extrabold text-cocoa" style={{ background: TAPES[1] }}>extended · 5</span>
        <span className="absolute left-[24%] top-[20%] rotate-2 px-3 py-1 text-xs font-extrabold text-cocoa" style={{ background: TAPES[2] }}>family · 1</span>
        <span className="sticker absolute right-[2%] top-[2%] rotate-3 rounded-pill bg-paper px-3 py-1.5 text-xs font-extrabold text-cocoa">
          <Icon icon={IconPlus} size={13} className="mr-1 inline text-cinnamon" />invite someone
        </span>
      </div>
    </div>
  );
}

/* ── the calendar + coming up, on paper ── */
const EVENTS: Record<number, { colour: string; label: string; icon: typeof IconCake }> = {
  4: { colour: 'var(--color-berry)', label: 'Olivia turns 6', icon: IconCake },
  13: { colour: 'var(--color-honey)', label: 'Hanukkah begins (opted in)', icon: IconStar },
  14: { colour: 'var(--color-tomato)', label: 'last Christmas order day', icon: IconGift },
  16: { colour: 'var(--color-cobalt)', label: 'Granny & grandad’s 40th', icon: IconHeart },
  25: { colour: 'var(--color-leaf)', label: 'Christmas Day', icon: IconSparkles },
};
function Calendar() {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="polaroid tape !p-5" style={{ ['--tilt' as string]: '-1deg' }}>
        <div className="flex items-baseline justify-between">
          <p className="font-display text-2xl font-extrabold text-cocoa">December</p>
          <p className="text-xs font-bold text-ink-soft">2026</p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
          {['m', 't', 'w', 't', 'f', 's', 's'].map((d, i) => (
            <span key={i} className="text-[11px] font-extrabold text-ink-faint">{d}</span>
          ))}
          <span />
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const e = EVENTS[d];
            return (
              <span key={d} title={e?.label} className={`flex aspect-square items-center justify-center rounded-full text-sm font-bold ${e ? 'sticker text-white' : 'text-cocoa'}`} style={e ? { background: e.colour, rotate: `${d % 2 ? 4 : -4}deg` } : undefined}>
                {d}
              </span>
            );
          })}
        </div>
      </div>
      <div>
        <p className="flex items-center gap-2 font-display text-xl font-extrabold text-cocoa">
          <Icon icon={IconCalendarHeart} size={20} className="text-cinnamon" /> coming up
        </p>
        <div className="mt-3 space-y-3">
          {[4, 13, 16, 25].map((d, i) => {
            const e = EVENTS[d]!;
            return (
              <div key={d} className="sticker flex items-center gap-3 rounded-[16px] bg-paper p-3" style={{ rotate: `${i % 2 ? 0.8 : -0.8}deg` }}>
                <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] leading-none text-white" style={{ background: e.colour }}>
                  <span className="text-[10px] font-extrabold">DEC</span>
                  <span className="font-display text-lg font-extrabold">{d}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-cocoa">{e.label}</p>
                  <p className="text-xs text-ink-soft">{d === 4 ? 'in 5 weeks · we’ll nudge you 4 Nov and 20 Nov' : d === 16 ? 'not on snickerdoodle — still remembered' : 'from the days you celebrate'}</p>
                </div>
                {d === 4 || d === 16 ? <span className="rounded-pill bg-cta px-3 py-1.5 text-xs font-extrabold text-white">make a gift</span> : null}
              </div>
            );
          })}
          <button className="press flex w-full items-center justify-center gap-1.5 rounded-pill border-2 border-dashed border-tomato bg-paper-2 py-3 text-sm font-extrabold text-cinnamon">
            <Icon icon={IconPlus} size={16} /> add an occasion
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── the days we celebrate (opt in per tradition; nothing religious on by default) ── */
const TRADITIONS: { name: string; days: string; on: boolean; icon: typeof IconCake }[] = [
  { name: 'Everyday family days', days: 'Mother’s Day (Mothering Sunday), Father’s Day, Valentine’s, New Year', on: true, icon: IconHeart },
  { name: 'Christmas & Easter', days: 'Christmas, Easter Sunday, Shrove Tuesday', on: true, icon: IconEgg },
  { name: 'Jewish festivals', days: 'Hanukkah, Rosh Hashanah, Passover', on: true, icon: IconStar },
  { name: 'Muslim festivals', days: 'Ramadan begins, Eid al-Fitr, Eid al-Adha', on: false, icon: IconStar },
  { name: 'Hindu festivals', days: 'Diwali, Holi, Raksha Bandhan', on: false, icon: IconSparkles },
  { name: 'Sikh festivals', days: 'Vaisakhi, Bandi Chhor Divas', on: false, icon: IconSparkles },
  { name: 'Lunar New Year', days: 'Chinese / Lunar New Year', on: false, icon: IconConfetti },
];
function Celebrate() {
  return (
    <div className="rounded-[24px] border-2 border-cocoa/15 bg-paper p-5">
      <p className="font-display text-xl font-extrabold text-cocoa">the days we celebrate</p>
      <p className="mt-1 text-sm text-ink-soft">pick what your family marks — we’ll put them on your calendar and nudge you before each one. private to your family, never used for anything else.</p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {TRADITIONS.map((t) => (
          <label key={t.name} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-[16px] border-2 px-3 py-2.5 ${t.on ? 'border-cocoa bg-honey-band' : 'border-cocoa/20 bg-paper'}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-cocoa ${t.on ? 'bg-cocoa text-paper' : 'bg-paper'}`}>{t.on ? '✓' : ''}</span>
            <span>
              <span className="block text-sm font-extrabold text-cocoa">{t.name}</span>
              <span className="block text-xs text-ink-soft">{t.days}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FamilyMockups() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-dvh bg-oat pb-24 pt-6">
      <Section note="option A" title="the pinboard">
        <Pinboard />
      </Section>
      <Section note="option B" title="the doodled family tree">
        <DoodleTree />
      </Section>
      <Section note="option C" title="the sticker-sheet rings">
        <StickerRings />
      </Section>
      <Section note="calendar" title="the calendar + coming up">
        <Calendar />
      </Section>
      <Section note="settings" title="the days we celebrate">
        <Celebrate />
      </Section>
    </main>
  );
}
