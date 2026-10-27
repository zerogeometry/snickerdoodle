import { describe, expect, it } from 'vitest';
import { CRAWL_DISALLOW, isIndexablePath } from '@/lib/indexing';
import { sitemapEntries } from '@/server/sitemap';
import { shopFrontProducts } from '@/server/catalogue';
import robots from '@/app/robots';

const PRIVATE = [
  '/home', '/family', '/studio', '/studio/position', '/checkout', '/checkout/confirmation', '/g/abc123', '/join/tok',
  '/account', '/orders', '/login', '/share-wish', '/admin/review', '/api/gift/t/preview/a', '/dev', '/offline',
  '/waitlist/confirm', '/waitlist/unsubscribed', '/api/waitlist/unsubscribe',
  '/trust', '/trusty', '/homepage', '/new-page-nobody-listed',
];

describe('search indexing — noindex by default', () => {
  it('lets the public marketing, trust, shop-front and product pages be indexed', () => {
    for (const p of [
      '/', '/how-it-works', '/gifts', '/our-story', '/catalogue', '/start-creating', '/trust/privacy', '/trust/family-promise', '/gifts/',
      '/customize/framedPrint', '/customize/mug', '/customize/kids-tee',
    ]) {
      expect(isIndexablePath(p), p).toBe(true);
    }
  });

  it('keeps every private, gift, join, checkout, account, waitlist and API path out of search', () => {
    for (const p of PRIVATE) expect(isIndexablePath(p), p).toBe(false);
  });

  it('a product page is exactly one plain segment — nothing nested or odd sneaks in', () => {
    for (const p of ['/customize', '/customize/', '/customize/mug/extra', '/customize/mug%2F..%2Fhome', '/customize/a.b', '/trust/privacy/x']) {
      expect(isIndexablePath(p), p).toBe(false);
    }
  });
});

describe('robots.txt + sitemap', () => {
  it('robots disallows every private area the brief names', () => {
    for (const p of ['/api/', '/g/', '/join/', '/home', '/family', '/studio', '/checkout', '/account', '/orders', '/admin', '/login', '/dev']) {
      expect(CRAWL_DISALLOW, p).toContain(p);
    }
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(CRAWL_DISALLOW);
  });

  it('the sitemap lists only indexable public pages, plus every product on show', () => {
    const urls = sitemapEntries(new URL('https://snickerdoodle.co.uk')).map((e) => e.url);
    for (const u of urls) {
      expect(u.startsWith('https://snickerdoodle.co.uk/'), u).toBe(true);
      expect(isIndexablePath(new URL(u).pathname), u).toBe(true);
    }
    expect(urls).toContain('https://snickerdoodle.co.uk/');
    expect(urls).toContain('https://snickerdoodle.co.uk/trust/privacy');
    expect(urls).toContain('https://snickerdoodle.co.uk/catalogue');
    expect(urls).toContain('https://snickerdoodle.co.uk/start-creating');
    const shop = shopFrontProducts();
    expect(shop.length).toBeGreaterThan(0);
    for (const p of shop) expect(urls).toContain(`https://snickerdoodle.co.uk/customize/${p.key}`);
    expect(urls.filter((u) => u.includes('/customize/'))).toHaveLength(shop.length); // hidden/paused products never listed
    for (const p of PRIVATE) expect(urls).not.toContain(`https://snickerdoodle.co.uk${p}`);
  });
});
