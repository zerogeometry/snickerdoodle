/**
 * The CHRISTMAS SEASON layer (D23/D24, founder 2026-10-25; project-office/briefs/CHRISTMAS-strategy.md).
 *
 * One small data file + pure functions, shared by the server (it decides) and the client (it shows):
 *  - the season window (1 Nov → 6 Jan, UK time),
 *  - which products lead the range while it's on,
 *  - the honest "arrives by christmas" promise per product, from each product's Prodigi lab and that
 *    lab's last order date for Christmas.
 *
 * Next Christmas is an edit to this file, not a build. Pass `now` in — never read the clock in here,
 * so every rule is unit-tested against fixed dates.
 */

const TZ = 'Europe/London';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PREVIEW the season before it starts — every season check behaves as if it were that date (midday UK).
 * Honoured ONLY in development or on the password-locked TEST SITE (SITE_MODE=test), never on the real
 * shop, so it can never fake a date for a customer (the box's fetch-env.sh also refuses the setting
 * unless SITE_MODE=test).
 *  - on the server: `SEASON_PREVIEW_DATE=2026-11-20` (runtime; or NEXT_PUBLIC_SEASON_PREVIEW_DATE in dev);
 *  - in the browser: the root layout copies the server's answer onto <html data-season-preview>, so the
 *    client agrees with the server without a build-time variable.
 */
export function seasonPreviewDate(): string | null {
  if (typeof document !== 'undefined') {
    const v = document.documentElement.dataset.seasonPreview;
    return v && ISO_DAY.test(v) ? v : null;
  }
  const allowed = process.env.NODE_ENV !== 'production' || process.env.SITE_MODE === 'test';
  const v = process.env.SEASON_PREVIEW_DATE || process.env.NEXT_PUBLIC_SEASON_PREVIEW_DATE;
  return allowed && v && ISO_DAY.test(v) ? v : null;
}

/** `now`, or the preview date when one is set (see {@link seasonPreviewDate}). */
export function seasonClock(real: Date): Date {
  const preview = seasonPreviewDate();
  return preview ? new Date(`${preview}T12:00:00Z`) : real;
}

/** The UK calendar date (y, m 1–12, d) of an instant. */
function ukDate(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: n('year'), m: n('month'), d: n('day') };
}

/** Is the Christmas season on? 1 November → 6 January inclusive, UK time. */
export function isChristmasSeason(now: Date): boolean {
  const { m, d } = ukDate(now);
  return m === 11 || m === 12 || (m === 1 && d <= 6);
}

/** The Christmas the season is selling for (Nov/Dec → this year; 1–6 Jan → last year's). */
export function christmasYear(now: Date): number {
  const { y, m } = ukDate(now);
  return m === 1 ? y - 1 : y;
}

/** While the season is on, these lead the range, in this order (then everything else as usual). The
 * family bundle first (founder, 29 Oct). */
export const CHRISTMAS_FEATURED = ['christmasBundle', 'ceramicOrnament', 'christmasBauble', 'cardPack', 'wrappingPaper', 'calendar', 'sack', 'mug', 'teaTowel', 'kidsJumper', 'christmasJumper'] as const;

/**
 * The expected-popularity list with the Christmas products moved to the front while the season is on.
 * Outside the season it is returned unchanged.
 */
export function seasonalExpected(expected: readonly string[], now: Date): string[] {
  if (!isChristmasSeason(now)) return [...expected];
  const lead: string[] = [...CHRISTMAS_FEATURED];
  return [...lead, ...expected.filter((k) => !lead.includes(k))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Last order dates for Christmas
// ─────────────────────────────────────────────────────────────────────────────

/** A Prodigi lab + its standard carrier — what decides how late an order can be. */
export type Route = 'uk9' | 'uk3' | 'uk5' | 'uk7' | 'uk15' | 'gb2' | 'gb3' | 'uk2' | 'uk6' | 'other';

/**
 * Our LAST ORDER DATE per route for Christmas (UK dates, orders until 23:59 that day).
 *
 * PROVISIONAL until Prodigi publishes its 2026 cut-offs (prodigi.com/christmas-delivery-dates said
 * "posted here when available" on 2026-10-25). They are deliberately SAFE: Royal Mail's own 2025 last
 * dates were Tracked 48 Fri 19 Dec / 1st Class Sat 20 Dec / Tracked 24 Sun 21 Dec; we allow ~3 working
 * days to make + a margin. Guernsey (cards) and the calendar lab get a day or two more. Phone cases
 * already ship Express. When Prodigi's dates land, edit them here — one place feeds the strip, the
 * badges, the basket lines and the /christmas/delivery-dates page.
 */
export const CHRISTMAS_LAST_ORDER: Record<number, { provisional: boolean; byRoute: Record<Route, string> }> = {
  2026: {
    provisional: true,
    byRoute: {
      uk9: '2026-12-14', // Royal Mail Tracked 48: bauble, sack, mug, tea towel, socks, tees, hoodies, kids jumper
      uk3: '2026-12-14', // FedEx Economy: apron, cushion, blanket
      uk5: '2026-12-11', // Royal Mail RM24 (untracked): plastic ball
      uk7: '2026-12-10', // Guernsey Post: cards + card packs
      uk15: '2026-12-11', // the calendar lab ("Mixed" carrier, no express)
      gb2: '2026-12-11', // Royal Mail RM24 (untracked): wrapping paper, Evri for some
      gb3: '2026-12-14', // Evri: framed prints, jigsaws, height chart
      uk2: '2026-12-14', // Royal Mail 1st Class: the christmas jumper (Prodigi may route it to uk9 — same date)
      uk6: '2026-12-16', // phone cases go Express
      other: '2026-12-10', // anything we haven't mapped: the earliest date, to be safe
    },
  },
};

/** product key → route (variant overrides in {@link routeOf}). Verified by sandbox quotes 2026-10-25. */
const ROUTE_BY_PRODUCT: Record<string, Route> = {
  ceramicOrnament: 'uk9', sack: 'uk9', mug: 'uk9', teaTowel: 'uk9', petBandana: 'uk9', socks: 'uk9',
  placemat: 'uk9', coaster: 'uk9', christmasBundle: 'uk9', // the christmas table + the family bundle: all uk9, one parcel
  kidsTee: 'uk9', adultTee: 'uk9', kidsHoodie: 'uk9', adultHoodie: 'uk9', kidsJumper: 'uk9',
  apron: 'uk3', cushion: 'uk3', blanket: 'uk3',
  card: 'uk7', cardPack: 'uk7',
  calendar: 'uk15',
  wrappingPaper: 'gb2',
  framedPrint: 'gb3', jigsaw: 'gb3', heightChart: 'gb3',
  christmasJumper: 'uk2', babyBodysuit: 'uk2',
  playingCards: 'uk5', // Royal Mail RM24 (sandbox, 2026-10-21)
  christmasBauble: 'uk5', // the plastic ball — Royal Mail RM24
  phoneCase: 'uk6',
};
/** The route for a product (a variant can refine it — none do today: the two ornaments are separate products). */
/** The route for a product, optionally refined by the chosen variant's attributes. */
export function routeOf(productKey: string, _attrs?: { size?: string | null; colour?: string | null }): Route {
  return ROUTE_BY_PRODUCT[productKey] ?? 'other';
}

/** The route for a priced-line key (product key or variant sku, e.g. `calendar-a4`). */
export function routeOfLineKey(lineKey: string): Route {
  const dash = lineKey.indexOf('-');
  return routeOf(dash > 0 ? lineKey.slice(0, dash) : lineKey);
}

export type DeliveryPromise =
  /** not the season, or no dates for this year — say nothing */
  | { state: 'off' }
  /** still in time: order by `lastOrderDate` (YYYY-MM-DD) */
  | { state: 'in-time'; lastOrderDate: string; provisional: boolean; daysLeft: number }
  /** the last order date has passed — it won't arrive for Christmas */
  | { state: 'missed'; lastOrderDate: string };

/** Whole UK days from `now`'s date to `iso` (0 = it's today). */
function daysUntil(now: Date, iso: string): number {
  const { y, m, d } = ukDate(now);
  const [Y, M, D] = iso.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(y, m - 1, d)) / 86_400_000);
}

/** The Christmas delivery promise for one route at `now`. */
export function promiseForRoute(route: Route, now: Date): DeliveryPromise {
  if (!isChristmasSeason(now)) return { state: 'off' };
  const year = christmasYear(now);
  const table = CHRISTMAS_LAST_ORDER[year];
  if (!table) return { state: 'off' };
  const last = table.byRoute[route];
  const days = daysUntil(now, last);
  if (days < 0) return { state: 'missed', lastOrderDate: last };
  return { state: 'in-time', lastOrderDate: last, provisional: table.provisional, daysLeft: days };
}

/** The promise for a product (and variant). */
export function deliveryPromise(productKey: string, now: Date, attrs?: { size?: string | null; colour?: string | null }): DeliveryPromise {
  return promiseForRoute(routeOf(productKey, attrs), now);
}

/**
 * The promise for a whole basket: in time only if EVERY line is; the date to beat is the EARLIEST
 * last order date among the lines (an honest single answer for "will it all arrive?").
 */
export function basketPromise(lineKeys: readonly string[], now: Date): DeliveryPromise & { lateLineKeys?: string[] } {
  if (lineKeys.length === 0 || !isChristmasSeason(now)) return { state: 'off' };
  const ps = lineKeys.map((k) => ({ k, p: promiseForRoute(routeOfLineKey(k), now) }));
  if (ps.every((x) => x.p.state === 'off')) return { state: 'off' };
  const late = ps.filter((x) => x.p.state === 'missed').map((x) => x.k);
  if (late.length > 0) {
    const first = ps.find((x) => x.p.state === 'missed')!.p as { lastOrderDate: string };
    return { state: 'missed', lastOrderDate: first.lastOrderDate, lateLineKeys: late };
  }
  const inTime = ps.map((x) => x.p).filter((p): p is Extract<DeliveryPromise, { state: 'in-time' }> => p.state === 'in-time');
  const earliest = inTime.reduce((a, b) => (a.lastOrderDate <= b.lastOrderDate ? a : b));
  return earliest;
}

/** The SITE-WIDE strip date: the date most of the range (the uk9 parcel) must be ordered by. */
export function headlinePromise(now: Date): DeliveryPromise {
  return promiseForRoute('uk9', now);
}

/** "mon 14 dec" — lowercase, like the rest of the brand voice. */
export function formatShortDate(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(Y, M - 1, D, 12));
  const wd = dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toLowerCase();
  const mo = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  return `${wd} ${D} ${mo}`;
}

/**
 * The honest deadline line for the evergreen /christmas pages — shown ALL YEAR, not just in season
 * (families plan in October): the date most things must be ordered by (the uk9 parcel) and the
 * earlier one for cards (uk7), for the coming Christmas.
 *   upcoming → both dates (provisional until the makers confirm theirs)
 *   missed   → the last date has passed: say so plainly (thank-you cards instead)
 *   unknown  → no dates for that Christmas yet (we never guess one)
 */
export type ChristmasDeadlines =
  | { state: 'upcoming'; year: number; mostThings: string; cards: string; provisional: boolean; cardsMissed: boolean }
  | { state: 'missed'; year: number; mostThings: string }
  | { state: 'unknown'; year: number };

export function christmasDeadlines(now: Date): ChristmasDeadlines {
  const year = christmasYear(now);
  const table = CHRISTMAS_LAST_ORDER[year];
  if (!table) return { state: 'unknown', year };
  const mostThings = table.byRoute.uk9;
  if (daysUntil(now, mostThings) < 0) return { state: 'missed', year, mostThings };
  return { state: 'upcoming', year, mostThings, cards: table.byRoute.uk7, provisional: table.provisional, cardsMissed: daysUntil(now, table.byRoute.uk7) < 0 };
}
