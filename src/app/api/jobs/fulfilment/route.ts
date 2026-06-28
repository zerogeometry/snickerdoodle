import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { processFulfilment } from '@/fulfillment/worker';

/**
 * Fulfilment worker tick (proposal/04 §6). A scheduler POSTs with the JOBS_SECRET; the
 * worker claims the PENDING artwork of PAID orders, renders each in-VPC, and runs the
 * egress gate (render OK + gate OK → READY; blocked → BLOCKED_GATE; render fail →
 * RENDER_FAILED). Overlapping ticks are safe (FOR UPDATE SKIP LOCKED). No image leaves
 * the VPC here — POD submission stays behind the gate.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const summary = await processFulfilment(getDb());
  return Response.json(summary);
}
