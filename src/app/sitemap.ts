import type { MetadataRoute } from 'next';
import { FAQ_UPDATED } from '@/lib/faq';
import { CHRISTMAS_PAGES_UPDATED, CHRISTMAS_PATHS } from '@/lib/christmas-pages';
import { PRODUCT_PATHS } from '@/lib/shop-products';
import { isTestSite } from '@/lib/siteMode';
import { PUBLIC_PAGES, siteOrigin } from '@/lib/seo';
import { shopListings } from '@/server/shop/listing';

/** The public pages only (src/lib/seo.ts). Empty on the password-locked test site. */
// decided per request from the RUNNING site's settings (never frozen at build: a test build must
// never ship an open robots.txt)
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  if (isTestSite()) return [];
  const origin = siteOrigin();
  // a product page is listed only while its product is on show (a hidden one answers 404)
  const onShow = new Set(shopListings().map((l) => l.path));
  return PUBLIC_PAGES.filter((p) => !PRODUCT_PATHS.includes(p.path) || onShow.has(p.path)).map((p) => ({
    url: `${origin}${p.path === '/' ? '' : p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    ...(p.path === '/faq' ? { lastModified: FAQ_UPDATED } : CHRISTMAS_PATHS.includes(p.path) && p.path !== '/christmas/delivery-dates' ? { lastModified: CHRISTMAS_PAGES_UPDATED } : {}),
  }));
}
