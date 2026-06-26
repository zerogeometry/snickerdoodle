import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, sessions, verificationTokens } from '@/db/schema';
import { DrizzleAccountsAdapter } from '@/auth/adapter';
import type { DbHandle } from '@/server/db';

/**
 * The Auth.js adapter against a real Postgres. Locks the trust-critical bits:
 * single-use magic-link tokens and server-side session revocation. Skipped
 * without DATABASE_URL. Run: DATABASE_URL=… npx vitest run src/auth
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('Auth.js Drizzle adapter — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let adapter: ReturnType<typeof DrizzleAccountsAdapter>;
  const nonce = randomUUID().slice(0, 8);
  const email = `adapter-${nonce}@example.com`;
  const created: string[] = [];

  beforeAll(() => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    adapter = DrizzleAccountsAdapter(db);
  });

  afterAll(async () => {
    await db.delete(sessions).where(inArray(sessions.userId, created.length ? created : ['00000000-0000-0000-0000-000000000000']));
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    if (created.length) await db.delete(accounts).where(inArray(accounts.id, created));
    await client.end();
  });

  it('creates a user and finds it by id and (lowercased) email', async () => {
    const id = randomUUID();
    const user = await adapter.createUser!({ id, email: email.toUpperCase(), emailVerified: null });
    created.push(user.id);
    expect(user.email).toBe(email); // stored lowercased
    expect((await adapter.getUser!(id))?.email).toBe(email);
    expect((await adapter.getUserByEmail!(email))?.id).toBe(id);
    expect(await adapter.getUserByEmail!('nobody-' + nonce + '@example.com')).toBeNull();
  });

  it('verification tokens are single-use', async () => {
    const token = `tok-${nonce}`;
    const expires = new Date(Date.now() + 60_000);
    await adapter.createVerificationToken!({ identifier: email, token, expires });
    const first = await adapter.useVerificationToken!({ identifier: email, token });
    expect(first?.token).toBe(token);
    const second = await adapter.useVerificationToken!({ identifier: email, token });
    expect(second).toBeNull(); // already consumed — a link can't be replayed
  });

  it('creates a session, reads session+user, and revocation deletes it', async () => {
    const id = randomUUID();
    await adapter.createUser!({ id, email: `sess-${nonce}@example.com`, emailVerified: null });
    created.push(id);

    const sessionToken = `sess-tok-${nonce}`;
    await adapter.createSession!({ sessionToken, userId: id, expires: new Date(Date.now() + 3_600_000) });

    const got = await adapter.getSessionAndUser!(sessionToken);
    expect(got?.user.id).toBe(id);
    expect(got?.session.sessionToken).toBe(sessionToken);

    await adapter.deleteSession!(sessionToken);
    expect(await adapter.getSessionAndUser!(sessionToken)).toBeNull();
  });

  it('updateUser marks the email verified', async () => {
    const id = created[0]!;
    const when = new Date();
    const updated = await adapter.updateUser!({ id, emailVerified: when });
    expect(updated.emailVerified).not.toBeNull();
    const reread = await db.select().from(accounts).where(and(eq(accounts.id, id)));
    expect(reread[0]?.emailVerifiedAt).not.toBeNull();
  });
});
