import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type Stripe from 'stripe';
import * as schema from '@/db/schema';
import { auditRecords, opsAlerts, opsStatus, orderItemArtwork, orderItems, orders, productVariants, rightsRequests, supportRequests, webhookEvents } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { seedCatalogue } from '@/server/catalogue';
import { handleStripeEvent } from '@/payments';
import { AuthzError, type Reviewer } from '@/authz';
import { listOrders, orderDetail, retryOrder, revealContact } from '@/server/admin/orders';
import { inbox, revealRights, setRightsStatus } from '@/server/admin/inbox';
import { healthView, recordStatus } from '@/server/admin/health';
import { gatherNeedFacts, markHandled, needsYou, pulse } from '@/server/admin/today';
import { morningEmail, runMorning, runUrgentAlerts } from '@/server/admin/alerts';
import type { MailMessage } from '@/server/mail';
import type { DbHandle } from '@/server/db';

/**
 * The admin app against a real Postgres (project-office/briefs/ADMIN-APP-plan.md): the gate (admin + two-step login
 * only), refunds and chargebacks through the real webhook handler, the Today list from real rows, the once-only
 * urgent email, the morning email, audited reveals of personal details, and "try again".
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('the admin app (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const tag = `T${Date.now().toString(36).toUpperCase()}`;
  const ref = (s: string) => `${tag}-${s}`;
  // the local database is shared with other suites' leftovers: the Today list is read for this suite's orders only
  const mine = () => ({ orderRefPrefix: `${tag}-` });
  const admin: Reviewer = { accountId: null, isAdmin: true, mfaVerified: true };
  const noMfa: Reviewer = { accountId: null, isAdmin: true, mfaVerified: false };
  const member: Reviewer = { accountId: null, isAdmin: false, mfaVerified: true };
  const extraKeys: string[] = [];
  const rightsIds: string[] = [];
  const supportIds: string[] = [];

  const placeOrder = async (s: string, o: Partial<typeof orders.$inferInsert> = {}) => {
    const [row] = await db
      .insert(orders)
      .values({ ref: ref(s), subtotalPence: 2500, deliveryPence: 500, totalPence: 3000, status: 'PAID', paidAt: new Date(), accountId: ids.samId, familyId: ids.hartleyId, buyerEmail: 'sam@example.test', ...o })
      .returning();
    return row!;
  };
  const event = (type: string, object: object): Stripe.Event => ({ id: `evt_${tag}_${type}_${Math.random().toString(36).slice(2)}`, type, data: { object } }) as unknown as Stripe.Event;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    admin.accountId = ids.samId;
    noMfa.accountId = ids.samId;
    member.accountId = ids.joId;
    // a clean slate for what the Today list reads globally
    await db.delete(opsStatus).where(like(opsStatus.key, `test:%`));
  }, 120_000);

  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.ref, `${tag}-%`));
    // (audit records are append-only by design: the test's few stay, naming ids that no longer exist)
    if (mine.length) await db.delete(orders).where(inArray(orders.id, mine.map((m) => m.id)));
    await db.delete(opsAlerts).where(like(opsAlerts.key, `%${tag}%`));
    if (extraKeys.length) await db.delete(opsAlerts).where(inArray(opsAlerts.key, extraKeys));
    await db.delete(webhookEvents).where(like(webhookEvents.id, `evt_${tag}_%`));
    if (rightsIds.length) await db.delete(rightsRequests).where(inArray(rightsRequests.id, rightsIds));
    if (supportIds.length) await db.delete(supportRequests).where(inArray(supportRequests.id, supportIds));
    await db.delete(opsStatus).where(like(opsStatus.key, 'test:%'));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('only an admin who passed two-step login gets anything; everyone else is refused', async () => {
    await placeOrder('GATE');
    for (const who of [noMfa, member, { accountId: null, isAdmin: false, mfaVerified: false }]) {
      await expect(listOrders(db, who, { filter: 'all' })).rejects.toBeInstanceOf(AuthzError);
      await expect(orderDetail(db, who, ref('GATE'))).rejects.toBeInstanceOf(AuthzError);
      await expect(revealContact(db, who, ref('GATE'))).rejects.toBeInstanceOf(AuthzError);
      await expect(retryOrder(db, who, ref('GATE'))).rejects.toBeInstanceOf(AuthzError);
      await expect(inbox(db, who)).rejects.toBeInstanceOf(AuthzError);
      await expect(healthView(db, who)).rejects.toBeInstanceOf(AuthzError);
      await expect(markHandled(db, who, `order:${ref('GATE')}:x`)).rejects.toBeInstanceOf(AuthzError);
    }
    expect((await listOrders(db, admin, { filter: 'all', q: ref('GATE') })).map((o) => o.ref)).toEqual([ref('GATE')]);
  });

  it('a full refund before Prodigi cancels the order (it never prints); a part refund only records the amount', async () => {
    const full = await placeOrder('FULL', { stripePaymentIntent: `pi_${tag}_full` });
    const part = await placeOrder('PART', { stripePaymentIntent: `pi_${tag}_part` });
    await handleStripeEvent(db, event('charge.refunded', { payment_intent: `pi_${tag}_full`, amount: 3000, amount_refunded: 3000, refunded: true }));
    await handleStripeEvent(db, event('charge.refunded', { payment_intent: `pi_${tag}_part`, amount: 3000, amount_refunded: 1000, refunded: false }));
    const [f] = await db.select().from(orders).where(eq(orders.id, full.id));
    const [p] = await db.select().from(orders).where(eq(orders.id, part.id));
    expect([f!.status, f!.refundedPence]).toEqual(['CANCELLED', 3000]);
    expect([p!.status, p!.refundedPence]).toEqual(['PAID', 1000]);
  });

  it('a refund on an order already at Prodigi leaves it there and says "cancel at Prodigi"', async () => {
    await placeOrder('ATP', { status: 'FULFILLING', prodigiOrderId: `ord_${tag}`, claimedAt: new Date(), stripePaymentIntent: `pi_${tag}_atp` });
    await handleStripeEvent(db, event('charge.refunded', { payment_intent: `pi_${tag}_atp`, amount: 3000, amount_refunded: 3000, refunded: true }));
    const [o] = await db.select().from(orders).where(eq(orders.ref, ref('ATP')));
    expect(o!.status).toBe('FULFILLING');
    expect((await needsYou(db, undefined, mine())).map((n) => n.key)).toContain(`order:${ref('ATP')}:refund-at-prodigi`);
  });

  it('a chargeback is recorded with its deadline and leads the list until answered', async () => {
    await placeOrder('DISP', { stripePaymentIntent: `pi_${tag}_disp` });
    const due = Math.floor(Date.now() / 1000) + 5 * 86400;
    await handleStripeEvent(db, event('charge.dispute.created', { id: `dp_${tag}`, status: 'needs_response', reason: 'fraudulent', amount: 3000, payment_intent: `pi_${tag}_disp`, created: Math.floor(Date.now() / 1000), evidence_details: { due_by: due } }));
    const [o] = await db.select().from(orders).where(eq(orders.ref, ref('DISP')));
    expect(o!.dispute).toMatchObject({ id: `dp_${tag}`, status: 'needs_response', amountPence: 3000, dueBy: new Date(due * 1000).toISOString() });
    const needs = await needsYou(db, undefined, mine());
    expect(needs[0]!.key).toBe(`dispute:dp_${tag}`);
    await handleStripeEvent(db, event('charge.dispute.updated', { id: `dp_${tag}`, status: 'under_review', reason: 'fraudulent', amount: 3000, payment_intent: `pi_${tag}_disp`, created: Math.floor(Date.now() / 1000) }));
    expect((await needsYou(db, undefined, mine())).map((n) => n.key)).not.toContain(`dispute:dp_${tag}`);
  });

  it('a paid order stuck 3 hours is emailed ONCE; "done" keeps it off; the email has no personal data', async () => {
    await placeOrder('STUCK', { paidAt: new Date(Date.now() - 3 * 3_600_000) });
    const sent: MailMessage[] = [];
    const send = async (m: MailMessage) => void sent.push(m);
    await runUrgentAlerts(db, { send, scope: mine(), env: { APP_URL: 'https://example.test', SUPPORT_INBOX: 'team@example.test' } });
    const stuckMail = () => sent.filter((m) => m.text.includes(ref('STUCK')));
    expect(stuckMail()).toHaveLength(1);
    expect(stuckMail()[0]!.to).toBe('team@example.test');
    expect(stuckMail()[0]!.text).not.toContain('sam@example.test');
    await runUrgentAlerts(db, { send, scope: mine() });
    expect(stuckMail()).toHaveLength(1); // once per problem
    await markHandled(db, admin, `order:${ref('STUCK')}:not-sent`);
    expect((await needsYou(db, undefined, mine())).map((n) => n.key)).not.toContain(`order:${ref('STUCK')}:not-sent`);
  });

  it('the customer’s details are only shown on request, and the look is recorded', async () => {
    const o = await placeOrder('REVEAL', { shippingAddress: { name: 'Sam Test', line1: '1 Lane', townOrCity: 'Bristol', postcode: 'BS1 1AA', countryCode: 'GB' } });
    const d = await orderDetail(db, admin, ref('REVEAL'));
    expect(JSON.stringify(d)).not.toContain('sam@example.test');
    expect(JSON.stringify(d)).not.toContain('BS1 1AA');
    const c = await revealContact(db, admin, ref('REVEAL'));
    expect(c!.address).toContain('BS1 1AA');
    const audits = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, o.id), eq(auditRecords.event, 'ADMIN_PERSONAL_DATA_VIEWED')));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorAccountId).toBe(ids.samId);
  });

  it('"try again" re-queues failed print files and the hand-over; never an order Prodigi has', async () => {
    const o = await placeOrder('RETRY', { submitError: 'render failed', nextSubmitAttemptAt: new Date(Date.now() + 86_400_000) });
    const [v] = await db.select({ id: productVariants.id }).from(productVariants).limit(1);
    const [item] = await db.insert(orderItems).values({ orderId: o.id, productKey: 'mug', qty: 1, unitPricePence: 2500, linePence: 2500 }).returning();
    await db.insert(orderItemArtwork).values({ orderItemId: item!.id, variantId: v!.id, controllerAccountId: ids.samId, templateSnapshot: {}, transform: {}, status: 'RENDER_FAILED', renderError: 'too small' });
    expect((await needsYou(db, undefined, mine())).map((n) => n.key)).toContain(`order:${ref('RETRY')}:render-failed`);
    expect(await retryOrder(db, admin, ref('RETRY'))).toBe(true);
    const [art] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, item!.id));
    expect([art!.status, art!.renderError]).toEqual(['PENDING', null]);
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after!.nextSubmitAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now());
    await placeOrder('ATP2', { status: 'FULFILLING', prodigiOrderId: `ord_${tag}_2` });
    expect(await retryOrder(db, admin, ref('ATP2'))).toBe(false);
  });

  it('data requests: read (recorded), move along, finish with an outcome', async () => {
    const [r] = await db.insert(rightsRequests).values({ type: 'COMPLAINT', subjectEmail: 'c@example.test', details: 'please stop', dueAt: new Date(Date.now() + 3 * 86_400_000) }).returning();
    rightsIds.push(r!.id);
    expect((await gatherNeedFacts(db)).rights.map((x) => x.id)).toContain(r!.id);
    expect((await revealRights(db, admin, r!.id))!.details).toBe('please stop');
    expect(await setRightsStatus(db, admin, r!.id, 'COMPLETED', 'replied and closed the account')).toBe(true);
    expect((await gatherNeedFacts(db)).rights.map((x) => x.id)).not.toContain(r!.id);
    expect(await setRightsStatus(db, admin, r!.id, 'IN_PROGRESS', null)).toBe(false); // finished stays finished
    const events = await db.select({ e: auditRecords.event }).from(auditRecords).where(eq(auditRecords.targetId, r!.id));
    expect(events.map((x) => x.e).sort()).toEqual(['ADMIN_PERSONAL_DATA_VIEWED', 'RIGHTS_REQUEST_COMPLETED']);
  });

  it('the inbox puts data requests first, then messages oldest first', async () => {
    const [m] = await db.insert(supportRequests).values({ ref: `H${tag}`, topic: 'gifts', email: 'h@example.test', message: 'hello' }).returning();
    supportIds.push(m!.id);
    const items = await inbox(db, admin);
    expect(items.some((i) => i.kind === 'support' && i.id === m!.id)).toBe(true);
    const firstSupport = items.findIndex((i) => i.kind === 'support');
    expect(items.slice(firstSupport).every((i) => i.kind === 'support')).toBe(true);
  });

  it('health shows each check; a failing one is on Today', async () => {
    await recordStatus(db, 'test:fake', false, { problems: ['made up for a test'] });
    expect((await healthView(db, admin)).checks.find((c) => c.key === 'test:fake')).toMatchObject({ ok: false, problems: ['made up for a test'] });
    expect((await needsYou(db)).map((n) => n.key)).toContain('site:test:fake'); // (site items are never grouped)
    expect((await pulse(db)).healthy).toBe(false);
  });

  it('the morning email: once a day, only in the 7am London hour, lists what needs you', async () => {
    const sevenUk = new Date('2026-11-18T07:15:00Z'); // GMT in November
    const sent: MailMessage[] = [];
    extraKeys.push('morning:2026-11-18');
    await db.delete(opsAlerts).where(eq(opsAlerts.key, 'morning:2026-11-18'));
    expect((await runMorning(db, { now: new Date('2026-11-18T06:15:00Z'), send: async (m) => void sent.push(m) })).sent).toBe(false);
    const first = await runMorning(db, { now: sevenUk, send: async (m) => void sent.push(m) });
    const again = await runMorning(db, { now: new Date('2026-11-18T07:45:00Z'), send: async (m) => void sent.push(m) });
    expect(first.sent).toBe(true);
    expect(again).toEqual({ sent: false, reason: 'already sent today' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toMatch(/Needs you \(\d+\):/);
    const monday = await morningEmail(db, new Date('2026-11-16T07:10:00Z'));
    expect(monday!.text).toContain('Last week:');
  });
});
