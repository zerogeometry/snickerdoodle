import 'server-only';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { DbHandle } from '@/server/db';
import { sessions } from '@/db/schema';
import { isFreshSignIn } from '@/lib/freshSignIn';

/** When this browser signed in, for the A-63 check (src/lib/freshSignIn.ts). Auth.js's session cookie (secure name on https, plain on http://localhost). */
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

/**
 * THIS browser's sign-in for `accountId`: when, and how ('email' = the link or the code; 'passkey' = Face ID /
 * fingerprint). Null with no session, or someone else's.
 */
export async function currentSignIn(db: DbHandle, accountId: string): Promise<{ at: Date; method: string } | null> {
  const jar = await cookies();
  const token = SESSION_COOKIES.map((n) => jar.get(n)?.value).find(Boolean);
  if (!token) return null;
  const [row] = await db
    .select({ createdAt: sessions.createdAt, method: sessions.signInMethod })
    .from(sessions)
    .where(and(eq(sessions.sessionToken, token), eq(sessions.userId, accountId)));
  return row ? { at: row.createdAt, method: row.method } : null;
}

/**
 * When THIS browser's session for `accountId` was signed in, or null (no session, or someone else's). A passkey
 * sign-in starts a new session too, so it counts as fresh exactly like the email (A-63).
 */
export async function currentSignInAt(db: DbHandle, accountId: string): Promise<Date | null> {
  return (await currentSignIn(db, accountId))?.at ?? null;
}

/**
 * The "skip the email next time?" card: only just after an EMAIL sign-in in this browser (the last 15 minutes), so it
 * shows once, where they land, and never after a Face ID sign-in. The page still checks this device can do it.
 */
export async function offerPasskeyAfterSignIn(db: DbHandle, accountId: string, now = new Date()): Promise<boolean> {
  const s = await currentSignIn(db, accountId);
  return !!s && s.method === 'email' && isFreshSignIn(s.at, now);
}
