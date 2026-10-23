import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, gateCookieValid, isGateExempt, isTestSite } from '@/lib/siteMode';
import { buildCsp, cspMode, newNonce, storageOrigins } from '@/lib/csp';

/**
 * Every page request:
 *  1. gets a fresh script nonce and the Content-Security-Policy built from it (src/lib/csp.ts).
 *     The policy also goes on the REQUEST, with `x-nonce`: Next.js reads the nonce from there and
 *     puts it on its own <script> tags. (Pages render per request — see the root layout — so the
 *     nonce is never baked into a cached page.)
 *  2. on the TEST SITE only (`SITE_MODE=test`): sits behind the shared password and is never
 *     indexed. On the real site that part is a pass-through.
 */
export async function middleware(req: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, mode: cspMode(), storageOrigins: storageOrigins() });
  const testSite = isTestSite();

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
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  if (testSite) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = {
  // Everything but Next's hashed static files + image optimiser (no HTML there; next.config.ts
  // gives those a locked-down baseline policy instead).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
