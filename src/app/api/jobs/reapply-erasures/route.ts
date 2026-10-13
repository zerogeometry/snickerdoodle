import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { reapplyErasuresSince } from '@/server/erasureLedger';

/**
 * Run ONCE after restoring the database from a backup: replays every erasure recorded in the
 * ledger since the backup was taken (?since=<ISO time of the backup>), so nothing deleted comes
 * back. JOBS_SECRET-guarded; idempotent. See project-office/ops/BACKUPS-AND-ERASURE.md.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const raw = new URL(req.url).searchParams.get('since');
  const since = raw ? new Date(raw) : null;
  if (!since || Number.isNaN(since.getTime())) return Response.json({ error: 'pass ?since=<ISO time the backup was taken>' }, { status: 400 });
  return Response.json(await reapplyErasuresSince(getDb(), since));
}
