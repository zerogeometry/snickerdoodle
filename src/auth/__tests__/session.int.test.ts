import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

const req = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({
  headers: async () => req.headers,
  cookies: async () => ({ get: () => undefined }),
}));

/**
 * The real Auth.js handler over a real Postgres session: GET /api/auth/session (which any script on the
 * page can call) must never return `sessionToken`, the httpOnly login cookie's secret. And the server's
 * own reader, getCurrentAccount(), still knows who is signed in. Skipped without DATABASE_URL.
 */
const URL = process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= 'session-int-test-secret';

describe.skipIf(!URL)('the session endpoint keeps the login secret off the page', () => {
  const nonce = randomUUID().slice(0, 8);
  const accountId = randomUUID();
  const email = `session-${nonce}@example.com`;
  const sessionToken = `sess-secret-${nonce}`;
  const cookie = `authjs.session-token=${sessionToken}`;
  let db: import('@/server/db').DbHandle;
  let schema: typeof import('@/db/schema');

  beforeAll(async () => {
    schema = await import('@/db/schema');
    db = (await import('@/db/client')).getDb() as unknown as import('@/server/db').DbHandle;
    await db.insert(schema.accounts).values({ id: accountId, email, displayName: 'Sam' });
    await db.insert(schema.sessions).values({ sessionToken, userId: accountId, expires: new Date(Date.now() + 86_400_000) });
  });

  afterAll(async () => {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, accountId));
    await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
  });

  it('GET /api/auth/session answers with who is signed in, and nothing else', async () => {
    const { handlers } = await import('@/auth');
    const res = await handlers.GET(new NextRequest('http://localhost:3307/api/auth/session', { headers: { cookie } }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(sessionToken);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['expires', 'user']);
    expect(body.user).toEqual({ id: accountId, email, name: 'Sam' });
    expect(typeof body.expires).toBe('string');
  });

  it('a stranger with no cookie gets nothing', async () => {
    const { handlers } = await import('@/auth');
    const res = await handlers.GET(new NextRequest('http://localhost:3307/api/auth/session'));
    expect(await res.json()).toBeNull();
  });

  it('the server still knows who is signed in (getCurrentAccount over auth())', async () => {
    req.headers = new Headers({ cookie });
    const { getCurrentAccount } = await import('@/server/session');
    expect(await getCurrentAccount()).toEqual({ id: accountId, email, name: 'Sam' });
    const { auth } = await import('@/auth');
    expect(JSON.stringify(await auth())).not.toContain(sessionToken);
  });
});
