import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEV_RELAXATIONS, buildCsp, cspMode, newNonce, storageOrigins } from '@/lib/csp';

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA==';

/** "a b; c d e" → { a: ['b'], c: ['d', 'e'] } */
function parse(csp: string): Record<string, string[]> {
  // (values read back by name below are asserted to exist, hence the `!`s)
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [name = '', ...values] = part.split(/\s+/);
    expect(out[name], `directive ${name} appears once`).toBeUndefined();
    out[name] = values;
  }
  return out;
}

const prod = (storage: string[] = ['https://bucket.s3.eu-west-2.amazonaws.com']) =>
  parse(buildCsp({ nonce: NONCE, mode: 'production', storageOrigins: storage }));

describe('CSP — production is strict', () => {
  it('scripts: own origin + this request’s nonce + strict-dynamic, and nothing else', () => {
    expect(prod()['script-src']).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
  });

  it('never unsafe-eval, never unsafe-inline for scripts, no wildcard or scheme-wide script source', () => {
    const csp = buildCsp({ nonce: NONCE, mode: 'production', storageOrigins: ['https://b.s3.eu-west-2.amazonaws.com'] });
    expect(csp).not.toContain('unsafe-eval');
    const p = parse(csp);
    for (const d of ['script-src', 'default-src']) {
      expect(p[d]).not.toContain("'unsafe-inline'");
      expect(p[d]!.some((v) => v === '*' || v.endsWith(':') || v.includes('*'))).toBe(false);
    }
    // the dev-only relaxations never leak into production, wherever they'd go
    for (const v of [...DEV_RELAXATIONS.script, ...DEV_RELAXATIONS.connect]) expect(csp).not.toContain(v);
  });

  it('no third-party script, frame or worker — Stripe Checkout is a redirect, not an embed', () => {
    const p = prod();
    expect(JSON.stringify(p)).not.toMatch(/stripe/i);
    expect(p['frame-src']).toEqual(["'none'"]);
    expect(p['worker-src']).toEqual(["'none'"]);
  });

  it('keeps the framing/plugin/base/form rules (base tightened to none)', () => {
    const p = prod();
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'self'"]);
    expect(p['default-src']).toEqual(["'self'"]);
  });

  it('images/connections: exactly self, data:, blob: and the private bucket’s origin', () => {
    const p = prod(['https://bucket.s3.eu-west-2.amazonaws.com']);
    expect(p['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https://bucket.s3.eu-west-2.amazonaws.com']);
    expect(p['connect-src']).toEqual(["'self'", 'data:', 'blob:', 'https://bucket.s3.eu-west-2.amazonaws.com']);
    expect(p['font-src']).toEqual(["'self'"]);
  });

  it('styles: self + inline (the known softer edge) — and no nonce there, which would switch inline off', () => {
    expect(prod()['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('without storage configured, no extra origin appears', () => {
    expect(prod([])['img-src']).toEqual(["'self'", 'data:', 'blob:']);
  });

  it('refuses a nonce or origin that could smuggle in a directive', () => {
    expect(() => buildCsp({ nonce: "abc'; script-src *", mode: 'production', storageOrigins: [] })).toThrow(/nonce/);
    expect(() => buildCsp({ nonce: 'short', mode: 'production', storageOrigins: [] })).toThrow(/nonce/);
    expect(() => buildCsp({ nonce: NONCE, mode: 'production', storageOrigins: ['https://x.example; script-src *'] })).toThrow(/origin/);
    expect(() => buildCsp({ nonce: NONCE, mode: 'production', storageOrigins: ['https://x.example/path'] })).toThrow(/origin/);
    expect(() => buildCsp({ nonce: NONCE, mode: 'production', storageOrigins: ['*'] })).toThrow(/origin/);
  });
});

describe('CSP — dev mode relaxes, in one place', () => {
  it('adds eval (React Refresh) and the hot-reload websocket, nothing else', () => {
    const dev = parse(buildCsp({ nonce: NONCE, mode: 'development', storageOrigins: [] }));
    const p = prod([]);
    expect(dev['script-src']).toEqual([...p['script-src']!, ...DEV_RELAXATIONS.script]);
    expect(dev['connect-src']).toEqual([...p['connect-src']!, ...DEV_RELAXATIONS.connect]);
    for (const d of Object.keys(p).filter((k) => k !== 'script-src' && k !== 'connect-src')) expect(dev[d], d).toEqual(p[d]);
  });

  it('only `next dev` is development — production, test and unset are strict', () => {
    expect(cspMode({ NODE_ENV: 'development' })).toBe('development');
    expect(cspMode({ NODE_ENV: 'production' })).toBe('production');
    expect(cspMode({ NODE_ENV: 'test' })).toBe('production');
    expect(cspMode({})).toBe('production');
  });
});

describe('nonce', () => {
  it('is 128-bit base64 and fresh each time', () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(Array.from({ length: 50 }, newNonce)).size).toBe(50);
  });
});

describe('storage origin — exactly what the AWS SDK signs', () => {
  it('real AWS, virtual-hosted (the default)', () => {
    expect(storageOrigins({ S3_BUCKET: 'sd-originals', S3_REGION: 'eu-west-2' })).toEqual(['https://sd-originals.s3.eu-west-2.amazonaws.com']);
    expect(storageOrigins({ S3_BUCKET: 'sd-originals' })).toEqual(['https://sd-originals.s3.eu-west-2.amazonaws.com']);
  });
  it('real AWS, path-style', () => {
    expect(storageOrigins({ S3_BUCKET: 'sd-originals', S3_REGION: 'eu-west-2', S3_FORCE_PATH_STYLE: 'true' })).toEqual(['https://s3.eu-west-2.amazonaws.com']);
  });
  it('local MinIO (path-style, http, port kept)', () => {
    expect(storageOrigins({ S3_BUCKET: 'snickerdoodle-originals', S3_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: 'true' })).toEqual(['http://localhost:9000']);
  });
  it('Supabase test site (endpoint has a path — only the origin is allowed)', () => {
    expect(storageOrigins({ S3_BUCKET: 'originals', S3_ENDPOINT: 'https://abc.supabase.co/storage/v1/s3', S3_FORCE_PATH_STYLE: 'true' })).toEqual(['https://abc.supabase.co']);
  });
  it('custom endpoint, virtual-hosted', () => {
    expect(storageOrigins({ S3_BUCKET: 'originals', S3_ENDPOINT: 'https://storage.example.co.uk' })).toEqual(['https://originals.storage.example.co.uk']);
  });
  it('not configured or nonsense → nothing allowed', () => {
    expect(storageOrigins({})).toEqual([]);
    expect(storageOrigins({ S3_BUCKET: 'b', S3_ENDPOINT: 'javascript:alert(1)' })).toEqual([]);
    expect(storageOrigins({ S3_BUCKET: 'b', S3_ENDPOINT: 'not a url' })).toEqual([]);
    expect(storageOrigins({ S3_BUCKET: 'sd-originals', S3_REGION: 'eu-west-2; script-src *' })).toEqual([]);
  });
});

describe('proxy — sends the policy and hands the nonce to Next', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function run(path: string, env: Record<string, string> = {}) {
    vi.stubEnv('NODE_ENV', 'production');
    // a clean slate: a developer's own .env (e.g. a local MinIO S3_ENDPOINT) must not leak in
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_FORCE_PATH_STYLE', '');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    return proxy(new NextRequest(new URL(path, 'http://localhost:3100')));
  }

  it('every page gets a strict policy whose nonce is also passed on the request (x-nonce + CSP)', async () => {
    const res = await run('/start-creating', { S3_BUCKET: 'sd-originals', S3_REGION: 'eu-west-2' });
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain('https://sd-originals.s3.eu-west-2.amazonaws.com');
    // NextResponse.next({ request: { headers } }) carries the overridden request headers like this
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    // noindex by default: a family page (the collection) is kept out of search…
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    // …while the real site's public marketing pages stay indexable
    expect((await run('/how-it-works')).headers.get('x-robots-tag')).toBeNull();
  });

  it('a new nonce per request', async () => {
    const a = (await run('/')).headers.get('content-security-policy');
    const b = (await run('/')).headers.get('content-security-policy');
    expect(a).not.toEqual(b);
  });

  it('test site: the gate still locks pages and APIs, with the policy and noindex on', async () => {
    const env = { SITE_MODE: 'test', TEST_SITE_PASSWORD: 'cinnamon-sugar-42', AUTH_SECRET: 's3cret' };
    const page = await run('/checkout', env);
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toContain('/test-gate?next=%2Fcheckout');
    expect(page.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-/);
    expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const api = await run('/api/mockup', env);
    expect(api.status).toBe(401);
    const gate = await run('/test-gate', env);
    expect(gate.headers.get('x-middleware-next')).toBe('1');
    expect(gate.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(gate.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });
});

describe('proxy — a dead gift link answers 410 Gone (CLAUDE.md: deleted source → 410)', () => {
  afterEach(() => {
    vi.doUnmock('@/app/g/[token]/status');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function run(path: string, status: 200 | 404 | 410, init?: { method?: string; headers?: Record<string, string> }) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const lookups: string[] = [];
    vi.doMock('@/app/g/[token]/status', async (orig) => ({
      ...(await orig<typeof import('@/app/g/[token]/status')>()),
      giftLinkHttpStatus: async (token: string) => (lookups.push(token), status),
    }));
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest(new URL(path, 'http://localhost:3100'), init));
    return { res, lookups };
  }

  it('a deleted / revoked / expired link: 410, still noindex; an unknown token: 404; a live one: 200', async () => {
    const gone = await run('/g/abcDEF_123-xyz', 410);
    expect(gone.res.status).toBe(410);
    expect(gone.lookups).toEqual(['abcDEF_123-xyz']);
    expect(gone.res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect((await run('/g/abcDEF_123-xyz', 404)).res.status).toBe(404);
    expect((await run('/g/abcDEF_123-xyz', 200)).res.status).toBe(200);
  });

  it('only the page load gets it — the page’s own refreshes / actions and other paths are never looked up', async () => {
    expect((await run('/g/abcDEF_123-xyz', 410, { headers: { rsc: '1' } })).lookups).toEqual([]);
    expect((await run('/g/abcDEF_123-xyz', 410, { method: 'POST' })).lookups).toEqual([]);
    expect((await run('/g/abcDEF_123-xyz/more', 410)).lookups).toEqual([]);
    expect((await run('/home', 410)).lookups).toEqual([]);
  });
});
