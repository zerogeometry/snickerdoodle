import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/server/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/server/rateLimit')>()),
  rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })),
}));

import { POST } from '../route';

const post = (fields: Record<string, string>, url = 'http://localhost:3307/api/test-gate') => {
  const body = new URLSearchParams(fields);
  return POST(new NextRequest(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
};

describe('07-B16: after the right password the gate goes back to the page asked for', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_MODE', 'test');
    vi.stubEnv('TEST_SITE_PASSWORD', 'a-long-test-password');
    vi.stubEnv('AUTH_SECRET', 'local-secret-for-this-test');
  });

  it('keeps next (path + query), sets the lock cookie, and answers with a RELATIVE redirect', async () => {
    const res = await post({ password: 'a-long-test-password', next: '/home?family=x' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/home?family=x');
    expect(res.headers.get('set-cookie')).toContain('sd_test_gate=');
  });

  it('…even when the request’s own URL names another host (behind a proxy)', async () => {
    const res = await post({ password: 'a-long-test-password', next: '/customize/mug' }, 'http://deploy-preview.internal:8080/api/test-gate');
    expect(res.headers.get('location')).toBe('/customize/mug');
  });

  it('never off the site; a wrong password goes back to the gate, still carrying next', async () => {
    for (const evil of ['//evil.example', '/\\evil.example', 'https://evil.example/x']) {
      expect((await post({ password: 'a-long-test-password', next: evil })).headers.get('location')).toBe('/');
    }
    const wrong = await post({ password: 'nope', next: '/home' });
    expect(wrong.headers.get('location')).toBe(`/test-gate?wrong=1&next=${encodeURIComponent('/home')}`);
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });
});
