import { isTestSite } from '@/lib/siteMode';
import { siteOrigin } from '@/lib/seo';
import { buildMerchantFeed } from '@/server/shop/merchantFeed';

/**
 * GET /feeds/google-merchant.xml — the Google Merchant Center product feed (C8; src/server/shop/
 * merchantFeed.ts). Built per request from the server catalogue, so a price change is in the feed
 * on Google's next fetch. The password-locked test site has no feed.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (isTestSite()) return new Response('not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
  return new Response(buildMerchantFeed(siteOrigin()), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
