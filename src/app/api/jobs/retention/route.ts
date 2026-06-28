import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { purgeExpiredAssets } from '@/server/retention';

/**
 * Retention purge, triggered by a scheduler (cron / Vercel Cron / a scheduled
 * task) hitting this endpoint daily with the shared JOBS_SECRET. Keeps ops light
 * — no standing worker — while still enforcing retention in code. Swap for a
 * pg-boss worker later if a queue is preferred.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const summary = await purgeExpiredAssets(getDb());
  return Response.json(summary);
}
