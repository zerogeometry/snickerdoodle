import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Signing is offline (no request leaves), but the bucket check isn't — stub just that.
vi.mock('../objects', async (orig) => ({ ...(await orig<typeof import('../objects')>()), ensureBucket: vi.fn(async () => {}) }));

import { DIRECT_UPLOAD_TTL_SECONDS, MAX_UPLOAD_BYTES, QUARANTINE_CONTENT_TYPE, isAcceptableUploadSize, presignQuarantineUpload } from '../quarantine';

const ID = '0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f60';

describe('presigned quarantine upload — one key, one size, short-lived', () => {
  beforeEach(() => {
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:9000');
    vi.stubEnv('S3_REGION', 'eu-west-2');
    vi.stubEnv('S3_ACCESS_KEY', 'test-access');
    vi.stubEnv('S3_SECRET_KEY', 'test-secret');
    vi.stubEnv('S3_BUCKET', 'sd-test-bucket');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('signs a PUT for exactly quarantine/<id> — never an asset key', async () => {
    const { url } = await presignQuarantineUpload(ID, 1234);
    const u = new URL(url);
    expect(u.pathname).toBe(`/sd-test-bucket/quarantine/${ID}`);
    expect(u.searchParams.get('x-id')).toBe('PutObject');
  });

  it('pins the size, the content type and the host into the signature', async () => {
    const { url, headers } = await presignQuarantineUpload(ID, 1234);
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')!.split(';');
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    expect(headers).toEqual({ 'content-type': QUARANTINE_CONTENT_TYPE }); // the browser can't pick a type
  });

  it('lives 5 minutes at most — a longer ask is capped', async () => {
    const now = new Date('2026-10-22T10:00:00Z');
    const a = await presignQuarantineUpload(ID, 10, { now });
    expect(new URL(a.url).searchParams.get('X-Amz-Expires')).toBe(String(DIRECT_UPLOAD_TTL_SECONDS));
    expect(a.expiresAt.getTime() - now.getTime()).toBe(DIRECT_UPLOAD_TTL_SECONDS * 1000);
    const b = await presignQuarantineUpload(ID, 10, { ttlSeconds: 86_400 });
    expect(Number(new URL(b.url).searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(300);
  });

  it('carries no empty-body checksum (real S3 would reject the browser PUT)', async () => {
    const keys = [...new URL((await presignQuarantineUpload(ID, 10)).url).searchParams.keys()].map((k) => k.toLowerCase());
    expect(keys.filter((k) => k.includes('checksum'))).toEqual([]);
  });

  it('refuses a non-UUID id (no path tricks) and any size outside 1 B – 25 MB', async () => {
    await expect(presignQuarantineUpload('../assets/x/original', 10)).rejects.toThrow(/UUID/);
    await expect(presignQuarantineUpload(ID, 0)).rejects.toThrow(/size/);
    await expect(presignQuarantineUpload(ID, MAX_UPLOAD_BYTES + 1)).rejects.toThrow(/size/);
    await expect(presignQuarantineUpload(ID, 10.5)).rejects.toThrow(/size/);
    expect(isAcceptableUploadSize(MAX_UPLOAD_BYTES)).toBe(true);
    expect(isAcceptableUploadSize('10')).toBe(false);
  });

  it('production: the originals KMS key is a SIGNED header the browser must send', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_KMS_KEY_ALIAS', 'alias/sd-derivatives');
    vi.stubEnv('S3_KMS_KEY_ALIAS_ORIGINALS', 'alias/sd-originals');
    const { url, headers } = await presignQuarantineUpload(ID, 10);
    expect(headers).toMatchObject({ 'x-amz-server-side-encryption': 'aws:kms', 'x-amz-server-side-encryption-aws-kms-key-id': 'alias/sd-originals' });
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')!.split(';');
    expect(signed).toEqual(expect.arrayContaining(['x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']));
  });

  it('production without the originals key refuses to sign at all', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_KMS_KEY_ALIAS', 'alias/sd-derivatives');
    await expect(presignQuarantineUpload(ID, 10)).rejects.toThrow(/ORIGINALS/);
  });
});
