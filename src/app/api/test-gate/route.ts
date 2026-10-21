import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, TEST_GATE_DAYS, gateToken, isTestSite, sameSitePath, sameString } from '@/lib/siteMode';

/** The test site's password check (a plain form post — works before any JS loads). */
export async function POST(req: NextRequest) {
  if (!isTestSite()) return new NextResponse('not found', { status: 404 });
  const form = await req.formData();
  const given = String(form.get('password') ?? '');
  const next = sameSitePath(String(form.get('next') ?? '/'), req.url);
  const ok = !!process.env.TEST_SITE_PASSWORD && sameString(given, process.env.TEST_SITE_PASSWORD);
  if (!ok) {
    // a small pause makes guessing slow
    await new Promise((r) => setTimeout(r, 800));
    return seeOther(`/test-gate?wrong=1&next=${encodeURIComponent(next)}`);
  }
  const res = seeOther(next);
  res.cookies.set(TEST_GATE_COOKIE, await gateToken(), {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: TEST_GATE_DAYS * 24 * 3600,
  });
  return res;
}

/** A RELATIVE redirect: the browser stays on the address it came in on. (Behind Netlify,
 * `req.url` can carry the deploy's own host — an absolute redirect there lands on a host the
 * lock cookie isn't set for, and the tester bounces back to the password page.) */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

