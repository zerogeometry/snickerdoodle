import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { recomputePopularity } from '@/server/popularity';

/**
 * Re-rank the range by popularity (expected order + the last 90 days of paid sales). Triggered
 * daily by the scheduler with the shared JOBS_SECRET, like the other jobs. Product counts only —
 * no personal data is read or returned.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await recomputePopularity(getDb()));
}
