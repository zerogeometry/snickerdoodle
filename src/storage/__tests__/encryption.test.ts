import { describe, expect, it } from 'vitest';
import { encryptionFor } from '../objects';
import { claimSecret } from '@/server/uploadClaims';

describe('at-rest encryption (production fails closed)', () => {
  const PROD = { NODE_ENV: 'production', S3_KMS_KEY_ALIAS: 'alias/sd-derivatives', S3_KMS_KEY_ALIAS_ORIGINALS: 'alias/sd-originals' };
  it('originals use their own key; everything else the general key', () => {
    expect(encryptionFor('assets/abc/original', PROD)).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/sd-originals' });
    expect(encryptionFor('assets/abc/derivatives/print', PROD)).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/sd-derivatives' });
  });
  it('a quarantined direct upload (raw, EXIF still in it) gets the ORIGINALS key', () => {
    expect(encryptionFor('quarantine/0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f60', PROD)).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'alias/sd-originals' });
    expect(() => encryptionFor('quarantine/x', { NODE_ENV: 'production', S3_KMS_KEY_ALIAS: 'x' })).toThrow(/ORIGINALS/);
  });
  it('production without a key refuses to store', () => {
    expect(() => encryptionFor('assets/abc/original', { NODE_ENV: 'production', S3_KMS_KEY_ALIAS: 'x' })).toThrow(/ORIGINALS/);
    expect(() => encryptionFor('assets/abc/derivatives/x', { NODE_ENV: 'production' })).toThrow(/S3_KMS_KEY_ALIAS/);
  });
  it('local dev (MinIO, no KMS) stores plain', () => {
    expect(encryptionFor('assets/abc/original', { NODE_ENV: 'development' })).toEqual({});
  });
});

describe('upload-claim signing secret', () => {
  it('production refuses a missing or weak secret', () => {
    expect(() => claimSecret({ NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/);
    expect(() => claimSecret({ NODE_ENV: 'production', AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
    expect(claimSecret({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40) })).toHaveLength(40);
  });
});
