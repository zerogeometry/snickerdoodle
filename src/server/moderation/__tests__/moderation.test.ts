import { describe, expect, it } from 'vitest';
import { moderateImage } from '../index';
import type { ModerationProviders } from '../providers';

const input = { buffer: Buffer.from('fake-image-bytes'), sha256: 'abc' };

const allow: ModerationProviders = {
  hash: { async isKnownIllegal() { return false; } },
  classifier: { async classify() { return { flagged: false, labels: [] }; } },
};
const flags: ModerationProviders = {
  hash: { async isKnownIllegal() { return false; } },
  classifier: { async classify() { return { flagged: true, labels: ['Violence'] }; } },
};
const csam: ModerationProviders = {
  hash: { async isKnownIllegal() { return true; } },
  classifier: { async classify() { return { flagged: false, labels: [] }; } },
};
const both: ModerationProviders = {
  hash: { async isKnownIllegal() { return true; } },
  classifier: { async classify() { return { flagged: true, labels: ['Violence'] }; } },
};

describe('content-safety decision (D8)', () => {
  it('clears an image that neither provider objects to', async () => {
    expect(await moderateImage(input, allow)).toEqual({ status: 'CLEAR', labels: [] });
  });

  it('FLAGS (review queue) when the classifier objects — never auto-rejects', async () => {
    const v = await moderateImage(input, flags);
    expect(v.status).toBe('FLAGGED');
    expect(v.labels).toContain('Violence');
  });

  it('BLOCKS on a CSAM hash match', async () => {
    expect((await moderateImage(input, csam)).status).toBe('BLOCKED');
  });

  it('the CSAM hash-check takes precedence over the classifier', async () => {
    expect((await moderateImage(input, both)).status).toBe('BLOCKED');
  });
});

describe('fail-safe: a broken provider sends the picture to review (D8)', () => {
  type C = { flagged: boolean; labels: string[] };
  const ok = { async classify(): Promise<C> { return { flagged: false, labels: [] }; } };
  const noMatch = { async isKnownIllegal() { return false; } };

  it('hash check errors → FLAGGED, never CLEAR and never BLOCKED', async () => {
    const hash = { async isKnownIllegal(): Promise<boolean> { throw new Error('list missing'); } };
    expect(await moderateImage(input, { hash, classifier: ok })).toEqual({ status: 'FLAGGED', labels: ['hash-check-unavailable'] });
  });

  it('only a real `true` is a match — an odd answer is review', async () => {
    const hash = { async isKnownIllegal() { return 'yes' as unknown as boolean; } };
    expect(await moderateImage(input, { hash, classifier: ok })).toEqual({ status: 'FLAGGED', labels: ['hash-check-unavailable'] });
  });

  it('classifier errors or odd answers → FLAGGED', async () => {
    const throws = { async classify(): Promise<C> { throw new Error('down'); } };
    const odd = { async classify() { return {} as C; } };
    for (const classifier of [throws, odd]) {
      expect(await moderateImage(input, { hash: noMatch, classifier })).toEqual({ status: 'FLAGGED', labels: ['screening-unavailable'] });
    }
  });

  it('both broken → FLAGGED with both reasons', async () => {
    const hash = { async isKnownIllegal(): Promise<boolean> { throw new Error('x'); } };
    const classifier = { async classify(): Promise<C> { throw new Error('y'); } };
    expect(await moderateImage(input, { hash, classifier })).toEqual({ status: 'FLAGGED', labels: ['hash-check-unavailable', 'screening-unavailable'] });
  });
});
