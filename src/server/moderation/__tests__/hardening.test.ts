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

  it('"real" can never silently mean the pass-everything stub', () => {
    expect(() => defaultProviders({ MODERATION_PROVIDER: 'real' })).toThrow(/not wired/);
  });

  it('production with no real screening FAILS CLOSED: held for review (never CLEAR, never rejected)', async () => {
    const writes: unknown[] = [];
    const db = {
      update: () => ({ set: (v: unknown) => ({ where: async () => void writes.push(v) }) }),
      insert: () => ({ values: async (v: unknown) => void writes.push(v) }),
    } as never;
    const v = await moderateAndRecord(db, { assetId: 'a1', familyId: null, buffer: Buffer.from('x'), sha256: 'x' }, undefined, { NODE_ENV: 'production' });
    expect(v).toEqual({ status: 'FLAGGED', labels: ['screening-not-configured'] });
  });
});
