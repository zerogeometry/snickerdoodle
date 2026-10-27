import type { MetadataRoute } from 'next';
import { CRAWL_DISALLOW } from '@/lib/indexing';
import { isTestSite } from '@/lib/siteMode';
import { siteUrl } from '@/lib/seo';

/**
 * Crawlers: welcome on the public marketing, trust and shop pages; kept out of everything private
 * (children's data — non-negotiable). Belt and braces: every private path ALSO carries
 * `X-Robots-Tag: noindex` from the middleware (src/lib/indexing.ts), since robots.txt is only
 * a request. The password-locked test site disallows everything.
 */
// read APP_URL / SITE_MODE at request time, not baked in at build
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (isTestSite()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  const base = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: CRAWL_DISALLOW }],
    sitemap: new URL('/sitemap.xml', base).toString(),
  };
}
