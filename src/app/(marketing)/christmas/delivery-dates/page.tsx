import { IconChristmasTree, IconMailHeart, IconPencil } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CHRISTMAS_LAST_ORDER, christmasYear, formatShortDate, seasonClock, type Route } from '@/lib/season';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/**
 * /christmas/delivery-dates (D24) — the page families (and search engines) look for in December.
 * Generated from the ONE last-order table in src/lib/season.ts that also drives the strip, the
 * badges and the basket. Rendered per request, so "today" is always right.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Christmas last order dates',
  description: 'The last day to order Snickerdoodle keepsakes for Christmas delivery in the UK — baubles, cards, wrapping paper, calendars, clothing and more.',
  alternates: { canonical: '/christmas/delivery-dates' },
};

const ROWS: { route: Route; what: string; how: string }[] = [
  { route: 'uk9', what: 'baubles (ceramic), christmas sacks, mugs, tea towels, socks, t-shirts, hoodies & kids jumpers', how: 'tracked' },
  { route: 'uk3', what: 'cushions, fleece blankets, aprons', how: 'tracked' },
  { route: 'gb3', what: 'framed prints, jigsaws, height charts', how: 'tracked' },
  { route: 'uk2', what: 'christmas jumpers (grown-ups)', how: 'first class' },
  { route: 'uk15', what: 'the 2027 calendar', how: 'standard' },
  { route: 'uk5', what: 'plastic ball baubles, playing cards', how: 'standard (untracked)' },
  { route: 'gb2', what: 'wrapping paper', how: 'standard (untracked)' },
  { route: 'uk7', what: 'cards and card packs', how: 'standard (untracked)' },
  { route: 'uk6', what: 'phone cases', how: 'express, tracked' },
];

export default function DeliveryDatesPage() {
  const now = seasonClock(new Date());
  const year = christmasYear(now);
  const table = CHRISTMAS_LAST_ORDER[year] ?? CHRISTMAS_LAST_ORDER[Math.max(...Object.keys(CHRISTMAS_LAST_ORDER).map(Number))]!;
  const today = now.toISOString().slice(0, 10);
  const rows = [...ROWS].sort((a, b) => table.byRoute[a.route].localeCompare(table.byRoute[b.route]));

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <CaveatNote className="-rotate-2 text-[26px] leading-none">under the tree in time</CaveatNote>
      <h1 className="mt-2 font-display text-[40px] leading-[1.02] text-cocoa md:text-5xl">Christmas last order dates</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        Order by these dates (UK, up to midnight) and it arrives by Christmas. They’re our <b>safe</b> dates, with time to
        print each piece and post it.
        {table.provisional ? ' We may move a date a little later once our makers confirm theirs — never earlier.' : ''}
      </p>

      <div className="mt-8 overflow-hidden rounded-[18px] border-2 border-cocoa bg-paper shadow-[0_4px_0_var(--color-cocoa)]">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Last order date for Christmas by product</caption>
          <thead className="bg-paper-2 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="px-4 py-3">what</th>
              <th scope="col" className="px-4 py-3">order by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = table.byRoute[r.route];
              const past = d < today;
              return (
                <tr key={r.route} className="border-t border-line">
                  <td className="px-4 py-3 text-cocoa">
                    {r.what}
                    <span className="block text-xs text-ink-faint">{r.how}</span>
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 font-extrabold ${past ? 'text-ink-faint line-through' : 'text-green-save'}`}>
                    {formatShortDate(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border-2 border-cocoa/15 bg-berry-pale p-4">
          <p className="flex items-center gap-2 font-extrabold text-cocoa">
            <Icon icon={IconMailHeart} size={18} className="text-cinnamon" /> missed the post?
          </p>
          <p className="mt-1 text-sm text-ink-soft">Make it anyway — a keepsake is lovely any time — and tuck a little drawing of “what’s coming” under the tree.</p>
        </div>
        <div className="rounded-[16px] border-2 border-cocoa/15 bg-sky-pale p-4">
          <p className="flex items-center gap-2 font-extrabold text-cocoa">
            <Icon icon={IconPencil} size={18} className="text-cobalt" /> after christmas
          </p>
          <p className="mt-1 text-sm text-ink-soft">Thank-you cards drawn by them, in packs of 5 or 10. Grandparents keep these.</p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button href="/start-creating" size="lg">
          start creating
        </Button>
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-cinnamon underline underline-offset-2">
          <Icon icon={IconChristmasTree} size={16} /> back to the shop
        </Link>
      </div>
    </div>
  );
}
