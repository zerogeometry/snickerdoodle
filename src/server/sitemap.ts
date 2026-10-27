import 'server-only';
import type { MetadataRoute } from 'next';
import { isIndexablePath } from '@/lib/indexing';
import { siteUrl } from '@/lib/seo';
import { shopFrontProducts } from './catalogue';

/** The public marketing + trust pages, the shop front, and one page per product on show. */
const PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/start-creating', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/catalogue', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/how-it-works', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/gifts', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/our-story', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/trust/family-promise', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/trust/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/trust/cookies', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/trust/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/trust/data-complaint', priority: 0.2, changeFrequency: 'yearly' },
];

export function sitemapEntries(base: URL = siteUrl()): MetadataRoute.Sitemap {
  const products = shopFrontProducts().map((p) => ({ path: `/customize/${p.key}`, priority: 0.8, changeFrequency: 'monthly' as const }));
  return [...PAGES, ...products]
    .filter((p) => isIndexablePath(p.path)) // never list a page the middleware would noindex
    .map((p) => ({ url: new URL(p.path, base).toString(), changeFrequency: p.changeFrequency, priority: p.priority }));
}

