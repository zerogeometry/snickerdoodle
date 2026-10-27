import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localHashListProvider } from '../iwfHashList';
import { moderateImage } from '../index';

const h = (algo: string, b: Buffer) => createHash(algo).update(b).digest('hex');
const bad = Buffer.from('known-bad-test-bytes'); // brand-safe stand-in; any bytes work
const fine = Buffer.from('a child drawing of a tractor');

let dir: string;
let n = 0;
async function list(body: string, mode = 0o600): Promise<string> {
  const p = join(dir, `list-${n++}.txt`);
  await writeFile(p, body);
  await chmod(p, mode);
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sd-hashlist-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('IWF hash list (held locally, matched in-process)', () => {
  it('matches on sha256, md5 or sha1 of the exact bytes — typed or bare', async () => {
    for (const body of [`sha256:${h('sha256', bad)}`, `md5:${h('md5', bad).toUpperCase()}`, h('sha1', bad), h('md5', bad)]) {
      const p = localHashListProvider({ path: await list(`# test list\n\n${h('sha256', fine).replace(/./, 'f')}\n${body}\n`) });
      expect(await p.isKnownIllegal({ buffer: bad, sha256: 'ignored' })).toBe(true);
      expect(await p.isKnownIllegal({ buffer: fine, sha256: 'ignored' })).toBe(false);
    }
  });

  it('finds every entry in a bigger, unsorted list with duplicates', async () => {
    const bufs = Array.from({ length: 500 }, (_, i) => Buffer.from(`entry-${i}`));
    const lines = bufs.flatMap((b, i) => (i % 3 ? [`sha256:${h('sha256', b)}`] : [`md5:${h('md5', b)}`, `md5:${h('md5', b)}`])).reverse();
    const p = localHashListProvider({ path: await list(lines.join('\n')) });
    for (const b of bufs) expect(await p.isKnownIllegal({ buffer: b, sha256: '' })).toBe(true);
    expect(await p.isKnownIllegal({ buffer: Buffer.from('entry-500'), sha256: '' })).toBe(false);
    expect(await p.entryCount()).toBe(500);
  });

  it('reloads when the list file is replaced', async () => {
    const path = await list(`sha256:${h('sha256', fine)}`);
    const p = localHashListProvider({ path });
    expect(await p.isKnownIllegal({ buffer: bad, sha256: '' })).toBe(false);
    await writeFile(path, `sha256:${h('sha256', fine)}\nsha256:${h('sha256', bad)}\n`);
    await utimes(path, new Date(), new Date(Date.now() + 1000));
    expect(await p.isKnownIllegal({ buffer: bad, sha256: '' })).toBe(true);
  });

  it('refuses a missing, empty, stale, malformed or world-readable list (throws — the gate turns it into review)', async () => {
    const good = `sha256:${h('sha256', bad)}`;
    const cases: [string, Promise<string>, number?][] = [
      ['missing', Promise.resolve(join(dir, 'nope.txt'))],
      ['empty', list('# nothing\n')],
      ['malformed', list(`${good}\nnot-a-hash-${h('md5', bad)}\n`)],
      ['wrong length for type', list(`md5:${h('sha256', bad)}`)],
      ['world-readable', list(good, 0o644)],
    ];
    for (const [, path] of cases) {
      await expect(localHashListProvider({ path: await path }).isKnownIllegal({ buffer: bad, sha256: '' })).rejects.toThrow();
    }
    const stale = await list(good);
    const old = new Date(Date.now() - 49 * 3_600_000);
    await utimes(stale, old, old);
    await expect(localHashListProvider({ path: stale }).isKnownIllegal({ buffer: bad, sha256: '' })).rejects.toThrow(/out of date/);
    expect(await localHashListProvider({ path: stale, maxAgeHours: 72 }).isKnownIllegal({ buffer: bad, sha256: '' })).toBe(true);
  });

  it('never echoes list content in an error', async () => {
    const secret = h('sha1', bad);
    const p = localHashListProvider({ path: await list(`sha256:${h('sha256', fine)}\nzz:${secret}\n`) });
    const err = await p.isKnownIllegal({ buffer: bad, sha256: '' }).catch((e: Error) => e);
    expect(String((err as Error).message)).toMatch(/line 2/);
    expect(String((err as Error).message)).not.toContain(secret);
  });

  it('through the gate: match → BLOCKED; broken list → FLAGGED for review (never CLEAR, never BLOCKED)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const classifier = { classify: vi.fn(async () => ({ flagged: false, labels: [] })) };
    const hit = localHashListProvider({ path: await list(`md5:${h('md5', bad)}`) });
    expect(await moderateImage({ buffer: Buffer.from('re-encoded'), sha256: 'x', originalBuffer: bad }, { hash: hit, classifier })).toEqual({ status: 'BLOCKED', labels: ['csam-hash-match'] });
    expect(classifier.classify).not.toHaveBeenCalled(); // a match is never sent on anywhere

    const broken = localHashListProvider({ path: join(dir, 'missing.txt') });
    expect(await moderateImage({ buffer: bad, sha256: 'x', originalBuffer: bad }, { hash: broken, classifier })).toEqual({ status: 'FLAGGED', labels: ['hash-check-unavailable'] });
    for (const call of warn.mock.calls) expect(String(call[0])).not.toMatch(/[0-9a-f]{32}/);
    warn.mockRestore();
  });
});
