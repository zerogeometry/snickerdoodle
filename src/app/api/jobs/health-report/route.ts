import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { recordStatus } from '@/server/admin/health';

/**
 * The box's hourly watchdog (infra/aws-london/bin/watchdog.sh) reports here, so the admin app can show "all fine",
 * not only email when something isn't. Body: { "problems": ["the disk is 91% full", …] } (an empty list = all well).
 * Names of checks and counts only, never personal data. The jobs secret, like every job route.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { problems?: unknown } | null;
  if (!body || !Array.isArray(body.problems)) return new Response('want { "problems": [...] }', { status: 400 });
  const problems = body.problems.filter((p): p is string => typeof p === 'string' && p.length > 0);
  await recordStatus(getDb(), 'watchdog', problems.length === 0, { problems });
  return Response.json({ recorded: true });
}
