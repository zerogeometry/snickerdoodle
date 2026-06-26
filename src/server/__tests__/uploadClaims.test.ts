import { describe, expect, it } from 'vitest';
import { signClaims, verifyClaims } from '../uploadClaims';

describe('signed upload-claim cookie', () => {
  it('round-trips a set of claim ids', () => {
    const ids = ['claim-a', 'claim-b', 'claim-c'];
    expect(verifyClaims(signClaims(ids))).toEqual(ids);
  });

  it('returns [] for an absent or empty cookie', () => {
    expect(verifyClaims(undefined)).toEqual([]);
    expect(verifyClaims(null)).toEqual([]);
    expect(verifyClaims('')).toEqual([]);
  });

  it('rejects a tampered payload — the HMAC no longer matches', () => {
    const good = signClaims(['real-claim']);
    const mac = good.slice(good.lastIndexOf('.') + 1);
    const forgedPayload = Buffer.from(JSON.stringify(['forged-claim'])).toString('base64url');
    expect(verifyClaims(`${forgedPayload}.${mac}`)).toEqual([]); // can't forge without the secret
  });

  it('rejects a value with no signature segment', () => {
    const payload = Buffer.from(JSON.stringify(['x'])).toString('base64url');
    expect(verifyClaims(payload)).toEqual([]);
  });
});
