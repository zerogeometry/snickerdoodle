import { isColouredGround } from '@/lib/patterns';
import type { BasketItem, PackCardLine } from '@/lib/store';
import { CALENDAR_KEY, CALENDAR_YEAR, fillCalendarPages } from '@/lib/calendar';

/**
 * The basket line for the dated WALL CALENDAR: ONE line carrying its 13 pages (the cover, then
 * January…December) with the gaps already filled by repeating — so what the basket shows is what
 * prints. `artwork` mirrors the cover so every basket/checkout thumbnail shows the real calendar.
 * The price is only the catalogue figure to show while the server quote lands; the server re-prices
 * the calendar and re-fills + re-checks every page at order time. Client-safe: no I/O.
 */

/** A fresh, unique line id — two different calendars in one basket stay two lines. */
export const newCalendarLineId = () => `cal-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function calendarLine(opts: {
  id: string;
  variant: { id: string; sku: string; pricePence: number; attributes?: Record<string, string> };
  /** The shopper's picks (0 = the cover, 1–12 = the months); null = not chosen, filled by repeats. */
  slots: ReadonlyArray<PackCardLine | null>;
  /** one base colour for every page (a palette token / #rrggbb; white = none) */
  ground?: string;
}): Omit<BasketItem, 'qty'> {
  const pages = fillCalendarPages(opts.slots).map(({ printArea: _area, ...p }) => ({
    assetId: p.assetId,
    transform: p.transform,
    ...(p.sourceObjectId ? { sourceObjectId: p.sourceObjectId } : {}),
  }));
  const drawings = new Set(pages.map((p) => p.assetId)).size;
  return {
    id: opts.id,
    name: 'calendar',
    product: CALENDAR_KEY,
    sku: opts.variant.sku,
    variantId: opts.variant.id,
    pricePence: opts.variant.pricePence,
    sub: [opts.variant.attributes?.size, String(CALENDAR_YEAR), drawings === 1 ? 'one favourite drawing' : `${drawings} drawings`].filter(Boolean).join(' · '),
    artwork: pages[0]!,
    pages,
    ...(opts.ground && isColouredGround(opts.ground) ? { ground: opts.ground } : {}),
  };
}
