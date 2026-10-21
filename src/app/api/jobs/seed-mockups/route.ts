import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { seedMockups } from '@/server/print/seedMockups';

/**
 * DEV/test-site mockup template seeder (see src/server/print/seedMockups.ts). Guarded by
 * JOBS_SECRET like the other jobs. It reads the blanks staged in `.prodigi-assets/` on the
 * machine it runs on — for the test site, run scripts/test-site/seed.ps1 locally instead.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await seedMockups(getDb()));
}
