import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { rateLimitAll, authGet } = vi.hoisted(() => ({
  rateLimitAll: vi.fn(async (..._args: unknown[]) => ({ ok: true, retryAfterSec: 0 })),
  authGet: vi.fn(async (..._args: unknown[]) => new Response(null, { status: 302, headers: { Location: '/home' } })),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/auth', () => ({ handlers: { GET: authGet, POST: vi.fn() } }));
vi.mock('@/server/rateLimit', async (orig) => ({ ...(await orig<typeof import('@/server/rateLimit')>()), rateLimitAll }));

import { GET } from '../route';

const get = (path: string) => GET(new NextRequest(new URL(path, 'http://localhost:3307')));

describe('the sign-in code cannot be guessed: every link open or typed code counts', () => {
  beforeEach(() => {
    rateLimitAll.mockClear();
    authGet.mockClear();
  });

  it('counts each try against the email (lowercased) and the device, then lets Auth.js check it', async () => {
    const res = await get('/api/auth/callback/email?token=K7MP42QX&email=Sam%40X.test&callbackUrl=%2Fhome');
    expect(res.status).toBe(302);
    const limits = rateLimitAll.mock.calls[0]![1] as Array<{ bucket: string; caller: string; failClosed?: boolean }>;
    expect(limits.map((l) => l.bucket)).toEqual(['sign-in-try:email', 'sign-in-try:ip']);
    expect(limits[0]!.caller).toBe('sam@x.test');
    expect(limits.every((l) => l.failClosed)).toBe(true); // a broken counter never means unlimited guesses
    expect(authGet).toHaveBeenCalledTimes(1);
  });

  it('over the limit: back to the sign-in card, and Auth.js never sees the guess', async () => {
    rateLimitAll.mockResolvedValueOnce({ ok: false, retryAfterSec: 600 });
    const res = await get('/api/auth/callback/email?token=AAAAAAAA&email=sam%40x.test');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login?error=TooManyTries');
    expect(authGet).not.toHaveBeenCalled();
  });

  it('other Auth.js calls (the session, csrf) are not counted', async () => {
    await get('/api/auth/session');
    expect(rateLimitAll).not.toHaveBeenCalled();
    expect(authGet).toHaveBeenCalledTimes(1);
  });
});
