import { exVat } from '../../../scripts/lib/gtm-metrics.mjs';
import { londonDay, londonWeekStart } from './today';

/**
 * The "this week" screen's own small sums (the admin app), PURE: no database, no clock. The channel, gift-loop,
 * repeat and safety maths are the Monday report's (scripts/lib/gtm-metrics.mjs); this is only what the screen
 * adds on top: which weeks to compare, takings with VAT, the drop-off steps and the "vs last week" words.
 */

const DAY = 86_400_000;

/** A stretch of time, end exclusive; `from` / `to` are its first and last London days (as the Monday report's windows). */
export interface WeekWindow {
  start: Date;
  end: Date;
  from: string;
  to: string;
}

export type WhichWeek = 'this' | 'last';

export interface WeekPair {
  which: WhichWeek;
  /** The week on screen: Monday 00:00 London up to now (this week so far), or the whole of last week. */
  current: WeekWindow;
  /** What it's compared with: the same stretch of the week before ("this time last week"), or the whole week before. */
  previous: WeekWindow;
  /** Count everything up to here (now, or the end of last week). */
  asOf: Date;
  /** How the comparison reads in a sentence. */
  vsLabel: string;
}

const win = (start: Date, end: Date): WeekWindow => ({ start, end, from: londonDay(start), to: londonDay(new Date(end.getTime() - 1)) });

/** The previous Monday 00:00 London before this one (a Monday 12 hours earlier is always in last week). */
const mondayBefore = (monday: Date) => londonWeekStart(new Date(monday.getTime() - DAY / 2));

/**
 * The two weeks the screen compares. This week so far is set against the same stretch of last week (Monday to the
 * same moment), so a Tuesday isn't measured against a whole week; last week is set against the whole week before it.
 */
export function weekPair(now: Date, which: WhichWeek): WeekPair {
  const thisMonday = londonWeekStart(now);
  const lastMonday = mondayBefore(thisMonday);
  if (which === 'this') {
    const soFar = now.getTime() - thisMonday.getTime();
    return { which, current: win(thisMonday, now), previous: win(lastMonday, new Date(lastMonday.getTime() + soFar)), asOf: now, vsLabel: 'this time last week' };
  }
  const mondayBeforeLast = mondayBefore(lastMonday);
  return { which, current: win(lastMonday, thisMonday), previous: win(mondayBeforeLast, lastMonday), asOf: thisMonday, vsLabel: 'the week before' };
}

/** "?week=last" → last week; anything else → this week so far. */
export const parseWhichWeek = (v: string | string[] | undefined): WhichWeek => (v === 'last' ? 'last' : 'this');

// ── sales ───────────────────────────────────────────────────────────────────

export interface Sales {
  orders: number;
  /** What customers paid, VAT included (the order totals). */
  takingsPence: number;
  /** The same, VAT taken off (as the Monday report counts revenue). */
  takingsExVatPence: number;
  /** Average order, VAT included; null with no orders. */
  averagePence: number | null;
}

/** Paid orders in the window and what they took (rows as the Monday report loads them: `at` = paid, `totalPence` inc VAT). */
export function salesOf(orders: { at: Date; totalPence: number }[], w: Pick<WeekWindow, 'start' | 'end'>): Sales {
  const week = orders.filter((o) => o.at >= w.start && o.at < w.end);
  const takingsPence = week.reduce((n, o) => n + o.totalPence, 0);
  return {
    orders: week.length,
    takingsPence,
    takingsExVatPence: week.reduce((n, o) => n + exVat(o.totalPence), 0),
    averagePence: week.length ? Math.round(takingsPence / week.length) : null,
  };
}

// ── where families drop off ─────────────────────────────────────────────────

export interface FunnelCounts {
  uploads: number;
  designs: number;
  checkouts: number;
  paid: number;
}

export interface FunnelStep {
  key: keyof FunnelCounts;
  count: number;
  /** count ÷ the step before (null for the first step, or when the step before is 0). Can pass 100%: a design can
   * use a picture uploaded in an earlier week. */
  ofPrevious: number | null;
  /** count ÷ the biggest step, 0–1: how wide its bar is drawn. */
  barShare: number;
}

const FUNNEL_ORDER: (keyof FunnelCounts)[] = ['uploads', 'designs', 'checkouts', 'paid'];

/** The four steps in order, each with its share of the step before. */
export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  const max = Math.max(...FUNNEL_ORDER.map((k) => c[k]));
  return FUNNEL_ORDER.map((key, i) => {
    const prevKey = FUNNEL_ORDER[i - 1];
    const prev = prevKey ? c[prevKey] : 0;
    return { key, count: c[key], ofPrevious: prevKey && prev > 0 ? c[key] / prev : null, barShare: max > 0 ? c[key] / max : 0 };
  });
}

// ── words ───────────────────────────────────────────────────────────────────

/** "up from 12 this time last week" / "down from £40.00 the week before" / "same as this time last week". */
export function compareNote(cur: number | null, prev: number | null, vsLabel: string, fmt: (n: number) => string = String): string {
  if (prev === null) return cur === null ? `none ${vsLabel} either` : `none ${vsLabel}`;
  if (cur === null) return `${fmt(prev)} ${vsLabel}`;
  if (cur === prev) return `same as ${vsLabel}`;
  return `${cur > prev ? 'up' : 'down'} from ${fmt(prev)} ${vsLabel}`;
}

/** "mon 16 nov – sun 22 nov" style, lowercase, for the heading line. */
export function weekLabel(w: WeekWindow): string {
  const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
  return w.from === w.to ? day(w.from) : `${day(w.from)} – ${day(w.to)}`;
}

/** Whole percent, or "—" when there's nothing to divide by. */
export const percent = (r: number | null | undefined): string => (r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`);
