/**
 * Which pages search engines may index. NOINDEX BY DEFAULT: only the public marketing + trust
 * pages and the shop front are listed here; everything else (home, family, studio, checkout,
 * gift links, join links, account, orders, admin, APIs) gets `X-Robots-Tag: noindex, nofollow`
 * from the middleware. A new page stays private from search until someone adds it below.
 * Edge-safe (no Node imports) so the middleware can use it.
 */
const INDEXABLE_EXACT = new Set(['/', '/how-it-works', '/gifts', '/our-story', '/catalogue', '/start-creating']);
const INDEXABLE_PREFIXES = ['/trust/'];

export const NOINDEX = 'noindex, nofollow';

export function isIndexablePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (INDEXABLE_EXACT.has(path)) return true;
  return INDEXABLE_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length);
}
