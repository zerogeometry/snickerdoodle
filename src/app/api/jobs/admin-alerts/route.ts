import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { recordJobRun } from '@/server/admin/health';
import { runUrgentAlerts } from '@/server/admin/alerts';

/**
 * Urgent team emails (the admin app): every 5 minutes, anything new and urgent on the Today list is emailed once
 * (a chargeback, a reported picture, a stuck order). References and counts only. The jobs secret, like every job.
 */
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await runUrgentAlerts(getDb()));
}

export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'admin-alerts', res);
}
