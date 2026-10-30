import { getDb } from '@/db/client';
import { turnRemindersOffByLink } from '@/server/reminders';

/**
 * One-click unsubscribe for the reminder emails (RFC 8058: the mail app POSTs here when the parent
 * taps its own "unsubscribe"). Only turns reminders OFF, for the account the signed link was made
 * for. A GET does nothing (link scanners) — people who tap the link in the email land on
 * /reminders/off/<token>, which asks first.
 */
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const res = await turnRemindersOffByLink(getDb(), token, 'one-click');
  return new Response(res.ok ? 'reminders are off' : 'that link didn’t work', {
    status: res.ok ? 200 : 404,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
  });
}
