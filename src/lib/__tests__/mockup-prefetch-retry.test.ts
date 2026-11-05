import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Whatever waits on a set of photos (whenMockupsSettled — the family set tile) must not count a request
 * that hiccups (a slow host timing out) as settled straight away — the photo is asked for again, after a
 * pause, and the wait goes on (founder, 23 Oct: "the loading animation is disappearing before the
 * catalogue appears").
 */
const req = (n: number) => ({ assetId: 'a1', variantId: `v${n}`, size: 'thumb' as const, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } });

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  decode = () => Promise.resolve();
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

describe('the range waits through a hiccup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubGlobal('window', { Image: FakeImage });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a timed-out request is asked again; settled only once every photo is in', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        calls++;
        const items = JSON.parse(init.body).items as { variantId: string }[];
        if (calls === 1) return { ok: false, json: async () => ({}) }; // the first request times out (504)
        return { ok: true, json: async () => ({ results: items.map((i) => ({ ok: true, url: `https://x/${i.variantId}.webp` })) }) };
      }),
    );
    const m = await import('@/lib/mockupPrefetch');
    const reqs = [req(1), req(2), req(3)];
    const settled = vi.fn();
    m.whenMockupsSettled(reqs.map(m.mockupKey), settled);
    m.prefetchMockups(reqs);

    await vi.advanceTimersByTimeAsync(50);
    expect(settled).not.toHaveBeenCalled(); // the hiccup alone doesn't lift the loader
    await vi.advanceTimersByTimeAsync(3000); // the retries, then the photos load
    expect(settled).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3 + 1); // one request per photo, then the one that timed out again
  });

  it('after the last try it stops waiting (the tile retries itself when shown)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const m = await import('@/lib/mockupPrefetch');
    const reqs = [req(1)];
    const settled = vi.fn();
    m.whenMockupsSettled(reqs.map(m.mockupKey), settled);
    m.prefetchMockups(reqs);
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
