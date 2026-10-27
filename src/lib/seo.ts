/**
 * Search + answer-engine reach (founder, 23 Oct). One place for what crawlers may see.
 *
 * PUBLIC: the marketing pages only — what Snickerdoodle is, how it works, gifts, our story, the FAQ
 * and the trust pages. PRIVATE: everything a family uses (keepsakes, the studio, baskets, gift links,
 * accounts) — never crawled, never indexed (next.config.ts also sends `noindex` on these, and they
 * need a session or an unguessable link anyway). No child's picture is ever on a public page.
 */

/** The canonical public origin (production), from APP_URL. */
export const siteOrigin = (env: Record<string, string | undefined> = process.env): string =>
  (env.APP_URL || 'https://snickerdoodle.co.uk').replace(/\/+$/, '');

/** Never crawled. Keep in step with NOINDEX_PATHS in next.config.ts (which also sends noindex). */
export const PRIVATE_PATHS = ['/home', '/family', '/account', '/checkout', '/orders', '/customize', '/studio', '/start-creating', '/share-wish', '/admin', '/g/', '/join', '/login', '/api/', '/test-gate'];

/** The public pages, for the sitemap (most important first). */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/faq', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/help', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/how-it-works', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/gifts', priority: 0.8, changeFrequency: 'monthly' },
  // Christmas (D24): an evergreen URL — never /christmas-2026 — so the page gains age year on year
  { path: '/christmas/delivery-dates', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/our-story', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/trust/family-promise', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/trust/privacy', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/trust/terms', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/trust/cookies', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/trust/data-complaint', priority: 0.3, changeFrequency: 'yearly' },
];

/**
 * Crawlers we explicitly welcome on the PUBLIC pages, so families asking an assistant ("how can I turn
 * my child's drawing into a mug?") can be pointed at us. Search + answer engines, and the model
 * crawlers too — the public pages hold nothing private, and being known to the assistants is reach.
 * FOUNDER CALL: to keep the public pages out of model TRAINING (while staying in AI search), move the
 * second group to `disallow: ['/']`.
 */
export const AI_SEARCH_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'Applebot', 'Bingbot', 'Googlebot', 'DuckAssistBot'];
export const AI_TRAINING_CRAWLERS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent'];

/**
 * NOINDEX BY DEFAULT (gap audit, 27 Oct): search engines may index ONLY the public pages above —
 * every other page (anything a family uses, and any page added later and not listed here) gets
 * `X-Robots-Tag: noindex, nofollow` from the proxy (src/proxy.ts). One list for the sitemap and
 * the header, so the two can never disagree.
 */
export const NOINDEX = 'noindex, nofollow';
const INDEXABLE = new Set(PUBLIC_PAGES.map((p) => p.path));
export function isIndexablePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return INDEXABLE.has(path);
}
