import 'server-only';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { DbHandle } from '@/server/db';
import { sessions } from '@/db/schema';

/** When this browser signed in, for the A-63 check (src/lib/freshSignIn.ts). Auth.js's session cookie (secure name on https, plain on http://localhost). */
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

/** When THIS browser's session for `accountId` was signed in, or null (no session, or someone else's). */
export async function currentSignInAt(db: DbHandle, accountId: string): Promise<Date | null> {
  const jar = await cookies();
  const token = SESSION_COOKIES.map((n) => jar.get(n)?.value).find(Boolean);
  if (!token) return null;
  const [row] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.sessionToken, token), eq(sessions.userId, accountId)));
  return row?.createdAt ?? null;
}
