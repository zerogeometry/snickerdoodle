import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { assets, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { isProdigiConfigured, isSandboxHost, ProdigiError } from '@/server/prodigi/client';
import { prodigiOrderTransport, type CreateOrderRequest, type ProdigiOrderTransport, type ProdigiRecipient } from '@/server/prodigi/orders';
import { isStripeConfigured, getStripe } from '@/payments/stripe';
import { presignProviderIngest } from '@/storage';
import type { DbHandle, Tx } from '@/server/db';
import { assertPodEgressAllowed, GateError, gateEnv, type GateEnv } from './gate';

/**
 * POD ORDER SUBMISSION — the READY → SUBMITTED step (proposal/04 §6, the last leg of
 * the money loop). An order is submitted to Prodigi when it is PAID, has no
 * prodigiOrderId yet, and EVERY personalised line is rendered + gate-cleared (READY).
 *
 * The laws of this module:
 *  1. THE GATE IS RE-ASSERTED PER ASSET, HERE, immediately before the provider-ingestion
 *     URL is minted — handing that URL to the POD IS the egress event. A line whose
 *     asset can no longer be resolved is DENIED by default, never waved through.
 *  2. THE PAYLOAD IS BUILT FROM THE FROZEN LINE SPEC (orderItems.spec — captured at
 *     placeOrder). Never a live variant lookup: a re-seed after payment must not change
 *     what the customer receives.
 *  3. EXACTLY-ONCE: orders.prodigiOrderId is the latch (set only on success) behind a
 *     PAID→FULFILLING claim; Prodigi's `idempotencyKey` (= our order id, remembered by
 *     them indefinitely) makes any re-POST return the SAME order — which is why the
 *     stale-claim recovery sweep is safe.
 *  4. NOTHING STALLS SILENTLY: crashed claims are swept back to PAID; terminal artwork
 *     states fail loudly onto the order row; failures retry with bounded backoff; the
 *     tick summary counts every state.
 */

export interface SubmitSummary {
  considered: number;
  submitted: number;
  waiting: number; // artwork still rendering — try next tick
  blocked: number; // gate refused (or asset unresolvable) at submission time
  failed: number; // transport/validation/render failure — recorded + backed off
  skipped: number; // nothing Prodigi-fulfillable (manual lines only) — parked
  recovered: number; // stale FULFILLING claims swept back to PAID this tick
  orders: { ref: string; status: string; note?: string }[];
}

/** Brand-safe placeholder recipient for the DEV loop (no Stripe → no collected address).
 * Only ever used when BOTH the gate env is SANDBOX and the transport host is the
 * Prodigi sandbox — a fabricated recipient must never reach the live API. */
const SANDBOX_RECIPIENT: ProdigiRecipient = {
  name: 'Snickerdoodle Sandbox',
  address: { line1: '1 Test Lane', townOrCity: 'London', postalOrZipCode: 'NW1 1AA', countryCode: 'GB' },
};

const STALE_CLAIM_MINUTES = 15;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h cap for transient failures
const PERMANENT_PARK_MS = 7 * 24 * 60 * 60 * 1000; // 4xx/config failures: park a week (still visible, still eventually retried)
const MANUAL_PARK_MS = 365 * 24 * 60 * 60 * 1000; // manual-only orders never auto-submit

type LineSpec = { sku: string; attributes: Record<string, string>; provider?: string | null; providerSku: string | null; providerConfig: unknown } | null;

/** Provider-controlled/error text can quote our presigned URLs — a bearer credential to
 * a child's print file. Redact WHOLE urls before anything is persisted or returned. */
export function redactUrls(s: string): string {
  return s.replace(/\bhttps?:\/\/[^\s'"]+/gi, '[url redacted]');
}

/** POD_MODE and the transport host must agree — both mismatches are dangerous:
 * SANDBOX-mode against the live host would create REAL (billable) orders; LIVE-mode
 * against the sandbox would silently never fulfil. Checked only for the REAL transport
 * (an injected test fake has no host). */
export function assertProdigiConfigConsistent(env: GateEnv): void {
  const sandboxHost = isSandboxHost();
  if (env.podMode === 'SANDBOX' && !sandboxHost) {
    throw new Error('POD config split-brain: POD_MODE=SANDBOX but PRODIGI_BASE_URL targets a non-sandbox host — refusing to submit');
  }
  if (env.podMode === 'LIVE' && sandboxHost) {
    throw new Error('POD config split-brain: POD_MODE=LIVE but the transport targets the Prodigi sandbox — orders would never fulfil');
  }
}

/** Express when any line needs it (the jigsaw's Express cost is baked into its price);
 * Standard otherwise — tracked for garments/prints, founder-accepted for the bodysuit. */
export function resolveShippingMethod(productKeys: string[]): 'Standard' | 'Express' {
  return productKeys.some((k) => k === 'jigsaw' || k.startsWith('jigsaw-')) ? 'Express' : 'Standard';
}

/** Is this frozen line spec fulfilled by Prodigi? (Legacy specs lack `provider`; for
 * those a providerSku is the best signal.) */
function isProdigiLine(spec: LineSpec): boolean {
  if (!spec?.providerSku) return false;
  return spec.provider ? spec.provider === 'PRODIGI' : true;
}

/**
 * Sweep 1 — STALE CLAIMS: a crash between the PAID→FULFILLING claim and the
 * prodigiOrderId write would otherwise strand a paid order invisibly (submit only
 * looks at PAID; sync only at FULFILLING+id). Revert claims older than N minutes to
 * PAID; the retry re-POSTs with the same idempotencyKey and gets the SAME order back.
 */
async function recoverStaleClaims(db: DbHandle, onlyOrderIds?: string[]): Promise<{ recovered: number; refs: string[] }> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000);
  const rows = await db
    .update(orders)
    .set({ status: 'PAID', submitError: 'recovered: submission was interrupted mid-flight — retrying' })
    .where(
      and(
        eq(orders.status, 'FULFILLING'),
        isNull(orders.prodigiOrderId),
        or(isNull(orders.claimedAt), lt(orders.claimedAt, cutoff)),
        ...(onlyOrderIds ? [inArray(orders.id, onlyOrderIds)] : []),
      ),
    )
    .returning({ ref: orders.ref });
  return { recovered: rows.length, refs: rows.map((r) => r.ref) };
}

/**
 * Sweep 2 — BLOCKED_GATE RELEASE (the sweep worker.ts always promised): when the gate
 * env flips green, blocked artwork of PAID orders is re-checked; passing rows go back
 * to READY (already rendered) or PENDING (needs a render). Refusing rows stay put.
 */
export async function releaseBlockedArtwork(db: DbHandle, opts?: { env?: GateEnv; limit?: number; onlyOrderIds?: string[] }): Promise<{ released: number }> {
  const env = opts?.env ?? gateEnv();
  const rows = await db
    .select({ artworkId: orderItemArtwork.id, assetId: orderItemArtwork.assetId, printObjectId: orderItemArtwork.printObjectId })
    .from(orderItemArtwork)
    .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.status, 'PAID'),
        eq(orderItemArtwork.status, 'BLOCKED_GATE'),
        ...(opts?.onlyOrderIds ? [inArray(orders.id, opts.onlyOrderIds)] : []),
      ),
    )
    .limit(opts?.limit ?? 50);

  let released = 0;
  for (const row of rows) {
    if (!row.assetId) continue; // unresolvable asset stays blocked — deny by default
    const [a] = await db.select({ childSubjectId: assets.childSubjectId, kind: assets.kind }).from(assets).where(eq(assets.id, row.assetId));
    if (!a) continue;
    try {
      await assertPodEgressAllowed(db, { childSubjectId: a.childSubjectId, kind: a.kind }, env);
    } catch (e) {
      if (e instanceof GateError) continue; // still red — correctly waiting
      throw e;
    }
    await db
      .update(orderItemArtwork)
      .set({ status: row.printObjectId ? 'READY' : 'PENDING', renderError: null })
      .where(eq(orderItemArtwork.id, row.artworkId));
    released++;
  }
  return { released };
}

export async function submitReadyOrders(
  db: DbHandle,
  opts?: { limit?: number; env?: GateEnv; transport?: ProdigiOrderTransport; onlyOrderIds?: string[] },
): Promise<SubmitSummary> {
  const env = opts?.env ?? gateEnv();
  const transport = opts?.transport ?? prodigiOrderTransport;
  // The consistency check validates the REAL config; an injected fake has no host.
  if (!opts?.transport) assertProdigiConfigConsistent(env);
  const limit = opts?.limit ?? 25;
  const summary: SubmitSummary = { considered: 0, submitted: 0, waiting: 0, blocked: 0, failed: 0, skipped: 0, recovered: 0, orders: [] };

  const swept = await recoverStaleClaims(db, opts?.onlyOrderIds);
  summary.recovered = swept.recovered;
  for (const ref of swept.refs) summary.orders.push({ ref, status: 'recovered', note: 'stale claim swept back to PAID' });

  const now = new Date();
  const candidates = await db
    .select({ id: orders.id, ref: orders.ref, shippingAddress: orders.shippingAddress, stripeSessionId: orders.stripeSessionId, submitAttempts: orders.submitAttempts })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'PAID'),
        isNull(orders.prodigiOrderId),
        or(isNull(orders.nextSubmitAttemptAt), lte(orders.nextSubmitAttemptAt, now)),
        ...(opts?.onlyOrderIds ? [inArray(orders.id, opts.onlyOrderIds)] : []),
      ),
    )
    // Oldest first: a burst of failures can never starve a newly paid order forever.
    .orderBy(asc(orders.paidAt), asc(orders.createdAt))
    .limit(limit);

  for (const order of candidates) {
    summary.considered++;
    try {
      const note = await submitOne(db, order, env, transport, summary);
      if (note) summary.orders.push(note);
    } catch (e) {
      // One poisoned order must never abort the tick for the rest of the batch.
      const msg = redactUrls((e as Error).message).slice(0, 500);
      summary.failed++;
      summary.orders.push({ ref: order.ref, status: 'failed', note: msg });
      await parkFailure(db, order.id, order.submitAttempts, msg, 'transient').catch(() => {});
    }
  }
  return summary;
}

/** Record a failure + schedule the next attempt (exponential backoff for transient
 * faults; a week's park for permanent-looking ones). The order STAYS visible: PAID +
 * submitError + a future nextSubmitAttemptAt — never a hidden terminal state. */
async function parkFailure(db: DbHandle, orderId: string, attempts: number, message: string, kind: 'transient' | 'permanent'): Promise<void> {
  const nextMs = kind === 'permanent' ? PERMANENT_PARK_MS : Math.min(2 ** (attempts + 1) * 60 * 1000, MAX_BACKOFF_MS);
  await db
    .update(orders)
    .set({ submitError: message, submitAttempts: attempts + 1, nextSubmitAttemptAt: new Date(Date.now() + nextMs) })
    .where(eq(orders.id, orderId));
}

async function submitOne(
  db: DbHandle,
  order: {
    id: string;
    ref: string;
    shippingAddress: { name: string; line1: string; line2?: string | null; townOrCity: string; postcode: string; countryCode: string } | null;
    stripeSessionId: string | null;
    submitAttempts: number;
  },
  env: GateEnv,
  transport: ProdigiOrderTransport,
  summary: SubmitSummary,
): Promise<{ ref: string; status: string; note?: string }> {
  // Load the order's lines + their artwork state.
  const lines = await db
    .select({
      itemId: orderItems.id,
      productKey: orderItems.productKey,
      qty: orderItems.qty,
      spec: orderItems.spec,
      artworkId: orderItemArtwork.id,
      artworkStatus: orderItemArtwork.status,
      renderError: orderItemArtwork.renderError,
      printObjectId: orderItemArtwork.printObjectId,
      assetId: orderItemArtwork.assetId,
    })
    .from(orderItems)
    .leftJoin(orderItemArtwork, eq(orderItemArtwork.orderItemId, orderItems.id))
    .where(eq(orderItems.orderId, order.id));

  // A line is Prodigi-fulfillable when its FROZEN spec says PRODIGI and it carries
  // artwork. Manual lines (gift wrap) and artless add-ons are not the POD's.
  const fulfillable = lines.filter((l) => isProdigiLine(l.spec as LineSpec) && l.artworkId);
  if (fulfillable.length === 0) {
    // Nothing for the POD — park it out of the candidate batch (a gift-wrap-only order
    // is the founder's to fulfil by hand) and say so once, loudly.
    summary.skipped++;
    await db.update(orders).set({ nextSubmitAttemptAt: new Date(Date.now() + MANUAL_PARK_MS) }).where(eq(orders.id, order.id));
    return { ref: order.ref, status: 'skipped', note: 'no Prodigi-fulfillable lines — manual fulfilment' };
  }

  // TERMINAL artwork states fail LOUDLY onto the order row — they are not 'waiting'.
  const terminal = fulfillable.filter((l) => l.artworkStatus === 'RENDER_FAILED' || l.artworkStatus === 'CANCELLED');
  if (terminal.length > 0) {
    const msg = redactUrls(`artwork render failed: ${terminal.map((l) => l.renderError ?? l.artworkStatus).join('; ')}`).slice(0, 500);
    summary.failed++;
    await parkFailure(db, order.id, order.submitAttempts, msg, 'permanent');
    return { ref: order.ref, status: 'failed', note: msg };
  }
  const gateBlocked = fulfillable.filter((l) => l.artworkStatus === 'BLOCKED_GATE');
  if (gateBlocked.length > 0) {
    // Correctly waiting on LG3/LG6 — the release sweep owns recovery; make it visible.
    summary.blocked++;
    await db.update(orders).set({ submitError: 'waiting on the child-image egress gate (LG3/LG6)' }).where(eq(orders.id, order.id));
    return { ref: order.ref, status: 'blocked', note: 'artwork blocked by the egress gate' };
  }

  // Anything else not yet READY is genuinely in-flight rendering — try next tick.
  if (!fulfillable.every((l) => l.artworkStatus === 'READY' && l.printObjectId)) {
    summary.waiting++;
    return { ref: order.ref, status: 'waiting', note: 'artwork not all READY' };
  }

  // DENY BY DEFAULT: every fulfillable line must resolve to a REAL asset row the gate
  // can judge. A null assetId (or a vanished row) is an egress refusal, not a pass.
  const missingAsset = fulfillable.filter((l) => !l.assetId);
  const assetIds = [...new Set(fulfillable.map((l) => l.assetId).filter((id): id is string => Boolean(id)))];
  const assetRows =
    assetIds.length > 0
      ? await db.select({ id: assets.id, childSubjectId: assets.childSubjectId, kind: assets.kind }).from(assets).where(inArray(assets.id, assetIds))
      : [];
  if (missingAsset.length > 0 || assetRows.length !== assetIds.length) {
    const affected = fulfillable.filter((l) => !l.assetId || !assetRows.some((a) => a.id === l.assetId)).map((l) => l.artworkId!);
    await db.update(orderItemArtwork).set({ status: 'BLOCKED_GATE', renderError: 'source asset unresolvable — egress denied' }).where(inArray(orderItemArtwork.id, affected));
    summary.blocked++;
    await parkFailure(db, order.id, order.submitAttempts, 'a line has no resolvable source asset — egress denied by default', 'permanent');
    return { ref: order.ref, status: 'blocked', note: 'unresolvable source asset — egress denied' };
  }

  // RE-ASSERT THE GATE per asset, now, at the egress moment. READY was the state at
  // render time; the env (POD_MODE / LG3) may have changed since.
  for (const a of assetRows) {
    try {
      await assertPodEgressAllowed(db, { childSubjectId: a.childSubjectId, kind: a.kind }, env);
    } catch (e) {
      if (e instanceof GateError) {
        const blockedArtwork = fulfillable.filter((l) => l.assetId === a.id).map((l) => l.artworkId!);
        await db.update(orderItemArtwork).set({ status: 'BLOCKED_GATE', renderError: e.message }).where(inArray(orderItemArtwork.id, blockedArtwork));
        await db.update(orders).set({ submitError: 'waiting on the child-image egress gate (LG3/LG6)' }).where(eq(orders.id, order.id));
        summary.blocked++;
        return { ref: order.ref, status: 'blocked', note: e.message };
      }
      throw e;
    }
  }

  // Recipient: the Stripe-collected address; else backfill from the Checkout Session
  // (webhook version drift / missed capture); else the sandbox placeholder — which may
  // NEVER travel to a non-sandbox host.
  let shippingAddress = order.shippingAddress;
  if (!shippingAddress && order.stripeSessionId && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
      const ship = session.collected_information?.shipping_details ?? null;
      if (ship?.address?.line1 && ship.address.city && ship.address.postal_code && ship.address.country) {
        shippingAddress = {
          name: ship.name,
          line1: ship.address.line1,
          line2: ship.address.line2 ?? null,
          townOrCity: ship.address.city,
          postcode: ship.address.postal_code,
          countryCode: ship.address.country,
        };
        await db.update(orders).set({ shippingAddress }).where(eq(orders.id, order.id));
      }
    } catch {
      // fall through to the loud no-address failure below
    }
  }

  let recipient: ProdigiRecipient;
  if (shippingAddress) {
    recipient = {
      name: shippingAddress.name,
      address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 ?? undefined,
        townOrCity: shippingAddress.townOrCity,
        postalOrZipCode: shippingAddress.postcode,
        countryCode: shippingAddress.countryCode,
      },
    };
  } else if (env.podMode === 'SANDBOX' && isSandboxHost()) {
    recipient = SANDBOX_RECIPIENT;
  } else {
    summary.failed++;
    await parkFailure(db, order.id, order.submitAttempts, 'no shipping address on a LIVE order', 'permanent');
    return { ref: order.ref, status: 'failed', note: 'no shipping address' };
  }

  const shippingMethod = resolveShippingMethod(fulfillable.map((l) => l.productKey));

  // CLAIM: PAID → FULFILLING (stamped), guarded on the current status so overlapping
  // ticks can't double-submit.
  const claimed = await db
    .update(orders)
    .set({ status: 'FULFILLING', shippingMethod, submitError: null, claimedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'PAID')))
    .returning({ id: orders.id });
  if (claimed.length === 0) return { ref: order.ref, status: 'skipped', note: 'claimed by another tick' };

  let latched = false; // prodigiOrderId persisted — after this, NEVER revert to PAID
  try {
    // Mint provider-ingestion URLs (the gate above authorised this) + build the payload
    // from the FROZEN spec — sku/attributes exactly as sold, never a live lookup.
    const printObjectIds = fulfillable.map((l) => l.printObjectId!);
    const objectRows = await db
      .select({ id: storageObjects.id, key: storageObjects.key })
      .from(storageObjects)
      .where(inArray(storageObjects.id, printObjectIds));
    const keyByObjectId = new Map(objectRows.map((o) => [o.id, o.key]));

    const items: CreateOrderRequest['items'] = [];
    for (const l of fulfillable) {
      const key = keyByObjectId.get(l.printObjectId!);
      if (!key) throw new Error(`print object ${l.printObjectId} has no storage key`);
      const spec = l.spec as NonNullable<LineSpec>;
      const cfg = (spec.providerConfig ?? null) as { prodigiAttrs?: Record<string, string> } | null;
      items.push({
        merchantReference: l.itemId,
        sku: spec.providerSku!,
        copies: l.qty,
        // The print file IS the full bleed canvas (renderer output) — fill exactly.
        sizing: 'fillPrintArea',
        ...(cfg?.prodigiAttrs ? { attributes: cfg.prodigiAttrs } : {}),
        // One 'default' print area. VERIFIED correct for every current SKU incl. the double-sided
        // cushions: GLOBAL-CUSH-{12X12-LIN,22X22-SUE}-DUAL each expose only { default: required }
        // (not front/back), and their template is 2:1 double-wide — so the renderer's double-wide
        // [front|back] file fills the one 'default' area. Verified against the sandbox product spec
        // 2026-07-10; see project-office/briefs/DUAL-CUSHION-fulfilment.md. Revisit only if a future
        // SKU reports multiple required print areas.
        assets: [{ printArea: 'default', url: await presignProviderIngest(key) }],
      });
    }

    const result = await transport.createOrder({
      merchantReference: order.ref,
      shippingMethod,
      idempotencyKey: order.id, // stable + complex; Prodigi returns the SAME order on retry
      recipient,
      items,
    });

    await db.update(orders).set({ prodigiOrderId: result.order.id, submitError: null, submitAttempts: 0, nextSubmitAttemptAt: null }).where(eq(orders.id, order.id));
    latched = true;
    await db
      .update(orderItemArtwork)
      .set({ status: 'SUBMITTED' })
      .where(inArray(orderItemArtwork.id, fulfillable.map((l) => l.artworkId!)));
    summary.submitted++;
    const issueNote =
      result.outcome === 'createdwithissues'
        ? 'created with issues — watch the status sync'
        : result.outcome === 'onhold'
          ? 'created ON HOLD at Prodigi — release it in their dashboard'
          : undefined;
    if (issueNote) await db.update(orders).set({ submitError: issueNote }).where(eq(orders.id, order.id));
    return { ref: order.ref, status: 'submitted', note: issueNote };
  } catch (e) {
    const raw = e as Error;
    const msg = redactUrls(raw.message).slice(0, 500);
    if (latched) {
      // Prodigi HAS the order — never revert; record the bookkeeping failure and let
      // the status sync own it (its branches tolerate artwork still in READY).
      await db.update(orders).set({ submitError: `post-submit bookkeeping failed: ${msg}` }).where(eq(orders.id, order.id));
      summary.failed++;
      return { ref: order.ref, status: 'failed', note: `post-submit bookkeeping failed: ${msg}` };
    }
    // Revert the claim — guarded so it can never un-claim a latched order — and back off.
    const kind = e instanceof ProdigiError && raw && (e as ProdigiError).status >= 400 && (e as ProdigiError).status < 500 ? 'permanent' : 'transient';
    await db
      .update(orders)
      .set({ status: 'PAID' })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'FULFILLING'), isNull(orders.prodigiOrderId)));
    await parkFailure(db, order.id, order.submitAttempts, msg, kind);
    summary.failed++;
    return { ref: order.ref, status: 'failed', note: msg };
  }
}

// ── Status sync: Prodigi → our order/tracking ────────────────────────────────

export interface SyncSummary {
  checked: number;
  shipped: number;
  cancelled: number;
  inProgress: number;
  midSubmit: number; // FULFILLING without a prodigiOrderId (mid-flight or crashed — the sweep owns these)
  stalled: number; // FULFILLING for suspiciously long — surfaced loudly
  orders: { ref: string; stage: string; note?: string }[];
}

const STALL_HOURS = 72;

/**
 * Poll Prodigi for FULFILLING orders and reflect reality back: Complete → SHIPPED
 * (+ carrier/tracking stored), Cancelled → CANCELLED. Idempotent — re-running on a
 * shipped order is a no-op because it's no longer FULFILLING. One order's failure
 * never aborts the rest. (Prodigi callbacks are unsigned CloudEvents, so when we add
 * them they'll only *trigger* this sync — the source of truth is a direct GET by id.)
 */
export async function syncSubmittedOrders(
  db: DbHandle,
  opts?: { limit?: number; transport?: ProdigiOrderTransport; onlyOrderIds?: string[] },
): Promise<SyncSummary> {
  const transport = opts?.transport ?? prodigiOrderTransport;
  const limit = opts?.limit ?? 50;
  const summary: SyncSummary = { checked: 0, shipped: 0, cancelled: 0, inProgress: 0, midSubmit: 0, stalled: 0, orders: [] };

  const rows = await db
    .select({ id: orders.id, ref: orders.ref, prodigiOrderId: orders.prodigiOrderId, claimedAt: orders.claimedAt })
    .from(orders)
    .where(and(eq(orders.status, 'FULFILLING'), ...(opts?.onlyOrderIds ? [inArray(orders.id, opts.onlyOrderIds)] : [])))
    .orderBy(asc(orders.claimedAt))
    .limit(limit);

  for (const row of rows) {
    if (!row.prodigiOrderId) {
      summary.midSubmit++; // visible even before the recovery sweep fires
      continue;
    }
    summary.checked++;
    try {
      const remote = await transport.getOrder(row.prodigiOrderId);
      const stage = remote.status?.stage ?? '';
      const issues = (remote.status?.issues ?? [])
        .map((i) => redactUrls(`${i.errorCode ?? ''} ${i.description ?? ''}`.trim()))
        .filter(Boolean);

      if (stage === 'Complete') {
        const shipment = remote.shipments?.[remote.shipments.length - 1];
        const carrier = typeof shipment?.carrier === 'string' ? shipment.carrier : (shipment?.carrier?.name ?? null);
        await db.transaction(async (tx) => {
          await tx
            .update(orders)
            .set({ status: 'SHIPPED', submitError: null, tracking: { carrier, number: shipment?.tracking?.number ?? null, url: shipment?.tracking?.url ?? null } })
            .where(eq(orders.id, row.id));
          await setArtworkStatus(tx, row.id, 'SHIPPED');
        });
        summary.shipped++;
        summary.orders.push({ ref: row.ref, stage });
      } else if (stage === 'Cancelled') {
        await db.transaction(async (tx) => {
          await tx.update(orders).set({ status: 'CANCELLED', submitError: issues.join('; ').slice(0, 500) || 'cancelled at provider' }).where(eq(orders.id, row.id));
          await setArtworkStatus(tx, row.id, 'CANCELLED');
        });
        summary.cancelled++;
        summary.orders.push({ ref: row.ref, stage, note: issues.join('; ') || undefined });
      } else {
        // InProgress — reconcile issues BOTH ways (set when present, CLEAR when resolved).
        await db.update(orders).set({ submitError: issues.length > 0 ? issues.join('; ').slice(0, 500) : null }).where(eq(orders.id, row.id));
        if (remote.status?.details?.inProduction === 'InProgress' || remote.status?.details?.inProduction === 'Complete') {
          // READY included: repairs artwork that missed the SUBMITTED flip (post-latch crash).
          await setArtworkStatus(db, row.id, 'IN_PRODUCTION', ['SUBMITTED', 'READY']);
        }
        const ageMs = row.claimedAt ? Date.now() - row.claimedAt.getTime() : 0;
        if (ageMs > STALL_HOURS * 60 * 60 * 1000 || issues.length > 0) {
          summary.stalled++;
          console.error(`[fulfilment] order ${row.ref} needs attention: in progress ${Math.round(ageMs / 3_600_000)}h${issues.length ? `, issues: ${issues.join('; ')}` : ''}`);
        }
        summary.inProgress++;
        summary.orders.push({ ref: row.ref, stage, note: issues.join('; ') || undefined });
      }
    } catch (e) {
      const msg = redactUrls((e as Error).message).slice(0, 200);
      await db.update(orders).set({ submitError: `status sync failed: ${msg}` }).where(eq(orders.id, row.id)).catch(() => {});
      summary.orders.push({ ref: row.ref, stage: 'error', note: msg });
    }
  }
  return summary;
}

type ArtworkStatus = (typeof orderItemArtwork.status.enumValues)[number];

async function setArtworkStatus(db: DbHandle | Tx, orderId: string, status: ArtworkStatus, onlyFrom?: ArtworkStatus[]): Promise<void> {
  const itemIds = (await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId))).map((r) => r.id);
  if (itemIds.length === 0) return;
  const where = onlyFrom
    ? and(inArray(orderItemArtwork.orderItemId, itemIds), inArray(orderItemArtwork.status, onlyFrom))
    : inArray(orderItemArtwork.orderItemId, itemIds);
  await db.update(orderItemArtwork).set({ status }).where(where);
}

export { isProdigiConfigured };
