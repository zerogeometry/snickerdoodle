import { describe, expect, it } from 'vitest';
import { ByteLru, faceCache, forgetAssetPreviews } from '@/server/print/previewCache';

const buf = (n: number) => Buffer.alloc(n);
const face = (n: number) => ({ data: Buffer.alloc(n), width: n, height: 1, channels: 1 as const });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('ByteLru — the compositor’s bounded in-process cache', () => {
  it('makes a value once; later (and concurrent) gets share it', async () => {
    const c = new ByteLru<Buffer>(1000, (b) => b.byteLength);
    let made = 0;
    const make = async () => { made++; return buf(10); };
    const [a, b] = await Promise.all([c.get('k', make), c.get('k', make)]);
    expect(await c.get('k', make)).toBe(a);
    expect(b).toBe(a);
    expect(made).toBe(1);
  });

  it('stays within its byte budget, dropping the least-recently-used first', async () => {
    const c = new ByteLru<Buffer>(300, (b) => b.byteLength);
    await c.get('a', async () => buf(100));
    await c.get('b', async () => buf(100));
    await c.get('c', async () => buf(100));
    await c.get('a', async () => buf(100)); // touch a → b is now the oldest
    await c.get('d', async () => buf(100));
    await settle();
    expect(c.bytes).toBeLessThanOrEqual(300);
    let remade = '';
    await c.get('b', async () => { remade += 'b'; return buf(100); });
    await c.get('a', async () => { remade += 'a'; return buf(100); });
    expect(remade).toBe('b'); // b was evicted, a survived
  });

  it('never keeps a value bigger than the whole budget', async () => {
    const c = new ByteLru<Buffer>(50, (b) => b.byteLength);
    await c.get('huge', async () => buf(51));
    await settle();
    expect(c.size).toBe(0);
    expect(c.bytes).toBe(0);
  });

  it('never caches a failure', async () => {
    const c = new ByteLru<Buffer>(1000, (b) => b.byteLength);
    await expect(c.get('k', async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    await settle();
    expect(await c.get('k', async () => buf(1))).toHaveLength(1);
  });

  it('drops an entry idle longer than its lifetime', async () => {
    let now = 0;
    const c = new ByteLru<Buffer>(1000, (b) => b.byteLength, 1000, () => now);
    await c.get('k', async () => buf(1));
    now = 999;
    let made = 0;
    await c.get('k', async () => { made++; return buf(1); }); // still fresh (and the touch renews it)
    now = 1999 + 1;
    await c.get('k', async () => { made++; return buf(1); }); // idle > 1000 → made again
    expect(made).toBe(1);
  });

  it('forgets by key prefix, and an entry dropped mid-make is never re-added', async () => {
    const c = new ByteLru<Buffer>(1000, (b) => b.byteLength);
    await c.get('asset1|x', async () => buf(10));
    await c.get('asset2|x', async () => buf(10));
    let release!: (b: Buffer) => void;
    const pending = c.get('asset1|y', () => new Promise<Buffer>((r) => (release = r)));
    c.forget('asset1|');
    release(buf(10));
    await pending;
    await settle();
    expect(c.size).toBe(1);
    expect(c.bytes).toBe(10);
  });
});

describe('printed-face cache (made from a child’s drawing)', () => {
  it('is short-lived and erasing the asset drops its faces at once', async () => {
    faceCache.clear();
    await faceCache.get('asset-a|obj.sha|pattern|…', async () => face(5));
    await faceCache.get('asset-b|obj.sha|pattern|…', async () => face(5));
    forgetAssetPreviews('asset-a');
    expect(faceCache.size).toBe(1);
    let remade = false;
    await faceCache.get('asset-a|obj.sha|pattern|…', async () => { remade = true; return face(5); });
    expect(remade).toBe(true);
    faceCache.clear();
  });
});
