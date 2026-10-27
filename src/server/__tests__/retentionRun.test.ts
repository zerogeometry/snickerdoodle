import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_BATCH, MAX_ASSET_BATCHES, runRetention, type RetentionSteps } from '@/server/jobs/retentionRun';
import type { DbHandle } from '@/server/db';

/**
 * The retention RUN (the job route's body). Retention is a promise to families — an unkept upload
 * is gone after its window — so a problem must never hide (reported as fine) or spread (one bad
 * step skipping the others). The purge functions themselves are covered by retention.int.test.ts.
 */
const db = {} as DbHandle;
const healthy = (over: Partial<RetentionSteps> = {}): RetentionSteps => ({
  assets: vi.fn(async () => ({ scanned: 3, purged: 3, failed: 0 })),
  audit: vi.fn(async () => ({ purged: 1 })),
  pendingKeeps: vi.fn(async () => 2),
  rateLimits: vi.fn(async () => 4),
  quarantine: vi.fn(async () => ({ deleted: 5, failed: 0 })),
  support: vi.fn(async () => 6),
  waitlist: vi.fn(async () => ({ purged: 7 })),
  ...over,
});

describe('retention run', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errors.mockRestore());

  it('a clean run is ok, counts everything, and logs nothing', async () => {
    const r = await runRetention(db, healthy());
    expect(r).toMatchObject({ ok: true, errors: [], scanned: 3, purged: 3, failed: 0, auditPurged: 1, pendingKeepsPurged: 2, rateLimitsPurged: 4, quarantineSwept: 5, supportPurged: 6, waitlistPurged: 7 });
    expect(errors).not.toHaveBeenCalled();
  });

  it('an upload that could not be deleted is NOT ok — it is a retention breach, never "fine"', async () => {
    const r = await runRetention(db, healthy({ assets: vi.fn(async () => ({ scanned: 2, purged: 1, failed: 1 })) }));
    expect(r.ok).toBe(false);
    expect(r.failed).toBe(1);
    expect(String(errors.mock.calls[0]![0])).toContain('[retention] needs attention');
  });

  it('a raw upload left in quarantine is NOT ok', async () => {
    const r = await runRetention(db, healthy({ quarantine: vi.fn(async () => ({ deleted: 0, failed: 2 })) }));
    expect(r.ok).toBe(false);
    expect(r.quarantineFailed).toBe(2);
  });

  it('one step throwing never stops the others (a bucket outage still purges the audit trail and support messages)', async () => {
    const steps = healthy({ assets: vi.fn(async () => { throw new Error('S3 unavailable'); }), quarantine: vi.fn(async () => { throw new Error('S3 unavailable'); }) });
    const r = await runRetention(db, steps);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['assets: S3 unavailable', 'quarantine: S3 unavailable']);
    for (const s of ['audit', 'pendingKeeps', 'rateLimits', 'support', 'waitlist'] as const) expect(steps[s]).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ auditPurged: 1, pendingKeepsPurged: 2, rateLimitsPurged: 4, supportPurged: 6, quarantineSwept: null });
  });

  it('drains a backlog in batches until a short batch says nothing is left', async () => {
    const assets = vi.fn()
      .mockResolvedValueOnce({ scanned: ASSET_BATCH, purged: ASSET_BATCH, failed: 0 })
      .mockResolvedValueOnce({ scanned: ASSET_BATCH, purged: ASSET_BATCH, failed: 0 })
      .mockResolvedValueOnce({ scanned: 7, purged: 7, failed: 0 });
    const r = await runRetention(db, healthy({ assets }));
    expect(assets).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ ok: true, purged: 2 * ASSET_BATCH + 7 });
  });

  it('stops batching when a full batch made no progress (every one failed) — no busy loop', async () => {
    const assets = vi.fn(async () => ({ scanned: ASSET_BATCH, purged: 0, failed: ASSET_BATCH }));
    const r = await runRetention(db, healthy({ assets }));
    expect(assets).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
  });

  it('caps the batches per run (the next run carries on)', async () => {
    const assets = vi.fn(async () => ({ scanned: ASSET_BATCH, purged: ASSET_BATCH, failed: 0 }));
    await runRetention(db, healthy({ assets }));
    expect(assets).toHaveBeenCalledTimes(MAX_ASSET_BATCHES);
  });
});
