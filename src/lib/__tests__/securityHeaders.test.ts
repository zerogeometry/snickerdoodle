import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };

describe('security headers on every response', () => {
  it('blocks framing, sniffing and token leaks; HTTPS only; camera for us alone', async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    const all = rules.find((r) => r.source === '/:path*')!;
    const h = Object.fromEntries(all.headers.map((x) => [x.key.toLowerCase(), x.value]));
    // the page CSP is per request (nonce) — the middleware sends it; see csp.test.ts
    expect(h['content-security-policy']).toBeUndefined();
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
    expect(h['permissions-policy']).toContain('camera=(self)');
    expect(h['permissions-policy']).toContain('microphone=()');
  });

  it('the static files the middleware skips still get a policy that runs and frames nothing', async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    for (const source of ['/_next/static/:path*', '/_next/image']) {
      const csp = rules.find((r) => r.source === source)?.headers.find((x) => x.key === 'Content-Security-Policy')?.value ?? '';
      expect(csp, source).toContain("default-src 'none'");
      expect(csp, source).toContain("frame-ancestors 'none'");
      expect(csp, source).not.toMatch(/script-src/);
    }
  });

  it('the private app is never indexed; the marketing home page can be', async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    const noindex = new Set(rules.filter((r) => r.headers.some((x) => x.key === 'X-Robots-Tag')).map((r) => r.source));
    for (const p of ['/home', '/home/:path*', '/g/:path*', '/checkout', '/family/:path*', '/account', '/api/:path*', '/join/:path*']) expect(noindex.has(p), p).toBe(true);
    expect(noindex.has('/')).toBe(false);
  });
});
