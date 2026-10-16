import { describe, expect, it, vi } from 'vitest';
import { gateCookieValid, gateToken, isGateExempt, sameSitePath, testSiteProblems } from '@/lib/siteMode';
import { encryptionFor } from '@/storage/objects';
import { resendMailer, resolveMailer } from '@/server/mail';

const SAFE = { SITE_MODE: 'test', TEST_SITE_PASSWORD: 'cinnamon-sugar-42', AUTH_SECRET: 's3cret', STRIPE_SECRET_KEY: 'sk_test_abc', NODE_ENV: 'production' };

describe('test site — can never become real', () => {
  it('a safe test site has no problems; the real site is never judged by these rules', () => {
    expect(testSiteProblems(SAFE)).toEqual([]);
    expect(testSiteProblems({ STRIPE_SECRET_KEY: 'sk_live_x', POD_MODE: 'LIVE' })).toEqual([]);
  });

  it('refuses real money, real printing, the LG3 gate, and a missing/short password', () => {
    expect(testSiteProblems({ ...SAFE, STRIPE_SECRET_KEY: 'sk_live_abc' }).join()).toMatch(/LIVE Stripe/);
    expect(testSiteProblems({ ...SAFE, STRIPE_SECRET_KEY: 'rk_live_abc' }).join()).toMatch(/LIVE Stripe/);
    expect(testSiteProblems({ ...SAFE, POD_MODE: 'LIVE' }).join()).toMatch(/never prints/);
    expect(testSiteProblems({ ...SAFE, LG3_TRANSFER_ASSESSMENT_SIGNED_OFF: 'true' }).join()).toMatch(/LG3/);
    expect(testSiteProblems({ ...SAFE, TEST_SITE_PASSWORD: undefined }).join()).toMatch(/PASSWORD/);
    expect(testSiteProblems({ ...SAFE, TEST_SITE_PASSWORD: 'short' }).join()).toMatch(/PASSWORD/);
  });
});

describe('storage encryption on the test site', () => {
  const orig = 'assets/a1/original';
  it('the real site still refuses to store an original without our KMS key', () => {
    expect(() => encryptionFor(orig, { NODE_ENV: 'production' })).toThrow(/required in production/);
  });
  it('a SAFE test site may use the provider’s own encryption', () => {
    expect(encryptionFor(orig, SAFE)).toEqual({});
  });
  it('an UNSAFE test site gets no exception', () => {
    expect(() => encryptionFor(orig, { ...SAFE, STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow(/required in production/);
  });
  it('a KMS key, when set, is always used', () => {
    expect(encryptionFor(orig, { ...SAFE, S3_KMS_KEY_ALIAS_ORIGINALS: 'alias/o' })).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/o' });
  });
});

describe('the password lock', () => {
  it('only the right cookie opens it, and changing the password locks everyone out again', async () => {
    const good = await gateToken(SAFE);
    expect(await gateCookieValid(good, SAFE)).toBe(true);
    expect(await gateCookieValid(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'), SAFE)).toBe(false);
    expect(await gateCookieValid(undefined, SAFE)).toBe(false);
    expect(await gateCookieValid(good, { ...SAFE, TEST_SITE_PASSWORD: 'a-new-password-9' })).toBe(false);
  });
  it('after the password, only ever goes back to a page on this site', () => {
    const base = 'https://test.example/api/test-gate';
    expect(sameSitePath('/start-creating?x=1', base)).toBe('/start-creating?x=1');
    for (const evil of ['//evil.example', '/\\evil.example', '\\\\evil.example', 'https://evil.example/x', 'javascript:alert(1)']) expect(sameSitePath(evil, base)).toBe('/');
  });
  it('lets through only the lock itself, signed webhooks/jobs and static brand files', () => {
    for (const p of ['/test-gate', '/api/test-gate', '/api/webhooks/stripe', '/api/jobs/retention', '/_next/static/x.js', '/brand/logo.webp']) expect(isGateExempt(p)).toBe(true);
    for (const p of ['/', '/home', '/studio', '/g/abc', '/api/admin/review/keepsake/1', '/api/mockup/x.png', '/admin/review']) expect(isGateExempt(p)).toBe(false);
  });
});

describe('Resend mailer', () => {
  it('posts the message and throws on failure — never a silent drop', async () => {
    const ok = vi.fn(async () => new Response('{}', { status: 200 }));
    await resendMailer('re_test', 'snickerdoodle <hello@test.example>', ok as unknown as typeof fetch).send({ kind: 'magic-link', to: 'a@b.c', subject: 'hi', text: 'link' });
    const [, init] = ok.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['a@b.c'], subject: 'hi', text: 'link' });
    const bad = vi.fn(async () => new Response('no', { status: 403 }));
    await expect(resendMailer('re_test', 'x@y.z', bad as unknown as typeof fetch).send({ kind: 'magic-link', to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(/not sent/);
  });
  it('needs its key and sender', () => {
    expect(() => resolveMailer({ MAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });
});
