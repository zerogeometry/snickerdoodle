import { getDb } from '@/db/client';
import { recordJobRun } from '@/server/admin/health';
import { requireJobsSecret } from '@/server/jobs/auth';
import { processFulfilment } from '@/fulfillment/worker';
import { isProdigiConfigured, releaseBlockedArtwork, submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';
import { recheckNeverCheckedHolds, screenStalePending } from '@/server/moderation';
import { runBasketReminders } from '@/server/savedBasket';

/**
 * Fulfilment tick (proposal/04 §6) — ONE scheduler ping drives the whole pipeline:
 *   0. screening catch-up: any upload whose background safety check never finished (a restart
 *      mid-check) is screened now, from the stored copy (founder, 9 Nov 2026); and any hold where
 *      no check ever gave an answer gets today's checks (founder, 25 Nov 2026).
 *   0b. the "you left something in your basket" email, a day after a signed-in shopper's basket
 *      was left unpaid — one per basket, each claimed before it goes (founder, 25 Nov 2026).
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
async function run(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const db = getDb();
  const errors: string[] = [];

  // Stages are isolated: one stage failing must not silently skip the others.
  const screening = await screenStalePending(db).catch((e) => {
    errors.push(`screening: ${(e as Error).message}`);
    return null;
  });
  // …and holds where no check ever gave an answer (uploaded before screening was on, or the checker failed) get today's checks
  const rechecked = await recheckNeverCheckedHolds(db).catch((e) => {
    errors.push(`recheck: ${(e as Error).message}`);
    return null;
  });
  const basketReminders = await runBasketReminders(db).catch((e) => {
    errors.push(`basket reminders: ${(e as Error).message}`);
    return null;
  });
  if (basketReminders?.failed) errors.push(`basket reminders: ${basketReminders.failed} not sent`);
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
  return Response.json({ screening, rechecked, basketReminders, render, released, submit, sync, errors }, { status: errors.length > 0 ? 500 : 200 });
}

/** The run, and its result recorded for the admin app's health screen (not for a caller without the secret). */
export async function POST(req: Request): Promise<Response> {
  const res = await run(req);
  return res.status === 401 ? res : recordJobRun(getDb(), 'fulfilment', res);
}
