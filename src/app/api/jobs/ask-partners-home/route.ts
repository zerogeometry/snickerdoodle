import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { askPartnersIntoHome } from '@/server/members';

/**
 * The home circle's go-live step (D27): ask every partner / co-parent and grown-up child already in a family into
 * home — each gets the "move into the home" link and moves only on their own yes. Each membership is asked once,
 * ever, so the deploy runs this every time (infra/aws-london/bin/deploy.sh); by hand: `sudo job.sh ask-partners-home`.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  return Response.json(await askPartnersIntoHome(getDb()));
}
