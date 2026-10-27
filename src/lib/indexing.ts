/**
 * Which pages search engines may index. NOINDEX BY DEFAULT: only the public marketing + trust
 * pages, the shop front and the product pages are listed here; everything else (home, family,
 * studio, checkout, gift links, join links, account, orders, admin, APIs, waitlist links) gets
 * `X-Robots-Tag: noindex, nofollow` from the middleware. A new page stays private from search
 * until someone adds it below. Edge-safe (no Node imports) so the middleware can use it.
 */
const INDEXABLE_EXACT = new Set(['/', '/how-it-works', '/gifts', '/our-story', '/catalogue', '/start-creating']);
/** Prefixes whose direct children are indexable: trust pages, and one product page per key
 * (`/customize/<productKey>` — the best organic entry points; they show the product, never a
 * child's picture — a parent's own upload lives only in their browser until they choose). */
const INDEXABLE_PREFIXES = ['/trust/', '/customize/'];

export const NOINDEX = 'noindex, nofollow';

/** robots.txt disallow list (src/app/robots.ts). The noindex header above is the real guard. */
export const CRAWL_DISALLOW = [
  '/api/',
  '/g/',
  '/join/',
  '/home',
  '/family',
  '/studio',
  '/checkout',
  '/account',
  '/orders',
  '/admin',
  '/login',
  '/dev',
  '/share-wish',
  '/waitlist/',
  '/offline',
  '/test-gate',
];

export function isIndexablePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (INDEXABLE_EXACT.has(path)) return true;
  return INDEXABLE_PREFIXES.some((p) => {
    if (!path.startsWith(p)) return false;
    const rest = path.slice(p.length);
    return /^[A-Za-z0-9-]+$/.test(rest); // exactly one plain segment: /trust/privacy, /customize/framedPrint
  });
}
