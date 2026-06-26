import { and, eq } from 'drizzle-orm';
import type { Adapter, AdapterSession, AdapterUser } from 'next-auth/adapters';
import { getDb } from '@/db/client';
import { accounts, sessions, verificationTokens } from '@/db/schema';
import type { DbHandle } from '@/server/db';

/**
 * A custom Auth.js adapter that uses OUR `accounts` table as the user store
 * (rather than Auth.js's default `users`), plus `sessions` and
 * `verification_tokens`. Email magic-link only — no OAuth account table, so the
 * OAuth methods are intentionally inert.
 *
 * Sessions are stored in the DB (not a JWT) so they're revocable — a closed or
 * compromised account's sessions can be invalidated server-side, and family
 * access is re-resolved live by src/authz on every request regardless.
 */

type AccountRow = typeof accounts.$inferSelect;

function toUser(row: AccountRow): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerifiedAt ?? null,
    name: row.displayName ?? undefined,
    image: undefined,
  };
}

const lower = (email: string) => email.trim().toLowerCase();

export function DrizzleAccountsAdapter(db: DbHandle = getDb()): Adapter {
  return {
    async createUser(user) {
      const [row] = await db
        .insert(accounts)
        .values({
          id: user.id,
          email: lower(user.email),
          emailVerifiedAt: user.emailVerified ?? null,
          displayName: user.name ?? null,
        })
        .returning();
      return toUser(row!);
    },

    async getUser(id) {
      const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
      return row ? toUser(row) : null;
    },

    async getUserByEmail(email) {
      const [row] = await db.select().from(accounts).where(eq(accounts.email, lower(email)));
      return row ? toUser(row) : null;
    },

    // Email magic-link only — there is no OAuth account linkage.
    async getUserByAccount() {
      return null;
    },
    async linkAccount() {
      return undefined;
    },

    async updateUser(user) {
      const [row] = await db
        .update(accounts)
        .set({
          ...(user.email !== undefined ? { email: lower(user.email) } : {}),
          ...(user.emailVerified !== undefined ? { emailVerifiedAt: user.emailVerified } : {}),
          ...(user.name !== undefined ? { displayName: user.name } : {}),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, user.id))
        .returning();
      return toUser(row!);
    },

    async createSession(session) {
      await db.insert(sessions).values(session);
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const [row] = await db
        .select({ session: sessions, user: accounts })
        .from(sessions)
        .innerJoin(accounts, eq(sessions.userId, accounts.id))
        .where(eq(sessions.sessionToken, sessionToken));
      if (!row) return null;
      const session: AdapterSession = {
        sessionToken: row.session.sessionToken,
        userId: row.session.userId,
        expires: row.session.expires,
      };
      return { session, user: toUser(row.user) };
    },

    async updateSession(session) {
      const [row] = await db
        .update(sessions)
        .set({ expires: session.expires })
        .where(eq(sessions.sessionToken, session.sessionToken))
        .returning();
      return row ? { sessionToken: row.sessionToken, userId: row.userId, expires: row.expires } : null;
    },

    async deleteSession(sessionToken) {
      await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
    },

    async createVerificationToken(token) {
      await db.insert(verificationTokens).values(token);
      return token;
    },

    // Single-use: delete-and-return, so a magic link can't be replayed.
    async useVerificationToken({ identifier, token }) {
      const [row] = await db
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
        .returning();
      return row ?? null;
    },
  };
}
