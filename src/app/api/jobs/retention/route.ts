import { getDb } from '@/db/client';
import { recordJobRun } from '@/server/admin/health';
import { requireJobsSecret } from '@/server/jobs/auth';
import { runRetention } from '@/server/jobs/retentionRun';

/**
 * Retention purge, triggered by the scheduler (hourly on the AWS box; daily is the minimum) with
 * the shared JOBS_SECRET. No standing worker — retention is still enforced in code. Every step
 * runs even if another fails; anything left undone answers 500 so the scheduler reports it
 * (src/server/jobs/retentionRun.ts).
 */
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const report = await runRetention(getDb());
  return Response.json(report, { status: report.ok ? 200 : 500 });
}

/** The run, and its result recorded for the admin app's health screen (not for a caller without the secret). */
export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'retention', res);
}
