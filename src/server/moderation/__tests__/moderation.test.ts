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
