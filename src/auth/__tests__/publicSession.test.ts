import { describe, expect, it } from 'vitest';
import { publicSession } from '../publicSession';

/**
 * Security: the page's own JavaScript can read GET /api/auth/session. What Auth.js hands the session
 * callback (database strategy) carries `sessionToken`, the login cookie's secret; none of it may leak.
 */
describe('the session the page can read never holds the login secret', () => {
  // Exactly the shape Auth.js passes in: the stored session merged with the account.
  const stored = {
    sessionToken: 'secret-session-token',
    userId: 'acc-1',
    expires: new Date('2026-12-16T10:00:00.000Z'),
    user: { id: 'acc-1', email: 'sam@x.test', emailVerified: null, name: 'Sam' },
  };
  const user = { id: 'acc-1', email: 'sam@x.test', emailVerified: null, name: 'Sam', image: undefined };

  it('keeps only who is signed in and when it runs out', () => {
    expect(publicSession(stored, user)).toEqual({
      user: { id: 'acc-1', email: 'sam@x.test', name: 'Sam' },
      expires: '2026-12-16T10:00:00.000Z',
    });
  });

  it('has no sessionToken or userId anywhere in it', () => {
    const json = JSON.stringify(publicSession(stored, user));
    expect(json).not.toContain('secret-session-token');
    expect(json).not.toContain('sessionToken');
    expect(json).not.toContain('userId');
  });

  it('drops any other field the account row might carry', () => {
    const wider = { ...user, isAdmin: true, mfaSecret: 'totp-secret', passwordHash: 'x' };
    const out = publicSession(stored, wider);
    expect(Object.keys(out.user!).sort()).toEqual(['email', 'id', 'name']);
    expect(JSON.stringify(out)).not.toContain('totp-secret');
  });

  it('a nameless account reads as name null, and an expiry given as text passes through', () => {
    const out = publicSession({ expires: '2026-12-16T10:00:00.000Z' }, { id: 'acc-2', email: 'jo@x.test' });
    expect(out).toEqual({ user: { id: 'acc-2', email: 'jo@x.test', name: null }, expires: '2026-12-16T10:00:00.000Z' });
  });
});
