import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as testGate } from '@/app/api/test-gate/route';

const DB = process.env.DATABASE_URL;

/** The test site's password: 10 tries per device per 15 minutes, then it says so (and lets nobody in). */
describe.skipIf(!DB)('rate limits wired in — the test-site password (integration)', () => {
  const saved = { mode: process.env.SITE_MODE, pw: process.env.TEST_SITE_PASSWORD, secret: process.env.AUTH_SECRET };
  beforeAll(() => {
    process.env.SITE_MODE = 'test';
    process.env.TEST_SITE_PASSWORD = 'the-right-password-123';
    process.env.AUTH_SECRET ??= 'local-only-secret-0123456789abcdefghijklmnop';
  });
  afterAll(() => {
    process.env.SITE_MODE = saved.mode;
    process.env.TEST_SITE_PASSWORD = saved.pw;
    process.env.AUTH_SECRET = saved.secret;
  });

  const attempt = (ip: string, password: string) => {
    const body = new URLSearchParams({ password, next: '/home' });
    return testGate(new NextRequest('https://test.example/api/test-gate', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-nf-client-connection-ip': ip },
    }));
  };

  it('after 10 tries from one device, even the right password is turned away for a while', async () => {
    const ip = `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`;
    for (let i = 0; i < 10; i++) {
      const r = await attempt(ip, i === 9 ? 'the-right-password-123' : 'nope');
      expect(r.headers.get('location')).not.toContain('busy=1');
    }
    const r = await attempt(ip, 'the-right-password-123');
    expect(r.headers.get('location')).toContain('busy=1');
    expect(r.headers.get('set-cookie')).toBeNull(); // no way in
    // another device is unaffected
    const other = await attempt(`198.19.${randomInt(0, 255)}.${randomInt(1, 254)}`, 'the-right-password-123');
    expect(other.headers.get('set-cookie')).toContain('sd_test_gate');
  }, 30_000);
});
