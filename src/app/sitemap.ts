import type { MetadataRoute } from 'next';
import { isTestSite } from '@/lib/siteMode';
import { sitemapEntries } from '@/server/sitemap';

/** /sitemap.xml — public pages only (src/server/sitemap.ts). The locked test site lists nothing. */
// read APP_URL / SITE_MODE at request time, not baked in at build
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  return isTestSite() ? [] : sitemapEntries();
}
