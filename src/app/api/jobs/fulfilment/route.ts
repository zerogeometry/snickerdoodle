import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { processFulfilment } from '@/fulfillment/worker';
import { isProdigiConfigured, releaseBlockedArtwork, submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';

/**
 * Fulfilment tick (proposal/04 §6) — ONE scheduler ping drives the whole pipeline:
 *   1. render: put back any line a stopped app left RENDERING, claim PENDING artwork of
 *      PAID orders, render in-VPC, run the egress gate (READY / BLOCKED_GATE /
 *      RENDER_FAILED). Overlapping ticks safe.
 *   2. submit: PAID orders whose lines are all READY → Prodigi order (gate re-asserted
 *      per asset at the egress moment; payload from the frozen sold-spec; exactly-once
 *      via the PAID→FULFILLING claim + Prodigi idempotencyKey).
 *   3. sync: FULFILLING orders → poll Prodigi; Complete → SHIPPED (+tracking),
 *      Cancelled → CANCELLED.
 * Without a PRODIGI_API_KEY only step 1 runs (the dev loop stays walkable).
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const db = getDb();
  const errors: string[] = [];

  // Stages are isolated: one stage failing must not silently skip the others.
  const render = await processFulfilment(db).catch((e) => {
    errors.push(`render: ${(e as Error).message}`);
    return null;
  });
  let released = null;
  let submit = null;
  let sync = null;
  if (isProdigiConfigured()) {
    released = await releaseBlockedArtwork(db).catch((e) => {
      errors.push(`release: ${(e as Error).message}`);
      return null;
    });
    submit = await submitReadyOrders(db).catch((e) => {
      errors.push(`submit: ${(e as Error).message}`);
      return null;
    });
    sync = await syncSubmittedOrders(db).catch((e) => {
      errors.push(`sync: ${(e as Error).message}`);
      return null;
    });
  }

  // Failures land in the host's log stream (the founder's alert surface), not only
  // in a cron response nobody reads.
  const troubled =
    (render?.recovered ?? 0) + (render?.failed ?? 0) + (render?.blocked ?? 0) + (submit?.failed ?? 0) + (submit?.blocked ?? 0) + (submit?.recovered ?? 0) + (sync?.stalled ?? 0) + (sync?.midSubmit ?? 0);
  if (troubled > 0 || errors.length > 0) {
    console.error(
      '[fulfilment] tick needs attention:',
      JSON.stringify({
        errors,
        render: render ? { recovered: render.recovered, failed: render.failed, blocked: render.blocked } : null,
        submit: submit ? { failed: submit.failed, blocked: submit.blocked, recovered: submit.recovered, orders: submit.orders.filter((o) => o.status !== 'submitted' && o.status !== 'waiting') } : null,
        sync: sync ? { stalled: sync.stalled, midSubmit: sync.midSubmit, cancelled: sync.cancelled } : null,
      }),
    );
  }
  return Response.json({ render, released, submit, sync, errors }, { status: errors.length > 0 ? 500 : 200 });
}
