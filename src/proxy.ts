import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, gateCookieValid, isGateExempt, isPasswordLocked } from '@/lib/siteMode';
import { buildCsp, cspMode, newNonce, storageOrigins } from '@/lib/csp';
import { isIndexablePath, NOINDEX } from '@/lib/seo';

/**
 * The proxy (Next 16's name for middleware; it runs on Node). Every page request:
 *  1. gets a fresh script nonce and the Content-Security-Policy built from it (src/lib/csp.ts).
 *     The policy also goes on the REQUEST, with `x-nonce`: Next.js reads the nonce from there and
 *     puts it on its own <script> tags. (Pages render per request — see the root layout — so the
 *     nonce is never baked into a cached page.)
 *  2. on the TEST SITE (`SITE_MODE=test`) and the PRIVATE LIVE site (`SITE_MODE=private`): sits behind
 *     the shared password and is never indexed.
 *  3. on the real site: NOINDEX BY DEFAULT — only the public pages (src/lib/seo.ts) may be indexed.
 *  4. a gift link (/g/<token>) that's dead answers 410 Gone (unknown → 404), still with its friendly
 *     card (src/app/g/[token]/status.ts — CLAUDE.md: "deleted source → 410").
 */
export async function proxy(req: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, mode: cspMode(), storageOrigins: storageOrigins() });
  const testSite = isPasswordLocked(); // the test site or the private live site

  const { pathname, search } = req.nextUrl;
  if (testSite && !isGateExempt(pathname) && !(await gateCookieValid(req.cookies.get(TEST_GATE_COOKIE)?.value))) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('locked', { status: 401, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': csp } });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/test-gate';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const status = await giftLinkStatus(req);
  const res = status === 200 ? NextResponse.next({ request: { headers: requestHeaders } }) : NextResponse.rewrite(req.nextUrl, { status, request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  if (testSite || !isIndexablePath(pathname)) res.headers.set('X-Robots-Tag', testSite ? 'noindex, nofollow' : NOINDEX);
  return res;
}

/** An honest status for a gift link's PAGE LOAD (GET/HEAD of the document): the page's own server
 * actions and client refreshes keep 200 so their friendly in-page messages still work. */
async function giftLinkStatus(req: NextRequest): Promise<200 | 404 | 410> {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.headers.has('rsc') || !req.nextUrl.pathname.startsWith('/g/')) return 200;
  const { GIFT_LINK_PATH, giftLinkHttpStatus } = await import('@/app/g/[token]/status');
  const m = GIFT_LINK_PATH.exec(req.nextUrl.pathname);
  if (!m) return 200;
  try {
    return await giftLinkHttpStatus(m[1]!);
  } catch {
    return 200; // the page shows its own card; never fail a page load over a status
  }
}

export const config = {
  // Everything but Next's hashed static files + image optimiser (no HTML there; next.config.ts
  // gives those a locked-down baseline policy instead).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
