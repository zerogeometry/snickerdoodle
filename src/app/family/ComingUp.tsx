'use client';

import { IconCalendarHeart, IconPencil, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setReminderConsentAction } from '@/app/actions/family';
import { toast } from '@/lib/store';
import type { CalendarEvent, EventKind } from '@/server/occasions';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';

export const KIND_COLOUR: Record<EventKind, string> = {
  birthday: 'var(--color-berry)',
  anniversary: 'var(--color-cobalt)',
  milestone: 'var(--color-sunshine-deep)',
  festival: 'var(--color-green-save)',
  other: 'var(--color-cobalt-deep)',
  shop: 'var(--color-tomato)',
};
const at = (s: string) => new Date(`${s}T12:00:00Z`);
export const shortDate = (s: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => at(s).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }).toLowerCase();
const addDays = (s: string, n: number) => new Date(at(s).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function when(date: string, today: string): string {
  const d = Math.round((at(date).getTime() - at(today).getTime()) / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 14) return `in ${d} days`;
  if (d < 60) return `in ${Math.round(d / 7)} weeks`;
  return `in ${Math.round(d / 30)} months`;
}

/** One dated thing, as the "coming up" list and the calendar's day list show it. */
export function EventCard({ e, today, remindersOn, onEdit, i = 0 }: { e: CalendarEvent; today: string; remindersOn: boolean; onEdit?: () => void; i?: number }) {
  const nudges = [30, 14].map((n) => addDays(e.date, -n)).filter((d) => d > today);
  const sub =
    e.kind === 'shop'
      ? 'from our christmas delivery dates'
      : [!e.own ? `${e.familyName}` : null, e.note, remindersOn && nudges.length && e.kind !== 'festival' ? `we’ll nudge you ${nudges.map((d) => shortDate(d)).join(' and ')}` : when(e.date, today)].filter(Boolean).join(' · ');
  return (
    <div className="sticker pop-in flex items-center gap-3 rounded-[16px] bg-paper p-3" style={{ rotate: `${i % 2 ? 0.6 : -0.6}deg`, ['--i' as string]: i }}>
      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] leading-none text-white" style={{ background: KIND_COLOUR[e.kind] }}>
        <span className="text-[10px] font-extrabold uppercase">{shortDate(e.date, { month: 'short' })}</span>
        <span className="font-display text-lg font-extrabold">{at(e.date).getUTCDate()}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold leading-tight text-cocoa">{e.title}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} aria-label={`change ${e.title}`} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-cinnamon">
          <Icon icon={IconPencil} size={16} />
        </button>
      ) : null}
      {e.giftable ? (
        <Link href="/start-creating" className="press shrink-0 whitespace-nowrap rounded-pill bg-cta px-3 py-2 text-xs font-extrabold text-white">
          make a gift
        </Link>
      ) : null}
    </div>
  );
}

export function ComingUp({
  events,
  today,
  remindersOn,
  canAdd,
  onAdd,
  editFor,
}: {
  events: CalendarEvent[];
  today: string;
  remindersOn: boolean;
  canAdd: boolean;
  onAdd: () => void;
  /** the edit action for an event the viewer may change (null = none) */
  editFor: (e: CalendarEvent) => (() => void) | undefined;
}) {
  const router = useRouter();
  const [on, setOn] = useState(remindersOn);
  const [pending, start] = useTransition();
  const next = events.filter((e) => e.date >= today).slice(0, 5);
  const toggle = (v: boolean) =>
    start(async () => {
      setOn(v);
      const r = await setReminderConsentAction(v);
      if (!r.ok) {
        setOn(!v);
        return void toast('couldn’t change that — try again');
      }
      toast(v ? 'we’ll nudge you a month and two weeks before ✓' : 'no more nudges — turn them back on any time');
      router.refresh();
    });
  return (
    <section aria-labelledby="coming-up">
      <h2 id="coming-up" className="flex items-center gap-2 font-display text-xl font-extrabold text-cocoa">
        <Icon icon={IconCalendarHeart} size={20} className="text-cinnamon" /> coming up
      </h2>
      <div className="mt-3 space-y-3">
        {next.length ? (
          next.map((e, i) => <EventCard key={`${e.key}|${e.date}`} e={e} today={today} remindersOn={on} onEdit={editFor(e)} i={i} />)
        ) : (
          <p className="rounded-[16px] border-2 border-dashed border-cocoa/20 bg-paper p-4 text-center text-sm text-ink-soft">nothing coming up yet — add a birthday or an anniversary and it’ll land here.</p>
        )}
        {canAdd ? (
          <button type="button" onClick={onAdd} className="press flex min-h-12 w-full items-center justify-center gap-1.5 rounded-pill border-2 border-dashed border-tomato bg-paper-2 text-sm font-extrabold text-cinnamon">
            <Icon icon={IconPlus} size={16} /> add an occasion
          </button>
        ) : null}
      </div>
      <div className={`mt-4 rounded-[16px] border-2 border-cocoa/15 bg-paper p-3 ${pending ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-cocoa">email me a month and two weeks before each one</span>
          <Toggle on={on} onChange={toggle} label="email me a month and two weeks before each one" />
        </div>
        <p className="mt-1 text-[11px] text-ink-soft">just you — everyone chooses their own nudges. a few gentle emails a year, never more than one every couple of days.</p>
      </div>
    </section>
  );
}
