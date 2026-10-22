import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { purgeExpiredAssets, purgeExpiredAuditRecords } from '@/server/retention';
import { purgeExpiredPendingKeeps } from '@/server/keepsakes';
import { purgeExpiredRateLimits } from '@/server/rateLimit';
import { sweepQuarantine } from '@/server/directUpload';

/**
 * Retention purge, triggered by a scheduler (cron / Vercel Cron / a scheduled
 * task) hitting this endpoint daily with the shared JOBS_SECRET. Keeps ops light
 * — no standing worker — while still enforcing retention in code. Swap for a
 * pg-boss worker later if a queue is preferred.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const db = getDb();
  const summary = await purgeExpiredAssets(db);
  const audit = await purgeExpiredAuditRecords(db); // the audit trail's own 6-year limit
  const pendingKeepsPurged = await purgeExpiredPendingKeeps(db); // guests' keep requests, a day on
  const rateLimitsPurged = await purgeExpiredRateLimits(db); // finished rate-limit windows, a day on
  const quarantine = await sweepQuarantine(); // direct uploads never finalised, an hour on
  return Response.json({ ...summary, auditPurged: audit.purged, pendingKeepsPurged, rateLimitsPurged, quarantineSwept: quarantine.deleted });
}
