import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, gateCookieValid, isGateExempt, isTestSite } from '@/lib/siteMode';
import { NOINDEX, isIndexablePath } from '@/lib/indexing';

/**
 * Real site: every page outside the public marketing/trust/shop list is marked noindex.
 * TEST SITE (`SITE_MODE=test`): everything sits behind the shared password, and nothing is
 * ever indexed.
 * Gift links (/g/<token>): a dead link answers 410 Gone (unknown → 404) while still showing the
 * friendly card — see src/app/g/[token]/status.ts.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isTestSite()) {
    const res = await pageResponse(req);
    if (!isIndexablePath(pathname)) res.headers.set('X-Robots-Tag', NOINDEX);
    return res;
  }
  if (!isGateExempt(pathname) && !(await gateCookieValid(req.cookies.get(TEST_GATE_COOKIE)?.value))) {
    if (pathname.startsWith('/api/')) return new NextResponse('locked', { status: 401, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
    const url = req.nextUrl.clone();
    url.pathname = '/test-gate';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  const res = await pageResponse(req);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

/** Carry on to the page — with an honest status for a gift link that's gone. Only the document
 * request (a GET/HEAD page load) gets it: the page's own server actions and client refreshes
 * keep 200 so their friendly in-page messages still work. */
async function pageResponse(req: NextRequest): Promise<NextResponse> {
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.headers.has('rsc') && req.nextUrl.pathname.startsWith('/g/')) {
    const { GIFT_LINK_PATH, giftLinkHttpStatus } = await import('@/app/g/[token]/status');
    const m = GIFT_LINK_PATH.exec(req.nextUrl.pathname);
    const status = m ? await giftLinkHttpStatus(m[1]!) : 200;
    if (status !== 200) return NextResponse.rewrite(req.nextUrl, { status });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
  // Node.js runtime: the gift-link status reads the database (stable in Next 15.5).
  runtime: 'nodejs',
};
