import type { MetadataRoute } from 'next';
import { FAQ_UPDATED } from '@/lib/faq';
import { isTestSite } from '@/lib/siteMode';
import { PUBLIC_PAGES, productPagePath, siteOrigin } from '@/lib/seo';
import { shopFrontProducts } from '@/server/catalogue';

/** The public pages (src/lib/seo.ts) + one product page per product on show. Empty on the
 * password-locked test site. */
// decided per request from the RUNNING site's settings (never frozen at build: a test build must
// never ship an open robots.txt)
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  if (isTestSite()) return [];
  const origin = siteOrigin();
  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map((p) => ({
    url: `${origin}${p.path === '/' ? '' : p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    ...(p.path === '/faq' ? { lastModified: FAQ_UPDATED } : {}),
  }));
  const products: MetadataRoute.Sitemap = shopFrontProducts().map((p) => ({ url: `${origin}${productPagePath(p.key)}`, changeFrequency: 'weekly', priority: 0.8 }));
  return [...pages, ...products];
}
