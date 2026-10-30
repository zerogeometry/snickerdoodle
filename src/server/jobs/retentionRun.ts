import type { DbHandle } from '@/server/db';
import { expireAbandonedCheckouts, purgeExpiredAssets, purgeExpiredAuditRecords } from '@/server/retention';
import { purgeExpiredPendingKeeps } from '@/server/keepsakes';
import { purgeExpiredRateLimits } from '@/server/rateLimit';
import { sweepQuarantine } from '@/server/directUpload';
import { purgeExpiredSupportRequests } from '@/server/support';

/**
 * One retention run (POST /api/jobs/retention — hourly on the AWS box). Retention is a legal
 * promise (CLAUDE.md: an unkept upload is gone after its window), so this is built so a problem
 * can't hide or spread:
 *  - every step runs even if another one throws (a bucket hiccup never stops the audit-trail or
 *    support-message purges);
 *  - expired uploads are taken in batches until none are left, so a backlog drains in one run;
 *  - anything that failed — a step that threw, an upload that couldn't be deleted, a quarantine
 *    object left behind — makes the run NOT ok: the route answers 500 and logs
 *    "[retention] needs attention", which the scheduler and the box's alarms report.
 */
export const ASSET_BATCH = 500;
export const MAX_ASSET_BATCHES = 20;

export interface RetentionSteps {
  /** Unpaid checkouts past the Stripe session lifetime → CANCELLED (08-B2), BEFORE the upload purge. */
  abandonedCheckouts?: (db: DbHandle) => Promise<number>;
  assets: (db: DbHandle) => Promise<{ scanned: number; purged: number; failed: number }>;
  audit: (db: DbHandle) => Promise<{ purged: number }>;
  pendingKeeps: (db: DbHandle) => Promise<number>;
  rateLimits: (db: DbHandle) => Promise<number>;
  quarantine: () => Promise<{ deleted: number; failed: number }>;
  support: (db: DbHandle) => Promise<number>;
}

export const DEFAULT_STEPS: RetentionSteps = {
  abandonedCheckouts: async (db) => (await expireAbandonedCheckouts(db)).length,
  assets: (db) => purgeExpiredAssets(db, { limit: ASSET_BATCH }),
  audit: purgeExpiredAuditRecords,
  pendingKeeps: (db) => purgeExpiredPendingKeeps(db),
  rateLimits: purgeExpiredRateLimits,
  quarantine: () => sweepQuarantine(),
  support: (db) => purgeExpiredSupportRequests(db),
};

export interface RetentionReport {
  ok: boolean;
  errors: string[];
  scanned: number;
  purged: number;
  failed: number;
  abandonedCheckoutsCancelled: number | null;
  auditPurged: number | null;
  pendingKeepsPurged: number | null;
  rateLimitsPurged: number | null;
  quarantineSwept: number | null;
  quarantineFailed: number;
  supportPurged: number | null;
}

export async function runRetention(db: DbHandle, steps: RetentionSteps = DEFAULT_STEPS): Promise<RetentionReport> {
  const errors: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${name}: ${(e as Error)?.message ?? String(e)}`);
      return null;
    }
  };

  // Abandoned checkouts first, so the uploads on them are purged in this same run (08-B2).
  const abandoned = steps.abandonedCheckouts ? await step('abandoned-checkouts', () => steps.abandonedCheckouts!(db)) : 0;

  // Expired uploads, batch by batch. Stop when a batch comes back short (nothing left) or made no
  // progress (every one in it failed — they'd only be picked again), with a hard cap per run.
  let scanned = 0;
  let purged = 0;
  let failed = 0;
  for (let i = 0; i < MAX_ASSET_BATCHES; i++) {
    const batch = await step('assets', () => steps.assets(db));
    if (!batch) break;
    scanned += batch.scanned;
    purged += batch.purged;
    failed += batch.failed;
    if (batch.scanned < ASSET_BATCH || batch.purged === 0) break;
  }

  const audit = await step('audit', () => steps.audit(db)); // the audit trail's own 6-year limit
  const pendingKeepsPurged = await step('pending-keeps', () => steps.pendingKeeps(db)); // guests' keep requests, a day on
  const rateLimitsPurged = await step('rate-limits', () => steps.rateLimits(db)); // finished windows, a day on
  const quarantine = await step('quarantine', () => steps.quarantine()); // direct uploads never finished, an hour on
  const supportPurged = await step('support', () => steps.support(db)); // help messages, two years on

  const quarantineFailed = quarantine?.failed ?? 0;
  const report: RetentionReport = {
    ok: errors.length === 0 && failed === 0 && quarantineFailed === 0,
    errors,
    scanned,
    purged,
    failed,
    abandonedCheckoutsCancelled: abandoned,
    auditPurged: audit?.purged ?? null,
    pendingKeepsPurged,
    rateLimitsPurged,
    quarantineSwept: quarantine?.deleted ?? null,
    quarantineFailed,
    supportPurged,
  };
  if (!report.ok) {
    // ids and counts only — the per-upload reasons were logged by the purge itself
    console.error('[retention] needs attention:', JSON.stringify({ errors, uploadsNotDeleted: failed, quarantineNotDeleted: quarantineFailed }));
  }
  return report;
}
