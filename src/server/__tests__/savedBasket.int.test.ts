import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, assets, consentRecords, orders, savedBaskets } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import type { MailMessage } from '@/server/mail';
import type { DbHandle } from '@/server/db';
import { exclusively } from '@/test/globalJobs';

/**
 * Founder, 25 Nov 2026: a signed-in shopper's basket is remembered on their account, and ONE kind reminder
 * goes out a day after it's left unpaid. The mailer is captured (nothing is sent anywhere).
 */
const sent: MailMessage[] = [];
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async (m: MailMessage) => void sent.push(m)) }));

const { namesFor, saveBasket, loadBasket, forgetBasketAfterPaid, runBasketReminders, setBasketReminders, turnBasketRemindersOffByLink, REMIND_AFTER_MS, STALE_AFTER_MS, REMIND_AGAIN_AFTER_MS } = await import('@/server/savedBasket');
const { basketReminderOffToken } = await import('@/server/mail/basketReminder');
const { closeAccount } = await import('@/server/accountClosure');
const { collectAccountData } = await import('@/server/exportData');

const DB = process.env.DATABASE_URL;
const HOUR = 3_600_000;

describe.skipIf(!DB)('the basket remembered on the account, and its one reminder (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const email: Record<string, string> = {};
  const orderIds: string[] = [];

  const line = (assetId: string, extra: Record<string, unknown> = {}) => ({
    id: `mug-blue-${assetId}`,
    name: 'doodle mug',
    product: 'mug',
    sku: 'mug-blue',
    pricePence: 1800,
    qty: 1,
    artwork: { assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } },
    ...extra,
  });
  const ageBasket = (accountId: string, ms: number, remindedAt: Date | null = null) =>
    db.update(savedBaskets).set({ updatedAt: new Date(Date.now() - ms), remindedAt }).where(eq(savedBaskets.accountId, accountId));
  const mailTo = (who: string) => sent.filter((m) => m.kind === 'basket-reminder' && m.to === email[who]);

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    for (const [k, id] of Object.entries({ sam: ids.samId, jo: ids.joId, rosie: ids.rosieId, blake: ids.blakeId })) {
      email[k] = (await db.select({ e: accounts.email }).from(accounts).where(eq(accounts.id, id)))[0]!.e;
    }
  });
  beforeEach(async () => {
    sent.splice(0);
    await db.delete(savedBaskets).where(inArray(savedBaskets.accountId, [ids.samId, ids.joId, ids.rosieId, ids.blakeId]));
    await db.delete(consentRecords).where(inArray(consentRecords.accountId, [ids.samId, ids.joId, ids.rosieId, ids.blakeId]));
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    await db.delete(savedBaskets).where(inArray(savedBaskets.accountId, [ids.samId, ids.joId, ids.rosieId, ids.blakeId]));
    await db.delete(consentRecords).where(inArray(consentRecords.accountId, [ids.samId, ids.joId, ids.rosieId, ids.blakeId]));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('saves and comes back the same; an empty basket forgets it; junk is refused', async () => {
    expect(await saveBasket(db, ids.samId, [line(ids.assetFamily), line(ids.assetExtended, { qty: 2 })])).toEqual({ ok: true });
    const back = await loadBasket(db, ids.samId);
    expect(back.map((l) => l.qty)).toEqual([1, 2]);
    expect(back[0]).toMatchObject({ product: 'mug', sku: 'mug-blue', artwork: { assetId: ids.assetFamily } });
    expect(await saveBasket(db, ids.samId, [{ id: 'x', product: 'mug', qty: 500, pricePence: 1 }])).toEqual({ ok: false });
    expect(await saveBasket(db, ids.samId, 'not a basket')).toEqual({ ok: false });
    expect(await loadBasket(db, ids.samId)).toHaveLength(2); // a refused save changes nothing
    await saveBasket(db, ids.samId, []);
    expect(await db.select().from(savedBaskets).where(eq(savedBaskets.accountId, ids.samId))).toHaveLength(0);
  });

  it('only a real change moves the reminder clock', async () => {
    await saveBasket(db, ids.samId, [line(ids.assetFamily)]);
    await ageBasket(ids.samId, 5 * HOUR);
    const [before] = await db.select().from(savedBaskets).where(eq(savedBaskets.accountId, ids.samId));
    await saveBasket(db, ids.samId, [line(ids.assetFamily)]); // the same basket again (another tab opening)
    const [same] = await db.select().from(savedBaskets).where(eq(savedBaskets.accountId, ids.samId));
    expect(same!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    await saveBasket(db, ids.samId, [line(ids.assetFamily, { qty: 2 })]);
    const [moved] = await db.select().from(savedBaskets).where(eq(savedBaskets.accountId, ids.samId));
    expect(moved!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it('a line whose drawing they can no longer see, or that is gone or blocked, is left out (central authz)', async () => {
    // Jo (Family circle) sees the FAMILY keepsake, not Sam's ONLY_ME one, not another family's
    await saveBasket(db, ids.joId, [line(ids.assetFamily), line(ids.assetOnlyMe), line(ids.assetBloomFamily), line(randomUUID())]);
    expect((await loadBasket(db, ids.joId)).map((l) => (l.artwork as { assetId: string }).assetId)).toEqual([ids.assetFamily]);
    // Rosie (Extended) doesn't see a FAMILY keepsake
    await saveBasket(db, ids.rosieId, [line(ids.assetFamily), line(ids.assetExtended)]);
    expect((await loadBasket(db, ids.rosieId)).map((l) => (l.artwork as { assetId: string }).assetId)).toEqual([ids.assetExtended]);
    // a pack with ONE card she can't see is left out whole
    await saveBasket(db, ids.rosieId, [{ id: 'cardPack-5', product: 'cardPack', pricePence: 1200, qty: 1, cards: [{ assetId: ids.assetExtended }, { assetId: ids.assetFamily }] }]);
    expect(await loadBasket(db, ids.rosieId)).toEqual([]);
    // blocked
    const [{ status }] = (await db.select({ status: assets.moderationStatus }).from(assets).where(eq(assets.id, ids.assetExtended))) as [{ status: string }];
    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, ids.assetExtended));
    await saveBasket(db, ids.samId, [line(ids.assetExtended)]);
    expect(await loadBasket(db, ids.samId)).toEqual([]);
    await db.update(assets).set({ moderationStatus: status as 'CLEAR' }).where(eq(assets.id, ids.assetExtended));
  });

  it('the reminder: once, a day later — first name only, product names from the shop, no child, no picture, an off switch', () => exclusively(db, async () => {
    await saveBasket(db, ids.samId, [line(ids.assetFamily), line(ids.assetExtended, { qty: 2, name: '<b>made-up text from a browser</b>' })]);
    await ageBasket(ids.samId, 23 * HOUR);
    await runBasketReminders(db);
    expect(mailTo('sam')).toHaveLength(0); // not yet

    await ageBasket(ids.samId, 25 * HOUR);
    await runBasketReminders(db);
    await runBasketReminders(db); // a second tick never sends it again
    const got = mailTo('sam');
    expect(got).toHaveLength(1);
    const m = got[0]!;
    expect(m.subject).not.toMatch(/olivia|max|sam/i);
    expect(m.text).toMatch(/^Hello Sam,/);
    const name = namesFor([{ id: 'x', product: 'mug', sku: 'mug-blue', qty: 1, pricePence: 0 }])[0]!;
    expect(m.text).toContain(`• ${name}
• ${name}`); // the shop's own names, one per line
    expect(m.text).not.toMatch(/made-up text|<b>|Olivia|Max|Hartley/);
    expect(m.text).toMatch(/\/checkout/);
    expect(m.html).not.toMatch(/<img/i);
    expect(m.headers?.['List-Unsubscribe']).toMatch(/\/api\/basket-reminders\/off\//);
    expect(m.text).toMatch(/\/basket-reminders\/off\//);
  }));

  it('no reminder: when they said no, when they paid, or for a basket left over a week', () => exclusively(db, async () => {
    // said no (the basket's switch)
    await saveBasket(db, ids.samId, [line(ids.assetFamily)]);
    await ageBasket(ids.samId, 25 * HOUR);
    await setBasketReminders(db, ids.samId, false, 'test');
    // paid since
    await saveBasket(db, ids.joId, [line(ids.assetFamily)]);
    await ageBasket(ids.joId, 30 * HOUR);
    const [o] = await db
      .insert(orders)
      .values({ ref: `SD-T${randomUUID().slice(0, 6)}`, accountId: ids.joId, status: 'PAID', paidAt: new Date(Date.now() - 2 * HOUR), subtotalPence: 1800, totalPence: 1800, deliveryPence: 0, buyerEmail: email.jo! } as typeof orders.$inferInsert)
      .returning({ id: orders.id });
    orderIds.push(o!.id);
    // stale
    await saveBasket(db, ids.blakeId, [line(ids.assetBloomFamily)]);
    await ageBasket(ids.blakeId, STALE_AFTER_MS + HOUR);

    await runBasketReminders(db);
    expect([...mailTo('sam'), ...mailTo('jo'), ...mailTo('blake')]).toHaveLength(0);

    // changed their mind: back on → it goes
    await setBasketReminders(db, ids.samId, true, 'test');
    await runBasketReminders(db);
    expect(mailTo('sam')).toHaveLength(1);
  }));

  it('a basket changed after its reminder can earn another — but not within a week', () => exclusively(db, async () => {
    await saveBasket(db, ids.samId, [line(ids.assetFamily)]);
    // reminded 3 days ago, then changed 2 days ago
    await ageBasket(ids.samId, 2 * 24 * HOUR, new Date(Date.now() - 3 * 24 * HOUR));
    await runBasketReminders(db);
    expect(mailTo('sam')).toHaveLength(0);
    // reminded 8 days ago, changed 2 days ago
    await ageBasket(ids.samId, 2 * 24 * HOUR, new Date(Date.now() - REMIND_AGAIN_AFTER_MS - 24 * HOUR));
    await runBasketReminders(db);
    expect(mailTo('sam')).toHaveLength(1);
    expect(REMIND_AFTER_MS).toBe(24 * HOUR);
  }));

  it('the email’s off link turns them off with no sign-in; a tampered link does nothing', async () => {
    const token = basketReminderOffToken(ids.samId);
    expect(await turnBasketRemindersOffByLink(db, `${token}x`, 'email-link')).toEqual({ ok: false });
    expect(await turnBasketRemindersOffByLink(db, token, 'one-click')).toEqual({ ok: true });
    const rows = await db.select().from(consentRecords).where(eq(consentRecords.accountId, ids.samId));
    expect(rows.at(-1)).toMatchObject({ channel: 'EMAIL', purpose: 'MARKETING', status: 'WITHDRAWN', basis: 'SOFT_OPT_IN' });
  });

  it('paying forgets the basket it came from — but not things added after checkout began, and not for a gift-list purchase', async () => {
    await saveBasket(db, ids.samId, [line(ids.assetFamily)]);
    await ageBasket(ids.samId, HOUR);
    await forgetBasketAfterPaid(db, { accountId: ids.samId, giftLinkId: randomUUID(), createdAt: new Date() });
    expect(await loadBasket(db, ids.samId)).toHaveLength(1);
    await forgetBasketAfterPaid(db, { accountId: ids.samId, giftLinkId: null, createdAt: new Date(Date.now() - 2 * HOUR) }); // basket changed after
    expect(await loadBasket(db, ids.samId)).toHaveLength(1);
    await forgetBasketAfterPaid(db, { accountId: ids.samId, giftLinkId: null, createdAt: new Date() });
    expect(await loadBasket(db, ids.samId)).toHaveLength(0);
  });

  it('it is in their data download, and closing the account deletes it', async () => {
    await saveBasket(db, ids.rosieId, [line(ids.assetExtended)]);
    const data = (await collectAccountData(db, ids.rosieId)) as { savedBasket: { lines: unknown[] } | null };
    expect(data.savedBasket?.lines).toEqual([{ product: 'mug-blue', qty: 1 }]);
    await closeAccount(db, ids.rosieId, new Date(), { skipLedger: true });
    expect(await db.select().from(savedBaskets).where(eq(savedBaskets.accountId, ids.rosieId))).toHaveLength(0);
  });
});
