import { describe, expect, it } from 'vitest';
import { isIndexablePath, PRIVATE_PATHS, PUBLIC_PAGES } from '@/lib/seo';

/** Noindex by default (src/proxy.ts): only the listed public pages may be indexed. */
describe('search indexing — noindex by default', () => {
  it('lets every public page be indexed (with or without a trailing slash)', () => {
    for (const { path } of PUBLIC_PAGES) {
      expect(isIndexablePath(path), path).toBe(true);
      if (path !== '/') expect(isIndexablePath(`${path}/`), `${path}/`).toBe(true);
    }
  });

  it('keeps everything a family uses out of search', () => {
    for (const p of [
      '/home', '/family', '/studio', '/studio/position', '/start-creating', '/customize/mug', '/customize/cardPack', '/checkout',
      '/checkout/confirmation', '/g/abcdefgh123', '/join/tok', '/account', '/orders', '/login', '/share-wish', '/admin/review',
      '/api/gift/t/preview/a', '/dev', '/test-gate',
    ]) {
      expect(isIndexablePath(p), p).toBe(false);
    }
  });

  it('a page nobody listed is private until someone adds it', () => {
    for (const p of ['/new-page', '/trust', '/trusty', '/homepage', '/faq/extra', '/trust/privacy/x']) expect(isIndexablePath(p), p).toBe(false);
  });

  it('no private area is also listed as public', () => {
    for (const { path } of PUBLIC_PAGES) {
      for (const priv of PRIVATE_PATHS) expect(path === priv || path.startsWith(priv.endsWith('/') ? priv : `${priv}/`), `${path} vs ${priv}`).toBe(false);
    }
  });
});
