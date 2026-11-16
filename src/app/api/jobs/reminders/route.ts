import { getDb } from '@/db/client';
import { recordJobRun } from '@/server/admin/health';
import { requireJobsSecret } from '@/server/jobs/auth';
import { runReminders } from '@/server/reminders';

/**
 * Daily occasion-reminder tick (cron-triggered, JOBS_SECRET-guarded like the other jobs).
 * Consent, one-per-occasion and the frequency cap are enforced by the planner.
 */
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await runReminders(getDb()));
}

/** The run, and its result recorded for the admin app's health screen (not for a caller without the secret). */
export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'reminders', res);
}
