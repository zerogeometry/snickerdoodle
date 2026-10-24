import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The erasure ledger's WRITE (no database or bucket needed — the S3 client is a spy). The ledger is
 * what stops a restored backup bringing deleted data back, so a write must be encrypted like every
 * other object, must survive a passing S3 hiccup, and must never fail silently.
 */
const send = vi.fn();
vi.mock('@/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/storage')>()),
  getS3: () => ({ client: { send }, bucket: 'pics' }),
  ensureBucket: async () => {},
}));

const { recordErasure, LEDGER_PREFIX } = await import('@/server/erasureLedger');

const ENTRY = { kind: 'asset', id: '7d6c3a52-0000-4000-8000-000000000001' } as const;
const AT = new Date('2026-10-24T10:00:00.000Z');
const sent = () => send.mock.calls.map(([cmd]) => cmd.input as Record<string, unknown>);

describe('erasure ledger — recording an erasure', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    send.mockReset();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('S3_KMS_KEY_ALIAS', 'arn:aws:kms:eu-west-2:111122223333:key/general');
    vi.stubEnv('S3_KMS_KEY_ALIAS_ORIGINALS', 'arn:aws:kms:eu-west-2:111122223333:key/originals');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    errors.mockRestore();
  });

  it('writes ids only, KMS-encrypted with the GENERAL key (it is not an original)', async () => {
    send.mockResolvedValue({});
    await recordErasure(ENTRY, AT, 0);
    expect(send).toHaveBeenCalledTimes(1);
    const [put] = sent();
    expect(put!.Key).toMatch(new RegExp(`^${LEDGER_PREFIX}2026-10-24T10:00:00.000Z-[0-9a-f-]{36}\\.json$`));
    expect(put!.ServerSideEncryption).toBe('aws:kms');
    expect(put!.SSEKMSKeyId).toBe('arn:aws:kms:eu-west-2:111122223333:key/general');
    expect(JSON.parse(put!.Body as string)).toEqual({ ...ENTRY, at: AT.toISOString() });
    expect(errors).not.toHaveBeenCalled();
  });

  it('rides out a passing S3 failure — retried under the same key, nothing logged', async () => {
    send.mockRejectedValueOnce(new Error('SlowDown')).mockResolvedValue({});
    await recordErasure(ENTRY, AT, 0);
    expect(send).toHaveBeenCalledTimes(2);
    const [first, second] = sent();
    expect(second!.Key).toBe(first!.Key);
    expect(errors).not.toHaveBeenCalled();
  });

  it('after the last try it logs the FAILED line the alarm watches — and never throws into the erasure', async () => {
    send.mockRejectedValue(new Error('AccessDenied'));
    await expect(recordErasure(ENTRY, AT, 0)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toContain('[erasure-ledger] FAILED');
  });

  it('in production without a KMS key it refuses to write unencrypted — and says so', async () => {
    vi.stubEnv('S3_KMS_KEY_ALIAS', '');
    vi.stubEnv('NODE_ENV', 'production');
    await recordErasure(ENTRY, AT, 0);
    expect(send).not.toHaveBeenCalled();
    expect(String(errors.mock.calls[0]![0])).toContain('[erasure-ledger] FAILED');
  });
});
