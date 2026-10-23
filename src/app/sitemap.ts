import type { MetadataRoute } from 'next';
import { FAQ_UPDATED } from '@/lib/faq';
import { isTestSite } from '@/lib/siteMode';
import { PUBLIC_PAGES, siteOrigin } from '@/lib/seo';

/** The public pages only (src/lib/seo.ts). Empty on the password-locked test site. */
// decided per request from the RUNNING site's settings (never frozen at build: a test build must
// never ship an open robots.txt)
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  if (isTestSite()) return [];
  const origin = siteOrigin();
  return PUBLIC_PAGES.map((p) => ({
    url: `${origin}${p.path === '/' ? '' : p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    ...(p.path === '/faq' ? { lastModified: FAQ_UPDATED } : {}),
  }));
}
