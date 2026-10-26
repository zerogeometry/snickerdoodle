import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, gateCookieValid, isGateExempt, isTestSite } from '@/lib/siteMode';
import { NOINDEX, isIndexablePath } from '@/lib/indexing';

/**
 * Real site: every page outside the public marketing/trust/shop list is marked noindex.
 * TEST SITE (`SITE_MODE=test`): everything sits behind the shared password, and nothing is
 * ever indexed.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isTestSite()) {
    const res = NextResponse.next();
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
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
