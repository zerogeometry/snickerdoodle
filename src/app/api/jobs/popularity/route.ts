import { getDb } from '@/db/client';
import { recordJobRun } from '@/server/admin/health';
import { requireJobsSecret } from '@/server/jobs/auth';
import { recomputePopularity } from '@/server/popularity';

/**
 * Re-rank the range by popularity (expected order + the last 90 days of paid sales). Triggered
 * daily by the scheduler with the shared JOBS_SECRET, like the other jobs. Product counts only —
 * no personal data is read or returned.
 */
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await recomputePopularity(getDb()));
}

/** The run, and its result recorded for the admin app's health screen (not for a caller without the secret). */
export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'popularity', res);
}
