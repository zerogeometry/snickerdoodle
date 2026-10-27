'use client';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { CalendarEvent } from '@/server/occasions';
import { Icon } from '@/ui/primitives/Icon';
import { EventCard, KIND_COLOUR } from './ComingUp';

/**
 * The family calendar (founder's mockup, 27 Oct): a taped paper month, each dated day a little sticker
 * in its kind's colour (another family's dates ringed), today circled. Tap a day for what's on it —
 * the list underneath is the accessible view of the month too. Twelve months, from this one.
 */
const WEEKDAYS = ['m', 't', 'w', 't', 'f', 's', 's'];

export function FamilyCalendar({ events, from, today, remindersOn, editFor }: { events: CalendarEvent[]; from: string; today: string; remindersOn: boolean; editFor: (e: CalendarEvent) => (() => void) | undefined }) {
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const y0 = Number(from.slice(0, 4)), m0 = Number(from.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(y0, m0 + offset, 1));
  const y = first.getUTCFullYear(), m = first.getUTCMonth();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) if (e.date.startsWith(prefix)) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events, prefix]);
  const monthName = first.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const shown = picked && picked.startsWith(prefix) ? (byDay.get(picked) ?? []) : [...byDay.entries()].flatMap(([, es]) => es);
  return (
    <section aria-labelledby="calendar" className="polaroid tape !p-4 sm:!p-5" style={{ ['--tilt' as string]: '-0.6deg' }}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => { setOffset((o) => Math.max(0, o - 1)); setPicked(null); }} disabled={offset === 0} aria-label="the month before" className="press flex h-11 w-11 items-center justify-center rounded-full text-cocoa disabled:opacity-30">
          <Icon icon={IconChevronLeft} size={18} />
        </button>
        <h2 id="calendar" className="font-display text-2xl font-extrabold text-cocoa">
          {monthName} <span className="text-sm font-bold text-ink-soft">{y}</span>
        </h2>
        <button type="button" onClick={() => { setOffset((o) => Math.min(11, o + 1)); setPicked(null); }} disabled={offset === 11} aria-label="the month after" className="press flex h-11 w-11 items-center justify-center rounded-full text-cocoa disabled:opacity-30">
          <Icon icon={IconChevronRight} size={18} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="group" aria-label={`${monthName} ${y}`}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="text-[11px] font-extrabold text-ink-faint" aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = `${prefix}${String(i + 1).padStart(2, '0')}`;
          const es = byDay.get(d);
          const isToday = d === today;
          const label = `${i + 1} ${monthName}${es ? `: ${es.map((e) => e.title).join(', ')}` : ''}`;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(picked === d ? null : d)}
              aria-label={label}
              aria-pressed={picked === d}
              className={`relative mx-auto flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-sm font-bold ${es ? 'sticker text-white' : 'text-cocoa'} ${isToday && !es ? 'ring-2 ring-cocoa' : ''} ${picked === d ? 'outline outline-2 outline-offset-2 outline-cinnamon' : ''}`}
              style={es ? { background: KIND_COLOUR[es[0]!.kind], rotate: `${((i % 3) - 1) * 3}deg`, ...(es.some((e) => !e.own) ? { boxShadow: '0 0 0 3px var(--color-sky)' } : {}) } : undefined}
            >
              {i + 1}
              {es && es.length > 1 ? <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cocoa text-[9px] text-paper">{es.length}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-2.5" aria-live="polite">
        {shown.length ? (
          shown.map((e, i) => <EventCard key={`${e.key}|${e.date}`} e={e} today={today} remindersOn={remindersOn} onEdit={editFor(e)} i={i} />)
        ) : (
          <p className="text-center text-xs text-ink-soft">{picked ? 'nothing on this day' : `nothing on the calendar in ${monthName} yet`}</p>
        )}
      </div>
      <p className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOUR.birthday }} />birthdays</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOUR.anniversary }} />anniversaries</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOUR.festival }} />days we celebrate</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-sky" />another family’s</span>
      </p>
    </section>
  );
}
