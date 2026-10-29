import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assertTestSiteSafe, isPasswordLocked, isPrivateLive, privateLiveProblems, testSiteProblems } from '@/lib/siteMode';
import { encryptionFor } from '@/storage/objects';

// PRIVATE LIVE (founder, 29 Oct 2026): the real shop behind the shared password, for the founder's
// own end-to-end order. Real money and printing are allowed; the lock, noindex and our KMS keys stay.
const PRIVATE = {
  SITE_MODE: 'private',
  TEST_SITE_PASSWORD: 'cinnamon-sugar-42',
  AUTH_SECRET: 's3cret',
  STRIPE_SECRET_KEY: 'sk_live_abc',
  POD_MODE: 'LIVE',
  LG3_TRANSFER_ASSESSMENT_SIGNED_OFF: 'true',
  NODE_ENV: 'production',
};

describe('private live mode — real orders, still behind the password', () => {
  it('allows a live Stripe key, real printing and the LG3 gate (the test-site rules do not apply)', () => {
    expect(privateLiveProblems(PRIVATE)).toEqual([]);
    expect(testSiteProblems(PRIVATE)).toEqual([]);
    expect(() => assertTestSiteSafe(PRIVATE)).not.toThrow();
  });

  it('is password-locked like the test site; the public site is not', () => {
    expect(isPrivateLive(PRIVATE)).toBe(true);
    expect(isPasswordLocked(PRIVATE)).toBe(true);
    expect(isPasswordLocked({ SITE_MODE: 'test' })).toBe(true);
    expect(isPasswordLocked({})).toBe(false);
  });

  it('refuses to start without a proper password or auth secret', () => {
    expect(privateLiveProblems({ ...PRIVATE, TEST_SITE_PASSWORD: undefined }).join()).toMatch(/PASSWORD/);
    expect(privateLiveProblems({ ...PRIVATE, TEST_SITE_PASSWORD: 'short' }).join()).toMatch(/PASSWORD/);
    expect(privateLiveProblems({ ...PRIVATE, AUTH_SECRET: undefined }).join()).toMatch(/AUTH_SECRET/);
    expect(() => assertTestSiteSafe({ ...PRIVATE, TEST_SITE_PASSWORD: undefined })).toThrow(/private live site/);
  });

  it('refuses a faked season date — a real order must see the real date', () => {
    expect(privateLiveProblems({ ...PRIVATE, SEASON_PREVIEW_DATE: '2026-11-20' }).join()).toMatch(/SEASON_PREVIEW_DATE/);
    expect(privateLiveProblems({ ...PRIVATE, NEXT_PUBLIC_SEASON_PREVIEW_DATE: '2026-11-20' }).join()).toMatch(/SEASON_PREVIEW_DATE/);
  });

  it('an unknown SITE_MODE (a typo) refuses to start instead of quietly dropping the lock', () => {
    for (const mode of ['Private', 'privat', 'live', 'TEST']) expect(() => assertTestSiteSafe({ ...PRIVATE, SITE_MODE: mode })).toThrow(/typo/);
    expect(() => assertTestSiteSafe({ NODE_ENV: 'production' })).not.toThrow(); // unset = the public site
  });

  it('gets NO storage relaxation: an original still needs our KMS key', () => {
    expect(() => encryptionFor('assets/a1/original', PRIVATE)).toThrow(/required in production/);
    expect(encryptionFor('assets/a1/original', { ...PRIVATE, S3_KMS_KEY_ALIAS_ORIGINALS: 'alias/o' })).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/o' });
  });
});

describe('proxy — the private live site sits behind the password', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function run(path: string, env: Record<string, string> = {}) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_FORCE_PATH_STYLE', '');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    return proxy(new NextRequest(new URL(path, 'http://localhost:3100')));
  }

  const env = { SITE_MODE: 'private', TEST_SITE_PASSWORD: 'cinnamon-sugar-42', AUTH_SECRET: 's3cret' };

  it('a page without the password goes to the lock, never indexed', async () => {
    const res = await run('/catalogue', env);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/test-gate?next=%2Fcatalogue');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('an API call without the password is refused; the Stripe webhook still gets through', async () => {
    expect((await run('/api/mockup/x', env)).status).toBe(401);
    expect((await run('/api/webhooks/stripe', env)).status).not.toBe(401);
  });

  it('with the password, pages open — and are still never indexed, even the public ones', async () => {
    const { gateToken } = await import('@/lib/siteMode');
    const token = await gateToken(env);
    vi.stubEnv('NODE_ENV', 'production');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    const req = new NextRequest(new URL('/how-it-works', 'http://localhost:3100'), { headers: { cookie: `sd_test_gate=${token}` } });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});
