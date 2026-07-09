import { and, eq, inArray } from 'drizzle-orm';
import { assets, orderItemArtwork, orderItems, orders } from '@/db/schema';
import { renderPrintFile } from '@/server/print/render';
import { resolveViewerContext } from '@/server/assets';
import type { RawTransform } from '@/server/print/geometry';
import type { DbHandle } from '@/server/db';
import { assertPodEgressAllowed, GateError, gateEnv, type GateEnv } from './gate';

export interface FulfilmentSummary {
  claimed: number;
  ready: number; // rendered + gate-cleared → READY
  blocked: number; // → BLOCKED_GATE
  failed: number; // → RENDER_FAILED
  items: { artworkId: string; status: string; note?: string }[];
}

interface ClaimedItem {
  artworkId: string;
  assetId: string | null;
  variantId: string;
  controllerAccountId: string;
  transform: RawTransform;
  sourceObjectId: string | null;
  back: string | null; // cushion DUAL back choice (frozen at order time); null elsewhere
  message: unknown; // greetings-card screened inside message (frozen); null = blank inside
  cardSpan: string | null; // greetings-card outer span: 'full' or null (front); card only
}

/**
 * The fulfilment worker (proposal/04 §6). Claims the PENDING artwork of PAID orders
 * (FOR UPDATE SKIP LOCKED, so overlapping cron ticks never double-claim), flips them to
 * RENDERING, then for each renders the print file IN-VPC and runs the egress GATE:
 *
 *   render OK + gate OK → READY          (rendered + cleared, ready to submit)
 *   gate blocked        → BLOCKED_GATE   (correctly waiting; releaseBlockedArtwork in
 *                                         ./submit.ts re-checks + releases when the gate flips)
 *   render failed       → RENDER_FAILED  (the error recorded; the submitter surfaces it
 *                                         loudly on the order instead of waiting forever)
 *
 * No image leaves the VPC here — rendering is local, and the GATE guards egress. POD
 * submission (READY → SUBMITTED) lives in ./submit.ts behind the same gate.
 */
export async function processFulfilment(
  db: DbHandle,
  opts?: { limit?: number; env?: GateEnv; onlyOrderIds?: string[] },
): Promise<FulfilmentSummary> {
  const env = opts?.env ?? gateEnv();
  const limit = opts?.limit ?? 50;

  // 1. CLAIM — lock the PENDING artwork of PAID orders, skip rows another tick holds,
  //    and flip them to RENDERING atomically so they can't be re-claimed.
  //    `onlyOrderIds` scopes a tick to specific orders (targeted support retries; tests).
  const claimed: ClaimedItem[] = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        artworkId: orderItemArtwork.id,
        assetId: orderItemArtwork.assetId,
        variantId: orderItemArtwork.variantId,
        controllerAccountId: orderItemArtwork.controllerAccountId,
        transform: orderItemArtwork.transform,
        sourceObjectId: orderItemArtwork.sourceObjectId,
        back: orderItemArtwork.back,
        message: orderItemArtwork.message,
        cardSpan: orderItemArtwork.cardSpan,
      })
      .from(orderItemArtwork)
      .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.status, 'PAID'),
          eq(orderItemArtwork.status, 'PENDING'),
          ...(opts?.onlyOrderIds ? [inArray(orders.id, opts.onlyOrderIds)] : []),
        ),
      )
      .limit(limit)
      .for('update', { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(orderItemArtwork)
      .set({ status: 'RENDERING' })
      .where(inArray(orderItemArtwork.id, rows.map((r) => r.artworkId)));
    return rows.map((r) => ({ ...r, transform: r.transform as RawTransform }));
  });

  const summary: FulfilmentSummary = { claimed: claimed.length, ready: 0, blocked: 0, failed: 0, items: [] };

  // 2. PROCESS each claimed item OUTSIDE the lock (render is slow).
  for (const item of claimed) {
    const result = await processItem(db, item, env);
    if (result.status === 'READY') summary.ready++;
    else if (result.status === 'BLOCKED_GATE') summary.blocked++;
    else summary.failed++;
    summary.items.push({ artworkId: item.artworkId, status: result.status, note: result.note });
  }
  return summary;
}

async function fail(db: DbHandle, artworkId: string, note: string): Promise<{ status: 'RENDER_FAILED'; note: string }> {
  await db.update(orderItemArtwork).set({ status: 'RENDER_FAILED', renderError: note.slice(0, 500) }).where(eq(orderItemArtwork.id, artworkId));
  return { status: 'RENDER_FAILED', note };
}

async function processItem(db: DbHandle, item: ClaimedItem, env: GateEnv): Promise<{ status: string; note?: string }> {
  if (!item.assetId) return fail(db, item.artworkId, 'no source asset (purged?)');
  const [asset] = await db
    .select({ id: assets.id, familyId: assets.familyId, childSubjectId: assets.childSubjectId, kind: assets.kind })
    .from(assets)
    .where(eq(assets.id, item.assetId));
  if (!asset) return fail(db, item.artworkId, 'source asset not found');

  // RENDER (in-VPC; no egress). Authz via the controller's viewer context.
  let render;
  try {
    const viewer = await resolveViewerContext(db, item.controllerAccountId, asset.familyId);
    render = await renderPrintFile(db, viewer, {
      assetId: item.assetId,
      variantId: item.variantId,
      transform: item.transform,
      sourceObjectId: item.sourceObjectId ?? undefined,
      back: item.back ?? undefined,
      message: item.message ?? undefined,
      cardSpan: item.cardSpan ?? undefined,
    });
  } catch (e) {
    return fail(db, item.artworkId, (e as Error).message);
  }
  await db
    .update(orderItemArtwork)
    .set({ printObjectId: render.printObjectId, renderedDpi: render.renderedDpi, upscaled: render.upscaled })
    .where(eq(orderItemArtwork.id, item.artworkId));

  // GATE — the single chokepoint that authorises bytes → POD.
  try {
    await assertPodEgressAllowed(db, { childSubjectId: asset.childSubjectId, kind: asset.kind }, env);
  } catch (e) {
    if (e instanceof GateError) {
      await db.update(orderItemArtwork).set({ status: 'BLOCKED_GATE', renderError: e.message }).where(eq(orderItemArtwork.id, item.artworkId));
      return { status: 'BLOCKED_GATE', note: e.message };
    }
    throw e;
  }

  // Rendered + gate-cleared → ready to submit.
  await db.update(orderItemArtwork).set({ status: 'READY', renderError: null }).where(eq(orderItemArtwork.id, item.artworkId));
  return { status: 'READY' };
}
