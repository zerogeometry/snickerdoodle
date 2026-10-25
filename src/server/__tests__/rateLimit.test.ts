import { describe, expect, it } from 'vitest';
import { callerKey, ipFromHeaders, LIMITS } from '@/server/rateLimit';

const h = (o: Record<string, string>) => new Headers(o);

describe('rate limiter — who is calling, and the limits themselves', () => {
  it('trusts the platform’s own client-IP header over ones a visitor can set', () => {
    expect(ipFromHeaders(h({ 'x-nf-client-connection-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.7');
    expect(ipFromHeaders(h({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(ipFromHeaders(h({ 'x-forwarded-for': '192.0.2.10, 10.0.0.1' }))).toBe('192.0.2.10');
    expect(ipFromHeaders(h({}))).toBe('unknown');
  });

  it('with CLIENT_IP_HEADER (the AWS box), reads ONLY that header — a visitor-set one never wins', () => {
    const box = { CLIENT_IP_HEADER: 'X-Real-IP' };
    // Caddy overwrites x-real-ip; whatever else a visitor sends is ignored
    expect(ipFromHeaders(h({ 'x-real-ip': '198.51.100.2', 'x-nf-client-connection-ip': '6.6.6.6', 'x-forwarded-for': '7.7.7.7' }), box)).toBe('198.51.100.2');
    // the proxy didn't set it (misconfigured): one shared bucket, never the visitor's choice
    expect(ipFromHeaders(h({ 'x-nf-client-connection-ip': '6.6.6.6', 'x-forwarded-for': '7.7.7.7' }), box)).toBe('unknown');
    expect(ipFromHeaders(h({ 'x-forwarded-for': '192.0.2.10, 10.0.0.1' }), { CLIENT_IP_HEADER: 'x-forwarded-for' })).toBe('192.0.2.10');
    // unset or blank: the platform-first order above
    expect(ipFromHeaders(h({ 'x-nf-client-connection-ip': '203.0.113.7' }), { CLIENT_IP_HEADER: ' ' })).toBe('203.0.113.7');
  });

  it('stores a keyed fingerprint, never the email/IP — and the same person always maps to the same key', () => {
    const k = callerKey('magic-link:email', 'Parent@Example.com', 's3cret');
    expect(k).toMatch(/^magic-link:email:[\w-]{32}$/);
    expect(k).not.toContain('example');
    expect(callerKey('magic-link:email', ' parent@example.com ', 's3cret')).toBe(k); // case/space-insensitive
    expect(callerKey('magic-link:email', 'parent@example.com', 'other-secret')).not.toBe(k); // keyed
    expect(callerKey('magic-link:ip', 'parent@example.com', 's3cret')).not.toBe(k); // per bucket
  });

  it('guessing targets fail CLOSED and are tight; everyday actions are generous', () => {
    expect(LIMITS.testGatePerIp).toMatchObject({ failClosed: true });
    expect(LIMITS.mfaPerAccount).toMatchObject({ failClosed: true });
    expect(LIMITS.mfaPerAccount.limit).toBeLessThanOrEqual(5);
    expect(LIMITS.magicLinkPerEmail.limit).toBeLessThanOrEqual(5);
    // a whole range (≈21 tiles) + its colour strips + a few customize pages fits many times over
    expect(LIMITS.mockupsPerIp.limit).toBeGreaterThanOrEqual(500);
    expect(LIMITS.guestUploadPerIp.limit).toBeGreaterThanOrEqual(30);
    expect(new Set(Object.values(LIMITS).map((x) => x.bucket)).size).toBe(Object.keys(LIMITS).length); // no two limits share a counter
    for (const l of Object.values(LIMITS)) expect(l.windowSec).toBeGreaterThan(0);
  });
});
