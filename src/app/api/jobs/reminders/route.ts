import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { runReminders } from '@/server/reminders';

/**
 * Daily occasion-reminder tick (cron-triggered, JOBS_SECRET-guarded like the other jobs).
 * Consent, one-per-occasion and the frequency cap are enforced by the planner.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await runReminders(getDb()));
}
