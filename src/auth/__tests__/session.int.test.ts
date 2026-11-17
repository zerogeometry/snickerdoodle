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

  it('a visit pushes the sign-in on to a year from now (founder, 17 Nov), in the database and the cookie', async () => {
    // a sign-in last refreshed long ago (its expiry is a day off), so this visit is due to refresh it
    const oldToken = `sess-old-${nonce}`;
    await db.insert(schema.sessions).values({ sessionToken: oldToken, userId: accountId, expires: new Date(Date.now() + 86_400_000) });
    const { handlers } = await import('@/auth');
    const res = await handlers.GET(
      new NextRequest('http://localhost:3307/api/auth/session', { headers: { cookie: `authjs.session-token=${oldToken}` } }),
    );
    expect(res.status).toBe(200);
    const day = 86_400_000;
    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, oldToken));
    expect(row!.expires.getTime()).toBeGreaterThan(Date.now() + 364 * day);
    expect(row!.expires.getTime()).toBeLessThanOrEqual(Date.now() + 366 * day);
    const setCookie = res.headers.get('set-cookie') ?? '';
    const expiresAttr = /authjs\.session-token=[^;]+;[^]*?Expires=([^;]+)/i.exec(setCookie)?.[1];
    expect(expiresAttr).toBeTruthy();
    expect(new Date(expiresAttr!).getTime()).toBeGreaterThan(Date.now() + 364 * day);
  });

  it('a sign-in seen within the day is left alone (no database write on every page)', async () => {
    const { SESSION_MAX_AGE_S } = await import('@/auth/sessionPolicy');
    const freshToken = `sess-fresh-${nonce}`;
    const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000 - 60_000);
    await db.insert(schema.sessions).values({ sessionToken: freshToken, userId: accountId, expires });
    const { handlers } = await import('@/auth');
    await handlers.GET(
      new NextRequest('http://localhost:3307/api/auth/session', { headers: { cookie: `authjs.session-token=${freshToken}` } }),
    );
    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, freshToken));
    expect(row!.expires.getTime()).toBe(expires.getTime());
  });

  it('the server still knows who is signed in (getCurrentAccount over auth())', async () => {
    // a real request names its host and protocol; with no AUTH_URL (as in CI) Auth.js reads them, and with no
    // protocol it assumes https, whose cookie has the __Secure- name, so this plain-http cookie would go unread
    req.headers = new Headers({ cookie, host: 'localhost:3307', 'x-forwarded-proto': 'http' });
    const { getCurrentAccount } = await import('@/server/session');
    expect(await getCurrentAccount()).toEqual({ id: accountId, email, name: 'Sam' });
    const { auth } = await import('@/auth');
    expect(JSON.stringify(await auth())).not.toContain(sessionToken);
  });
});
