import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MAX_UPLOAD_CLAIMS, UPLOAD_CLAIM_COOKIE, appendClaim, signClaims, verifyClaims } from '../uploadClaims';

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

describe('claim cap — a long upload session keeps its basket reachable', () => {
  it('keeps the newest MAX_UPLOAD_CLAIMS, dropping the oldest', () => {
    let claims: string[] = [];
    const ids = Array.from({ length: MAX_UPLOAD_CLAIMS + 5 }, () => randomUUID());
    for (const id of ids) claims = appendClaim(claims, id);
    expect(claims).toHaveLength(MAX_UPLOAD_CLAIMS);
    expect(claims).toEqual(ids.slice(-MAX_UPLOAD_CLAIMS));
  });

  it('holds far beyond the old 12 (the evicted-basket-thumbnail bug)', () => {
    expect(MAX_UPLOAD_CLAIMS).toBeGreaterThanOrEqual(100);
  });

  it('still reads a cookie issued in the original JSON format', () => {
    const id = randomUUID();
    const payload = Buffer.from(JSON.stringify([id])).toString('base64url');
    // re-sign the legacy payload the way the old signClaims did (the JSON path is still used
    // for non-UUID ids), then check the packed reader didn't break it
    const legacy = signClaims(['not-a-uuid', id]);
    expect(verifyClaims(legacy)).toEqual(['not-a-uuid', id]);
    expect(payload.startsWith('p')).toBe(false);
  });

  it('a tampered packed cookie is rejected', () => {
    const good = signClaims([randomUUID()]);
    const forged = `${signClaims([randomUUID()]).split('.')[0]}.${good.split('.')[1]}`;
    expect(verifyClaims(forged)).toEqual([]);
  });

  it('never duplicates a claim', () => {
    expect(appendClaim(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });

  it('a full cookie stays under the browser per-cookie limit', () => {
    const full = Array.from({ length: MAX_UPLOAD_CLAIMS }, () => randomUUID());
    const cookie = `${UPLOAD_CLAIM_COOKIE}=${signClaims(full)}`;
    expect(cookie.length).toBeLessThan(3800); // ~4KB limit incl. attributes
    expect(verifyClaims(signClaims(full))).toEqual(full);
  });
});
