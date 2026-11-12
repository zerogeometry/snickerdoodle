import { NextResponse, type NextRequest } from 'next/server';
import { handlers } from '@/auth';
import { getDb } from '@/db/client';
import { ipFromHeaders, LIMITS, rateLimitAll } from '@/server/rateLimit';

/**
 * Auth.js, with one guard in front: every open of a sign-in link or a typed sign-in code (the email callback) counts
 * against that email and that device, so the 8-character code can't be guessed (src/auth/signInCode.ts). Ten tries
 * per email and thirty per device in 15 minutes is plenty for a real person, typos included. Over the limit, back to
 * the sign-in card with a "too many tries" note.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/email')) {
    const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
    const gate = await rateLimitAll(getDb(), [
      { ...LIMITS.signInTriesPerEmail, caller: email || 'none' },
      { ...LIMITS.signInTriesPerIp, caller: ipFromHeaders(req.headers) },
    ]);
    // relative, so the browser stays on the address it came in on (as src/app/api/test-gate/route.ts)
    if (!gate.ok) return new NextResponse(null, { status: 303, headers: { Location: '/login?error=TooManyTries' } });
  }
  return handlers.GET(req);
}

export const { POST } = handlers;
