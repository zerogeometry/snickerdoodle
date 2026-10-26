import { describe, expect, it } from 'vitest';
import { isIndexablePath } from '@/lib/indexing';

describe('search indexing — noindex by default', () => {
  it('lets the public marketing, trust and shop-front pages be indexed', () => {
    for (const p of ['/', '/how-it-works', '/gifts', '/our-story', '/catalogue', '/start-creating', '/trust/privacy', '/trust/family-promise', '/gifts/']) {
      expect(isIndexablePath(p), p).toBe(true);
    }
  });

  it('keeps every private, gift, join, checkout, account and API path out of search', () => {
    for (const p of [
      '/home', '/family', '/studio', '/studio/position', '/checkout', '/checkout/confirmation', '/g/abc123', '/join/tok',
      '/account', '/orders', '/customize/mug', '/login', '/share-wish', '/admin/review', '/api/gift/t/preview/a', '/dev',
      '/trust', '/trusty', '/homepage', '/new-page-nobody-listed',
    ]) {
      expect(isIndexablePath(p), p).toBe(false);
    }
  });
});
