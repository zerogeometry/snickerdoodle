/**
 * The DATED 2027 WALL CALENDAR (founder, 2026-10-25 — CHRISTMAS-range-and-postage.md §5).
 *
 * Prodigi's CALENDAR-A4/A5-L-DATED prints the 2027 date grid itself; we supply a picture for each of
 * its THIRTEEN required print areas — the cover + one per month. The shopper picks up to 12 drawings
 * + a cover; any page left empty is filled by REPEATING the chosen drawings in order, so a single
 * drawing still makes a full calendar. (The optional 'back cover' area is never sent.)
 *
 * In the basket a calendar is ONE line carrying its 13 pages (qty = copies). At order time the server
 * re-fills + re-checks every page (authz, moderation, DPI) and freezes one artwork row per print area;
 * fulfilment renders each page on its own and sends 13 distinct files in ONE Prodigi item.
 * Client-safe: no I/O.
 */

export const CALENDAR_KEY = 'calendar';
export const CALENDAR_YEAR = 2027;

/** Prodigi's print-area names, in page order: the cover, then January…December. */
export const CALENDAR_PAGES = [
  'cover', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
] as const;
export type CalendarPage = (typeof CALENDAR_PAGES)[number];
export const CALENDAR_PAGE_COUNT = CALENDAR_PAGES.length; // 13

/** Is this basket-line key the calendar (the product key or one of its variant skus)? */
export const isCalendarKey = (key: string | null | undefined): boolean => !!key && (key === CALENDAR_KEY || key.startsWith(`${CALENDAR_KEY}-`));

/** A page's friendly name ("cover", "january"). */
export const pageLabel = (i: number): string => CALENDAR_PAGES[i] ?? `page ${i + 1}`;

/** One page of a calendar: which drawing, and how it sits on the page. */
export interface CalendarPick {
  assetId: string;
  transform: { scale?: number; offsetX?: number; offsetY?: number; rotationDeg?: number };
  sourceObjectId?: string | null;
}

/**
 * Fill a calendar's 13 pages from the shopper's picks (index 0 = the cover, 1–12 = the months; a
 * null / missing / malformed slot = "not chosen"). Every empty page takes the chosen drawings again,
 * in order, round and round — so one drawing fills all 13, and 4 drawings cycle through the year.
 * Untrusted input is fine: anything past 13 pages is ignored. Throws if NOTHING is chosen.
 */
export function fillCalendarPages<P extends CalendarPick>(slots: ReadonlyArray<P | null | undefined>): Array<P & { printArea: CalendarPage }> {
  const page = (s: P | null | undefined): s is P => !!s && typeof s === 'object' && typeof s.assetId === 'string' && s.assetId.length > 0;
  const first13 = Array.from({ length: CALENDAR_PAGE_COUNT }, (_, i) => slots[i] ?? null);
  const chosen = first13.filter(page);
  if (chosen.length === 0) throw new Error('a calendar needs at least one drawing');
  let k = 0;
  return first13.map((s, i) => ({ ...(page(s) ? s : chosen[k++ % chosen.length]!), printArea: CALENDAR_PAGES[i]! }));
}

/** Short month names for the date grid ("jan"). */
export const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

/**
 * The weeks of one month (monthIndex 0 = January), Monday first, as rows of 7 day numbers with
 * null for the days outside it — for the flip-through preview's illustrative date grid (Prodigi
 * prints the real one). Computed in UTC so a browser's time zone can't shift a day.
 */
export function monthWeeks(year: number, monthIndex: number): Array<Array<number | null>> {
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7; // Mon = 0
  const cells: Array<number | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
