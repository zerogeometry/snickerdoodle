import { llmsTxt } from '@/lib/llmsTxt';
import { siteOrigin } from '@/lib/seo';
import { isPasswordLocked } from '@/lib/siteMode';
import { faqPriceSentence } from '@/server/faqPrices';

/** /llms.txt — the site in plain words for answer engines (src/lib/llmsTxt.ts). None on the password-locked test site. */
export const dynamic = 'force-dynamic';

export function GET() {
  if (isPasswordLocked()) return new Response('Not found', { status: 404 });
  return new Response(llmsTxt(siteOrigin(), faqPriceSentence()), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
