import type { MetadataRoute } from 'next';
import { isTestSite } from '@/lib/siteMode';
import { AI_SEARCH_CRAWLERS, AI_TRAINING_CRAWLERS, PRIVATE_PATHS, siteOrigin } from '@/lib/seo';

/**
 * robots.txt — the public marketing pages are open to search and answer engines; everything a family
 * uses is closed (src/lib/seo.ts). The password-locked TEST SITE is closed to every crawler.
 */
// decided per request from the RUNNING site's settings (never frozen at build: a test build must
// never ship an open robots.txt)
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (isTestSite()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  const open = { allow: '/', disallow: PRIVATE_PATHS };
  return {
    rules: [
      { userAgent: '*', ...open },
      { userAgent: AI_SEARCH_CRAWLERS, ...open },
      { userAgent: AI_TRAINING_CRAWLERS, ...open },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
    host: siteOrigin(),
  };
}
