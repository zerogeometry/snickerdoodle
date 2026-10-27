/**
 * Search + answer-engine reach (founder, 23 Oct). One place for what crawlers may see.
 *
 * PUBLIC: the marketing pages — what Snickerdoodle is, how it works, gifts, our story, the FAQ and the
 * trust pages — plus the shop's front door (founder, 26 Oct: "maximum reach from day 1"): the
 * start-creating page and ONE product page per product on show, `/customize/<productKey>`. Those show
 * the product, never a child's picture: a parent's own upload lives only in their browser.
 * PRIVATE: everything a family uses (keepsakes, the studio, baskets, gift links, accounts, any other
 * customize URL) — never crawled, never indexed (next.config.ts also sends `noindex` on these, and
 * they need a session or an unguessable link anyway). No child's picture is ever on a public page.
 */

/** The canonical public origin (production), from APP_URL. */
export const siteOrigin = (env: Record<string, string | undefined> = process.env): string =>
  (env.APP_URL || 'https://snickerdoodle.co.uk').replace(/\/+$/, '');

/** Never crawled. Keep in step with NOINDEX_PATHS in next.config.ts (which also sends noindex).
 * `/customize/<productKey>` is crawlable; anything else under /customize is noindex by header. */
export const PRIVATE_PATHS = ['/home', '/family', '/account', '/checkout', '/orders', '/studio', '/share-wish', '/admin', '/g/', '/join', '/login', '/api/', '/test-gate', '/dev', '/offline'];

/** A product page's path — the one indexable URL per product on show. */
export const productPagePath = (productKey: string) => `/customize/${productKey}`;

/** A product key that can be an indexable page: one plain segment (next.config.ts matches the same). */
export const PLAIN_SEGMENT = /^[A-Za-z0-9-]+$/;

/** The public pages, for the sitemap (most important first). */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/faq', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/help', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/how-it-works', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/gifts', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/start-creating', priority: 0.9, changeFrequency: 'weekly' },
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
