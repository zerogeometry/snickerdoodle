import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { assets, orderItemArtwork, orderItems, orders } from '@/db/schema';
import { renderPrintFile } from '@/server/print/render';
import { getViewableAssetOrThrow, resolveViewerContext } from '@/server/assets';
import type { RawTransform } from '@/server/print/geometry';
import type { DbHandle } from '@/server/db';
import { assertClearedForPrint, assertPodEgressAllowed, GateError, gateEnv, type GateEnv } from './gate';

export interface FulfilmentSummary {
  recovered: number; // lines found stuck RENDERING (a restart mid-render) and put back to PENDING
  claimed: number;
  ready: number; // rendered + gate-cleared → READY
  blocked: number; // → BLOCKED_GATE
  failed: number; // → RENDER_FAILED
  items: { artworkId: string; status: string; note?: string }[];
}

interface ClaimedItem {
  artworkId: string;
  orderItemId: string;
  assetId: string | null;
  variantId: string;
  controllerAccountId: string;
  transform: RawTransform;
  sourceObjectId: string | null;
  back: string | null; // cushion DUAL back choice (frozen at order time); null elsewhere
  ground: string | null; // base colour #rrggbb (frozen at order time); null = white
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
/** A line RENDERING this long after its last heartbeat was interrupted (renders take seconds). */
export const STALE_RENDER_MINUTES = 30;

/**
 * Sweep: a line the app was rendering when it stopped (a deploy, an out-of-memory kill, a reboot)
 * would otherwise sit in RENDERING for ever — its paid order never printed, and nothing saying so.
 * Put it back to PENDING (the claim below takes it again) with a note, and count it so the tick
 * reports it. A line with no claim time was claimed before render_claimed_at existed.
 */
async function recoverStaleRenders(db: DbHandle, onlyOrderIds?: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RENDER_MINUTES * 60 * 1000);
  const scope = onlyOrderIds
    ? [inArray(orderItemArtwork.orderItemId, db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, onlyOrderIds)))]
    : [];
  const rows = await db
    .update(orderItemArtwork)
    .set({ status: 'PENDING', renderClaimedAt: null, renderError: 'recovered: rendering was interrupted — retrying' })
    .where(and(eq(orderItemArtwork.status, 'RENDERING'), or(isNull(orderItemArtwork.renderClaimedAt), lt(orderItemArtwork.renderClaimedAt, cutoff)), ...scope))
    .returning({ id: orderItemArtwork.id });
  return rows.length;
}

export async function processFulfilment(
  db: DbHandle,
  opts?: { limit?: number; env?: GateEnv; onlyOrderIds?: string[] },
): Promise<FulfilmentSummary> {
  const env = opts?.env ?? gateEnv();
  const limit = opts?.limit ?? 50;

  // 0. RECOVER lines a previous tick never finished (the app stopped mid-render).
  const recovered = await recoverStaleRenders(db, opts?.onlyOrderIds);

  // 1. CLAIM — lock the PENDING artwork of PAID orders, skip rows another tick holds,
  //    and flip them to RENDERING atomically so they can't be re-claimed.
  //    `onlyOrderIds` scopes a tick to specific orders (targeted support retries; tests).
  const claimed: ClaimedItem[] = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        artworkId: orderItemArtwork.id,
        orderItemId: orderItemArtwork.orderItemId,
        assetId: orderItemArtwork.assetId,
        variantId: orderItemArtwork.variantId,
        controllerAccountId: orderItemArtwork.controllerAccountId,
        transform: orderItemArtwork.transform,
        sourceObjectId: orderItemArtwork.sourceObjectId,
        back: orderItemArtwork.back,
        ground: orderItemArtwork.ground,
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
      .set({ status: 'RENDERING', renderClaimedAt: new Date() })
      .where(inArray(orderItemArtwork.id, rows.map((r) => r.artworkId)));
    return rows.map((r) => ({ ...r, transform: r.transform as RawTransform }));
  });

  const summary: FulfilmentSummary = { recovered, claimed: claimed.length, ready: 0, blocked: 0, failed: 0, items: [] };

  // 2. PROCESS each claimed item OUTSIDE the lock (render is slow).
  for (const item of claimed) {
    // heartbeat: a long batch is still alive, so its later lines are never taken for stuck ones
    await db.update(orderItemArtwork).set({ renderClaimedAt: new Date() }).where(eq(orderItemArtwork.id, item.artworkId));
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

/**
 * A page of the SAME line already rendered with exactly the same inputs (drawing + cutout, variant,
 * placement, back, colour, message, span) — the print file is keyed by those (src/server/print/
 * render.ts), and placeOrder gives every calendar page of one drawing the same placement, so the file
 * is the same. Only a page that sends its own file per print area has twins; a single-file line has
 * just the one row.
 */
async function renderedTwin(db: DbHandle, item: ClaimedItem): Promise<{ printObjectId: string; renderedDpi: number; upscaled: boolean } | null> {
  if (!item.assetId) return null;
  const rows = await db
    .select({ id: orderItemArtwork.id, printObjectId: orderItemArtwork.printObjectId, renderedDpi: orderItemArtwork.renderedDpi, upscaled: orderItemArtwork.upscaled, sourceObjectId: orderItemArtwork.sourceObjectId, transform: orderItemArtwork.transform, printArea: orderItemArtwork.printArea, back: orderItemArtwork.back, ground: orderItemArtwork.ground, message: orderItemArtwork.message, cardSpan: orderItemArtwork.cardSpan })
    .from(orderItemArtwork)
    .where(and(eq(orderItemArtwork.orderItemId, item.orderItemId), eq(orderItemArtwork.assetId, item.assetId), eq(orderItemArtwork.variantId, item.variantId), inArray(orderItemArtwork.status, ['READY', 'BLOCKED_GATE'])));
  const inputs = (r: Pick<ClaimedItem, 'sourceObjectId' | 'transform' | 'back' | 'ground' | 'message' | 'cardSpan'>) =>
    JSON.stringify([r.sourceObjectId ?? null, r.transform, r.back ?? null, r.ground ?? null, r.message ?? null, r.cardSpan ?? null]);
  const same = inputs(item);
  const twin = rows.find((r) => r.id !== item.artworkId && r.printArea !== null && r.printObjectId && r.renderedDpi !== null && inputs({ ...r, transform: r.transform as RawTransform }) === same);
  return twin ? { printObjectId: twin.printObjectId!, renderedDpi: twin.renderedDpi!, upscaled: twin.upscaled } : null;
}

async function processItem(db: DbHandle, item: ClaimedItem, env: GateEnv): Promise<{ status: string; note?: string }> {
  if (!item.assetId) return fail(db, item.artworkId, 'no source asset (purged?)');
  const [asset] = await db
    .select({ id: assets.id, familyId: assets.familyId, childSubjectId: assets.childSubjectId, kind: assets.kind, isBrandSafeFixture: assets.isBrandSafeFixture, moderationStatus: assets.moderationStatus })
    .from(assets)
    .where(eq(assets.id, item.assetId));
  if (!asset) return fail(db, item.artworkId, 'source asset not found');

  // CONTENT SAFETY FIRST (D8): a keepsake reported or re-screened since payment is held, NOT rendered —
  // the release sweep (./submit.ts) puts it back to PENDING once a reviewer clears it.
  try {
    assertClearedForPrint(asset);
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    await db.update(orderItemArtwork).set({ status: 'BLOCKED_GATE', renderError: e.message }).where(eq(orderItemArtwork.id, item.artworkId));
    return { status: 'BLOCKED_GATE', note: e.message };
  }

  // RENDER (in-VPC; no egress). Authz via the controller's viewer context.
  let render: { printObjectId: string; renderedDpi: number; upscaled: boolean };
  try {
    const viewer = await resolveViewerContext(db, item.controllerAccountId, asset.familyId);
    // A calendar page with the SAME drawing as a page of this line already rendered reuses that print
    // file (one drawing on all 13 pages renders once) — after the very same authz check.
    const twin = await renderedTwin(db, item);
    if (twin) await getViewableAssetOrThrow(db, item.assetId, viewer); // ← the gate
    render = twin ?? await renderPrintFile(db, viewer, {
      assetId: item.assetId,
      variantId: item.variantId,
      transform: item.transform,
      sourceObjectId: item.sourceObjectId ?? undefined,
      back: item.back ?? undefined,
      ground: item.ground ?? undefined,
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
    await assertPodEgressAllowed(db, { childSubjectId: asset.childSubjectId, kind: asset.kind, isBrandSafeFixture: asset.isBrandSafeFixture }, env);
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
