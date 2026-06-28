import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { seedCatalogue } from '@/server/catalogue';

/**
 * Seed/refresh the product catalogue (idempotent) — run once per environment so
 * pricing reads from the DB. Guarded by JOBS_SECRET like the other job endpoints.
 * (Replaced by the Prodigi catalogue sync once the adapter lands.)
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const summary = await seedCatalogue(getDb());
  return Response.json(summary);
}
