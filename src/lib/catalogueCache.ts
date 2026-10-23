'use client';

import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

/**
 * The product list, kept in the browser between pages (founder, 23 Oct: "customize does another load
 * at that moment"). The range page has just fetched it, so customize opens straight away from the
 * copy and quietly refreshes it behind. Display only: a price is ALWAYS re-quoted by the server at
 * checkout, so an older copy can never change what anyone pays. Kept for a few minutes, then
 * re-fetched before use.
 */
const FRESH_MS = 5 * 60_000;
type Entry = { at: number; products: CatalogueProduct[] };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<CatalogueProduct[]>>();
const keyOf = (includeHidden: boolean) => (includeHidden ? 'all' : 'shop');

/** The copy already in the browser (any age), for a page's first paint — or null. */
export function cachedCatalogue(includeHidden = false): CatalogueProduct[] | null {
  return cache.get(keyOf(includeHidden))?.products ?? null;
}

/** Fetch the list, sharing one request between callers; remembers the answer. */
export function fetchCatalogue(includeHidden = false): Promise<CatalogueProduct[]> {
  const key = keyOf(includeHidden);
  const running = inflight.get(key);
  if (running) return running;
  const p = loadCatalogueAction(includeHidden ? { includeHidden } : undefined)
    .then((products) => {
      cache.set(key, { at: Date.now(), products });
      return products;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * The list for a page: a fresh copy straight away (no request), otherwise the server's answer.
 * A copy that is still fresh is also refreshed in the background so the next page is current.
 */
export function loadCatalogueCached(includeHidden = false, now = Date.now()): Promise<CatalogueProduct[]> {
  const hit = cache.get(keyOf(includeHidden));
  if (hit && now - hit.at < FRESH_MS) {
    void fetchCatalogue(includeHidden).catch(() => {});
    return Promise.resolve(hit.products);
  }
  return fetchCatalogue(includeHidden);
}

/** Tests only. */
export function _resetCatalogueCache(): void {
  cache.clear();
  inflight.clear();
}
