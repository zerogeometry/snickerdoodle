/** One parcel of an order as the customer sees it: who carries it, and its tracking where there is some. */
export interface Parcel {
  carrier: string | null;
  number: string | null;
  url: string | null;
}

/** What `orders.tracking` holds: the last shipment's carrier/number/url, plus every parcel (an order often leaves
 * several print labs, and the phone case may be its own Prodigi order). */
export interface OrderTracking {
  carrier?: string | null;
  number?: string | null;
  url?: string | null;
  parcels?: Array<{ carrier?: string | null; number?: string | null; url?: string | null }>;
}

/**
 * Every parcel of an order, for the orders page and the "on its way" email (founder, 26 Nov 2026). Uses the parcel
 * list when there is one, else the single shipment older orders stored; the same tracking number twice is one
 * parcel. Empty when nothing is known.
 */
export function parcelsOf(t: OrderTracking | null | undefined): Parcel[] {
  if (!t) return [];
  const raw = t.parcels?.length ? t.parcels : t.number || t.url || t.carrier ? [t] : [];
  const seen = new Set<string>();
  const out: Parcel[] = [];
  for (const p of raw) {
    const parcel = { carrier: p.carrier?.trim() || null, number: p.number?.trim() || null, url: p.url?.trim() || null };
    const key = parcel.number ?? parcel.url;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(parcel);
  }
  return out;
}

/** The parcels that can be followed (a tracking link or number). */
export const trackedParcels = (t: OrderTracking | null | undefined): Parcel[] => parcelsOf(t).filter((p) => p.url || p.number);
