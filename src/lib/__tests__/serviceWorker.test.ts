import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The service worker is privacy-critical: a phone's cache is no place for a child's picture or a
 * family page. Run public/sw.js in a sandbox and check, request by request, what it intercepts
 * and what it ever writes to the cache.
 */
const ORIGIN = 'https://snickerdoodle.co.uk';
const SRC = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

function loadWorker() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const stored: string[] = [];
  const keyOf = (r: unknown) => (typeof r === 'string' ? new URL(r, ORIGIN).toString() : (r as { url: string }).url);
  const cache = {
    match: async () => undefined,
    put: async (r: unknown) => void stored.push(keyOf(r)),
    add: async (r: unknown) => void stored.push(keyOf(r)),
  };
  const ok = (url: string) => ({ ok: true, type: 'basic', redirected: false, url, clone() { return this; }, text: async () => '<link href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script>' });
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async (r: unknown) => ok(keyOf(r)),
    Response: { error: () => ({ ok: false }) },
    URL,
    Set,
    Promise,
  };
  vm.runInNewContext(SRC, sandbox);
  return { listeners, stored };
}

async function dispatch(w: ReturnType<typeof loadWorker>, url: string, init: { method?: string; mode?: string } = {}) {
  let responded: Promise<unknown> | null = null;
  const waits: Promise<unknown>[] = [];
  w.listeners.fetch!({
    request: { url: new URL(url, ORIGIN).toString(), method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' },
    respondWith: (p: Promise<unknown>) => void (responded = p),
    waitUntil: (p: Promise<unknown>) => void waits.push(p),
  });
  if (responded) await responded;
  await Promise.all(waits);
  await new Promise((r) => setTimeout(r, 0));
  return responded !== null;
}

describe('service worker — privacy-safe caching', () => {
  it('install caches only the offline page, its build assets and brand files', async () => {
    const w = loadWorker();
    let done: Promise<unknown> = Promise.resolve();
    w.listeners.install!({ waitUntil: (p: Promise<unknown>) => void (done = p) });
    await done;
    for (const u of w.stored) {
      const p = new URL(u).pathname;
      expect(p === '/offline' || p.startsWith('/_next/static/') || p.startsWith('/brand/') || p === '/manifest.webmanifest', p).toBe(true);
    }
    expect(w.stored).toContain(`${ORIGIN}/offline`);
    expect(w.stored).toContain(`${ORIGIN}/_next/static/css/app.css`);
  });

  it('never caches a page, an API call, a gift/join link, an image route or anything off-site', async () => {
    const w = loadWorker();
    const privateish: [string, { method?: string; mode?: string }][] = [
      ['/home', { mode: 'navigate' }],
      ['/family', { mode: 'navigate' }],
      ['/g/sometoken', { mode: 'navigate' }],
      ['/join/sometoken', { mode: 'navigate' }],
      ['/checkout', { mode: 'navigate' }],
      ['/api/gift/tok/preview/asset', {}],
      ['/api/profile-image/abc', {}],
      ['/api/waitlist/unsubscribe?t=x', {}],
      ['/home?_rsc=abc', {}],
      ['/_next/image?url=%2Fapi%2Fasset%2F1&w=640&q=75', {}],
      ['https://snickerdoodle-originals.s3.eu-west-2.amazonaws.com/child.png?X-Amz-Signature=abc', {}],
      ['/studio', { method: 'POST' }],
    ];
    for (const [url, init] of privateish) await dispatch(w, url, init);
    expect(w.stored).toEqual([]);
  });

  it('does not even intercept API, RSC, image-optimiser or cross-origin requests', async () => {
    const w = loadWorker();
    for (const url of ['/api/gift/tok/preview/a', '/home?_rsc=1', '/_next/image?url=x', 'https://s3.example.com/x.png', '/examples/x.webp']) {
      expect(await dispatch(w, url), url).toBe(false);
    }
  });

  it('caches hashed build assets and brand icons (identical for every visitor)', async () => {
    const w = loadWorker();
    await dispatch(w, '/_next/static/chunks/app-123.js');
    await dispatch(w, '/_next/static/media/bricolage.woff2');
    await dispatch(w, '/brand/icon-192.png');
    expect(w.stored).toEqual([
      `${ORIGIN}/_next/static/chunks/app-123.js`,
      `${ORIGIN}/_next/static/media/bricolage.woff2`,
      `${ORIGIN}/brand/icon-192.png`,
    ]);
  });
});
