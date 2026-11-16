import type { Session } from 'next-auth';

/** The sign-in session as the adapter hands it to Auth.js (database strategy): it carries the secret token. */
interface StoredSession {
  expires: Date | string;
}

/** The account row as the adapter hands it to Auth.js. */
interface StoredUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

/**
 * What any page script may know about who's signed in: GET /api/auth/session (and `auth()`) return
 * exactly this. Built from scratch, never spread from what Auth.js passes in. With database sessions
 * that object also holds `sessionToken`, the same secret as the httpOnly login cookie, so handing it to
 * the page would let any script on it (an XSS bug, a bad dependency) take over the account.
 */
export function publicSession(session: StoredSession, user: StoredUser): Session {
  const expires = session.expires instanceof Date ? session.expires.toISOString() : String(session.expires);
  return {
    user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
    expires,
  };
}
