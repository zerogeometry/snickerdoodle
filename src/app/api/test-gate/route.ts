import { NextResponse, type NextRequest } from 'next/server';
import { TEST_GATE_COOKIE, TEST_GATE_DAYS, gateToken, isPasswordLocked, localPath, sameString } from '@/lib/siteMode';
import { getDb } from '@/db/client';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';

/** The test site's password check (a plain form post — works before any JS loads). */
export async function POST(req: NextRequest) {
  if (!isPasswordLocked()) return new NextResponse('not found', { status: 404 });
  const form = await req.formData();
  const given = String(form.get('password') ?? '');
  // back to the page they asked for (07-B16) — a path on this site only, resolved without trusting
  // the request's own URL (behind a proxy its host / form can differ from the visitor's address)
  const next = localPath(String(form.get('next') ?? '/')) ?? '/';
  // 10 tries per device per 15 minutes (counted before checking, so a right guess costs one too)
  const gate = await rateLimit(getDb(), { ...LIMITS.testGatePerIp, caller: ipFromHeaders(req.headers) });
  if (!gate.ok) return seeOther(`/test-gate?busy=1&next=${encodeURIComponent(next)}`);
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

