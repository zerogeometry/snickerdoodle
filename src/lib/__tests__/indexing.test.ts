import { afterEach, describe, expect, it, vi } from 'vitest';
// The SAME matcher Next uses for next.config.ts `headers()` sources (build-custom-route.js).
// @ts-expect-error — Next's compiled copy ships without types
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from '../../../next.config';
import { PRIVATE_PATHS, productPagePath } from '@/lib/seo';
import { shopFrontProducts } from '@/server/catalogue';

/**
 * Search reach (founder, 26 Oct: "maximum reach from day 1") without giving up privacy: the shop's
 * front door — /start-creating and ONE product page per product on show — is indexable; everything a
 * family uses stays `noindex` (next.config.ts) and closed in robots.txt (src/lib/seo.ts).
 */
type Rule = { source: string; headers: { key: string; value: string }[] };

async function noindexed(pathname: string): Promise<boolean> {
  const rules = (await nextConfig.headers!()) as Rule[];
  return rules.some(
    (r) =>
      r.headers.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)) &&
      (pathToRegexp(r.source, [], { strict: true, sensitive: false, delimiter: '/' }) as RegExp).test(pathname),
  );
}

const PRIVATE = [
  '/home', '/home/keepsakes', '/family', '/family/abc', '/studio', '/studio/position', '/checkout', '/checkout/confirmation',
  '/g/abc123', '/join/tok', '/account', '/orders', '/orders/SNK-1', '/login', '/share-wish', '/admin/review',
  '/api/gift/t/preview/a', '/dev/spin', '/offline', '/test-gate', '/waitlist/confirm', '/waitlist/unsubscribed', '/api/waitlist/unsubscribe',
];

describe('search indexing — the shop front is open, the private app is not', () => {
  it('the marketing pages, /start-creating and each product page can be indexed', async () => {
    for (const p of ['/', '/faq', '/how-it-works', '/gifts', '/trust/privacy', '/start-creating', '/customize/framedPrint', '/customize/mug', '/customize/kids-tee']) {
      expect(await noindexed(p), p).toBe(false);
    }
  });

  it('every private, gift, join, checkout, account, admin and API path is noindex', async () => {
    for (const p of PRIVATE) expect(await noindexed(p), p).toBe(true);
  });

  it('a product page is exactly one plain segment — nothing nested or odd sneaks in', async () => {
    for (const p of ['/customize', '/customize/', '/customize/mug/extra', '/customize/mug/x/y', '/customize/a.b', '/customize/mug%2F..%2Fhome', '/customize/mug~1']) {
      expect(await noindexed(p), p).toBe(true);
    }
  });

  it('robots.txt no longer closes the shop front, and still closes every private area', () => {
    for (const p of ['/start-creating', '/customize/framedPrint']) {
      expect(PRIVATE_PATHS.some((q) => p.startsWith(q)), p).toBe(false);
    }
    for (const p of PRIVATE) expect(PRIVATE_PATHS.some((q) => p.startsWith(q.replace(/\/$/, ''))), p).toBe(true);
  });
});

describe('sitemap — every product on show, nothing hidden', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lists /start-creating and one page per product on show — and only those products', async () => {
    vi.stubEnv('SITE_MODE', '');
    vi.stubEnv('APP_URL', 'https://snickerdoodle.co.uk');
    const urls = (await import('@/app/sitemap')).default().map((e) => e.url);
    expect(urls).toContain('https://snickerdoodle.co.uk/start-creating');
    const shop = shopFrontProducts();
    expect(shop.length).toBeGreaterThan(0);
    for (const p of shop) expect(urls).toContain(`https://snickerdoodle.co.uk${productPagePath(p.key)}`);
    expect(urls.filter((u) => u.includes('/customize/'))).toHaveLength(shop.length); // hidden/paused products never listed
    for (const u of urls) expect(await noindexed(new URL(u).pathname), u).toBe(false);
  });

  it('a hidden or paused product is never on the shop front (so never in the sitemap, and its page says noindex)', async () => {
    const shown = new Set(shopFrontProducts().map((p) => p.key));
    const { definedPriceList } = await import('@/server/catalogue');
    for (const r of definedPriceList()) if (!r.visibleInShop || r.paused) expect(shown.has(r.productKey), r.productKey).toBe(false);
  });

  it('a product page’s metadata: canonical for a product on show, noindex otherwise', async () => {
    const { generateMetadata } = await import('@/app/customize/[productKey]/layout');
    const shown = shopFrontProducts()[0]!;
    const m = await generateMetadata({ params: Promise.resolve({ productKey: shown.key }) });
    expect(m.alternates?.canonical).toBe(productPagePath(shown.key));
    expect(m.robots).toBeUndefined();
    const { definedPriceList } = await import('@/server/catalogue');
    const hidden = definedPriceList().find((r) => !r.visibleInShop || r.paused);
    for (const key of [hidden?.productKey ?? 'giftWrap', 'not-a-product', 'a.b']) {
      const n = await generateMetadata({ params: Promise.resolve({ productKey: key }) });
      expect(n.robots, key).toEqual({ index: false, follow: false });
    }
  });
});
