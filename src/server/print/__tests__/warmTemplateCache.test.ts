import { describe, expect, it, vi } from 'vitest';
import type { DbHandle } from '@/server/db';

/**
 * The post-deploy warm-up of the product photos (~19 s on the live box) must not compete with the first
 * shoppers' previews: one photo at a time, yielding between them, and stepping aside while a preview is
 * being composed — but it still finishes.
 */
let live = 0;
let most = 0;
const fetched: string[] = [];
vi.mock('@/storage', async (orig) => ({
  ...(await orig<typeof import('@/storage')>()),
  getObjectBytes: vi.fn(async (key: string) => {
    live++;
    most = Math.max(most, live);
    await new Promise((ok) => setTimeout(ok, 2));
    live--;
    fetched.push(key);
    return Buffer.alloc(100);
  }),
}));

const rows = Array.from({ length: 6 }, (_, i) => ({ key: `templates/photo-${i}.png`, byteSize: 100 }));
const db = { select: () => ({ from: async () => rows }) } as unknown as DbHandle;

describe('warmTemplateCache', () => {
  it('fetches the photos one at a time', async () => {
    const { warmTemplateCache, clearMockupCaches } = await import('@/server/print/compositor');
    clearMockupCaches();
    fetched.length = 0;
    most = 0;
    const r = await warmTemplateCache(db, 1_000_000, { busy: () => false });
    expect(r.layers).toBe(6);
    expect(most).toBe(1);
  });

  it('waits while a live preview is being composed, then carries on', async () => {
    const { warmTemplateCache, clearMockupCaches } = await import('@/server/print/compositor');
    clearMockupCaches();
    fetched.length = 0;
    const until = Date.now() + 120;
    const t0 = Date.now();
    let firstAt = 0;
    const r = await warmTemplateCache(db, 1_000_000, {
      busy: () => {
        if (!firstAt && fetched.length) firstAt = Date.now();
        return Date.now() < until;
      },
      pauseMs: 10,
      maxWaitMs: 5000,
    });
    expect(r.layers).toBe(6);
    expect((firstAt || Date.now()) - t0).toBeGreaterThanOrEqual(100); // nothing fetched while busy
  });

  it('never waits for ever: a box that stays busy still gets warmed, a little at a time', async () => {
    const { warmTemplateCache, clearMockupCaches } = await import('@/server/print/compositor');
    clearMockupCaches();
    const r = await warmTemplateCache(db, 1_000_000, { busy: () => true, pauseMs: 5, maxWaitMs: 20 });
    expect(r.layers).toBe(6);
  });
});
