import { describe, expect, it, vi } from 'vitest';
import { defaultProviders, moderateImage, type ModerationProviders } from '../index';
import { moderateAndRecord } from '../index';

const providers = (isKnownIllegal = vi.fn(async () => false)): ModerationProviders => ({
  hash: { isKnownIllegal },
  classifier: { classify: vi.fn(async () => ({ flagged: false, labels: [] })) },
});

describe('content-safety hardening', () => {
  it('the known-image hash check sees the ORIGINAL uploaded bytes, not our re-encoded copy', async () => {
    const isKnownIllegal = vi.fn(async () => false);
    const original = Buffer.from('original-upload-bytes');
    const reencoded = Buffer.from('re-encoded');
    await moderateImage({ buffer: reencoded, sha256: 'x', originalBuffer: original }, providers(isKnownIllegal));
    const arg = (isKnownIllegal.mock.calls[0] as unknown as [{ buffer: Buffer; sha256: string }])[0];
    expect(arg.buffer.equals(original)).toBe(true);
    expect(arg.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('"real" can never silently mean the pass-everything stub', async () => {
    // real mode with IWF not onboarded: the hash gate is closed, so nothing comes back CLEAR
    const real = defaultProviders({ MODERATION_PROVIDER: 'real' });
    await expect(real.hash.isKnownIllegal({ sha256: 'x', buffer: Buffer.from('x') })).rejects.toThrow(/not configured/);
    expect(() => defaultProviders({ MODERATION_PROVIDER: 'reall' })).toThrow(/must be "stub" or "real"/);
  });

  it('production with no real screening FAILS CLOSED: held for review (never CLEAR, never rejected)', async () => {
    const writes: unknown[] = [];
    const db = {
      select: () => ({ from: () => ({ where: async () => [] }) }), // no open report to carry over
      update: () => ({ set: (v: unknown) => ({ where: async () => void writes.push(v) }) }),
      insert: () => ({ values: async (v: unknown) => void writes.push(v) }),
    } as never;
    const v = await moderateAndRecord(db, { assetId: 'a1', familyId: null, buffer: Buffer.from('x'), sha256: 'x' }, undefined, { NODE_ENV: 'production' });
    expect(v).toEqual({ status: 'FLAGGED', labels: ['screening-not-configured'] });
  });
});
