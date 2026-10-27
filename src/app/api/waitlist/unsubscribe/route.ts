import { getDb } from '@/db/client';
import { unsubscribeWaitlist } from '@/server/waitlist';

/**
 * One-tap unsubscribe from the waitlist. GET = the link in the email (tap → done, no form, no
 * sign-in); POST = RFC 8058 one-click from the mail app's own "unsubscribe" button. Unsubscribing
 * on a bare GET is deliberate: if a mail scanner follows it, the person simply hears less from us
 * — the more private failure. Unknown tokens land on the same page (nothing is revealed).
 */
export const dynamic = 'force-dynamic';

const NOINDEX = 'noindex, nofollow';

const quiet = () => ({ ok: false });

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  await unsubscribeWaitlist(getDb(), url.searchParams.get('t')).catch(quiet);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/waitlist/unsubscribed', // relative: right behind any proxy/host
      'X-Robots-Tag': NOINDEX,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const res = await unsubscribeWaitlist(getDb(), url.searchParams.get('t')).catch(quiet);
  return new Response(res.ok ? 'unsubscribed' : 'not found', {
    status: res.ok ? 200 : 404,
    headers: { 'X-Robots-Tag': NOINDEX, 'Cache-Control': 'no-store' },
  });
}
