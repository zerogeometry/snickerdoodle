import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { recordJobRun } from '@/server/admin/health';
import { runMorning } from '@/server/admin/alerts';

/**
 * The morning email (the admin app): yesterday's orders, this week so far and everything that needs a person; last
 * week's numbers on a Monday. Called at 06:00 and 07:00 UTC; it sends in the 7am London hour, once a day.
 */
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await runMorning(getDb()));
}

export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'morning', res);
}
