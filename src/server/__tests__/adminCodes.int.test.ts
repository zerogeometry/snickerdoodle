import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { auditRecords, orders, promoCodes } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, type Reviewer } from '@/authz';
import { evaluatePromo, type PromoLine } from '@/pricing/promo';
import { resolvePromo } from '@/server/promos';
import { commissionOwed, createCode, listCodes, monthBounds, revealPartnerEmail, setCodeActive, switchOff, switchOn } from '@/server/admin/codes';
import type { DbHandle } from '@/server/db';
import type { CodeInput } from '../../../scripts/lib/promo-codes.mjs';

/**
 * The admin app's codes screen against a real Postgres (src/server/admin/codes.ts): only an admin with two-step login
 * gets in; a code made on the screen is the same row, and priced by the shop exactly the same, as one made by the
 * terminal script (run for real here); switching a code off stops it at once; and commission owed counts PAID orders
 * in the London calendar month only. Everything it makes is removed afterwards (audit rows are append-only, so the
 * "email shown" records stay, as they would in real life).
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('admin codes screen (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let admin: Reviewer;
  let tag: string;
  const codes: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    tag = ids.nonce.toUpperCase();
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (codes.length) {
      const mine = await db.select({ id: orders.id }).from(orders).innerJoin(promoCodes, eq(promoCodes.id, orders.promoCodeId)).where(inArray(promoCodes.code, codes));
      if (mine.length) await db.delete(orders).where(inArray(orders.id, mine.map((o) => o.id)));
      await db.delete(promoCodes).where(inArray(promoCodes.code, codes));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const name = (s: string) => {
    const c = `AC${tag}${s}`;
    codes.push(c);
    return c;
  };
  const make = async (input: CodeInput) => {
    const r = await createCode(db, admin, input);
    if (!r.ok) throw new Error(r.problems.map((p) => `${p.field}: ${p.message}`).join('; '));
    return r;
  };
  const rowOf = async (code: string) => (await db.select().from(promoCodes).where(eq(promoCodes.code, code)))[0]!;
  const script = (...args: string[]) => execFileSync(process.execPath, ['scripts/promo-codes.mjs', 'create', ...args], { env: process.env, encoding: 'utf8' });
  const guest = () => ({ accountId: null, email: `new-${ids.nonce}-${Math.random().toString(36).slice(2)}@example.test` });
  const basket: PromoLine[] = [
    { linePence: 6500, lineCostPence: 2200 },
    { linePence: 350, lineCostPence: 120, freeCardUnitPence: 350 },
  ];

  it('refuses anyone but an admin with two-step login, for every action, and changes nothing', async () => {
    const people: Reviewer[] = [
      { accountId: null, isAdmin: false, mfaVerified: false },
      { accountId: ids.joId, isAdmin: false, mfaVerified: true },
      { accountId: ids.samId, isAdmin: true, mfaVerified: false },
    ];
    const code = `AC${tag}NOPE`;
    for (const r of people) {
      await expect(listCodes(db, r)).rejects.toBeInstanceOf(AuthzError);
      await expect(createCode(db, r, { code, kind: 'PERCENT', amount: '10' })).rejects.toBeInstanceOf(AuthzError);
      await expect(setCodeActive(db, r, '00000000-0000-0000-0000-000000000000', false)).rejects.toBeInstanceOf(AuthzError);
      await expect(commissionOwed(db, r, '2026-06')).rejects.toBeInstanceOf(AuthzError);
      await expect(revealPartnerEmail(db, r, 'anyone')).rejects.toBeInstanceOf(AuthzError);
    }
    expect(await db.select().from(promoCodes).where(eq(promoCodes.code, code))).toHaveLength(0);
  });

  it('a code made on the screen is the same row, priced exactly the same, as one made by the terminal script', async () => {
    const pairs: { input: Omit<CodeInput, 'code'>; flags: string[] }[] = [
      {
        input: { kind: 'PERCENT', amount: '15', minSpend: '15', maxUses: '500', startsOn: '2026-01-01', endsOn: '2030-12-24', firstOrder: true },
        flags: ['--percent', '15', '--min', '15', '--max', '500', '--starts', '2026-01-01', '--ends', '2030-12-24', '--first-order'],
      },
      { input: { kind: 'FIXED', amount: '10', minSpend: '60' }, flags: ['--pounds', '10', '--min', '60'] },
      { input: { kind: 'FREE_CARD', maxUses: '500' }, flags: ['--free-card', '--max', '500'] },
      {
        input: { kind: 'PERCENT', amount: '10', commission: '5', partnerName: `Sarah ${tag}`, partnerType: 'INFLUENCER', partnerEmail: `sarah-${ids.nonce}@example.test` },
        flags: ['--percent', '10', '--commission', '5', '--partner', `Sarah ${tag}`, '--type', 'INFLUENCER', '--partner-email', `sarah-${ids.nonce}@example.test`],
      },
      {
        input: { kind: 'PERCENT', amount: '0', commission: '10', partnerName: `Pta ${tag}`, partnerType: 'PTA', classLabel: 'Year 2' },
        flags: ['--percent', '0', '--commission', '10', '--partner', `Pta ${tag}`, '--type', 'PTA', '--class', 'Year 2'],
      },
    ];
    for (const [i, p] of pairs.entries()) {
      const app = name(`${i}A`);
      const term = name(`${i}S`);
      await make({ ...p.input, code: app.toLowerCase() });
      expect(script(term, ...p.flags)).toContain(`${term} saved`);

      const { id: _a, code: _ac, createdAt: _at, ...appRow } = await rowOf(app);
      const { id: _b, code: _bc, createdAt: _bt, ...termRow } = await rowOf(term);
      expect(appRow).toEqual(termRow);

      const buyer = guest();
      const [ra, rt] = [await resolvePromo(db, app, new Date(), buyer), await resolvePromo(db, term, new Date(), buyer)];
      expect(ra.ok && rt.ok).toBe(true);
      if (!ra.ok || !rt.ok) continue;
      const { id: _ri, code: _rc, ...ruleA } = ra.rule;
      const { id: _si, code: _sc, ...ruleT } = rt.rule;
      expect(ruleA).toEqual(ruleT);
      for (const other of [0, 300]) expect(evaluatePromo(ra.rule, basket, other)).toEqual(evaluatePromo(rt.rule, basket, other));
    }
  }, 60_000);

  it('refuses a code that already exists (whatever the case), and a value the shop can’t price, saving nothing', async () => {
    const code = name('DUP');
    await make({ code, kind: 'PERCENT', amount: '10' });
    const again = await createCode(db, admin, { code: ` ${code.toLowerCase()} `, kind: 'FIXED', amount: '5' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.problems.map((p) => p.field)).toEqual(['code']);
    expect((await rowOf(code)).kind).toBe('PERCENT'); // untouched

    const tooMuch = name('BIG');
    const r = await createCode(db, admin, { code: tooMuch, kind: 'PERCENT', amount: '75' });
    expect(r.ok).toBe(false);
    expect(await db.select().from(promoCodes).where(eq(promoCodes.code, tooMuch))).toHaveLength(0);
  });

  it('switching a code off stops it resolving at once; switching it on brings it back', async () => {
    const code = name('OFF');
    const { id } = await make({ code, kind: 'FIXED', amount: '5' });
    expect((await resolvePromo(db, code)).ok).toBe(true);
    expect(await switchOff(db, admin, id)).toEqual({ code });
    expect(await resolvePromo(db, code)).toEqual({ ok: false, reason: 'unknown' });
    expect((await listCodes(db, admin, 'off')).codes.find((c) => c.id === id)).toMatchObject({ active: false, state: 'off' });
    expect((await listCodes(db, admin, 'active')).codes.find((c) => c.id === id)).toBeUndefined();
    expect(await switchOn(db, admin, id)).toEqual({ code });
    expect((await resolvePromo(db, code)).ok).toBe(true);
  });

  it('a parent’s referral code is rolled up, never listed, and can’t be switched from the screen', async () => {
    const code = name('REF');
    const [ref] = await db.insert(promoCodes).values({ code, kind: 'FIXED', value: 500, minSpendPence: 3000, partnerType: 'REFERRAL', ownerAccountId: ids.blakeId }).returning();
    const list = await listCodes(db, admin, 'all');
    expect(list.codes.some((c) => c.code === code)).toBe(false);
    expect(list.referrals.codes).toBeGreaterThanOrEqual(1);
    expect(await setCodeActive(db, admin, ref!.id, false)).toBeNull();
    expect((await rowOf(code)).active).toBe(true);
  });

  it('commission owed counts PAID orders in the London month only, per partner; the list counts paid orders only', async () => {
    const school = `School ${tag}`;
    const email = `pta-${ids.nonce}@example.test`;
    const y2 = await make({ code: name('Y2'), kind: 'PERCENT', amount: '0', commission: '10', partnerName: school, partnerType: 'PTA', classLabel: 'Year 2', partnerEmail: email });
    const y3 = await make({ code: name('Y3'), kind: 'PERCENT', amount: '0', commission: '10', partnerName: school, partnerType: 'PTA', classLabel: 'Year 3' });
    const order = async (codeId: string, status: (typeof orders.$inferInsert)['status'], paidAt: string | null, totalPence: number, commission: number) => {
      const [o] = await db
        .insert(orders)
        .values({ ref: `AC-${ids.nonce}-${orderIds.length}`, status, subtotalPence: totalPence, deliveryPence: 0, totalPence, promoCodeId: codeId, partnerCommissionPence: commission, paidAt: paidAt ? new Date(paidAt) : null })
        .returning({ id: orders.id });
      orderIds.push(o!.id);
    };
    // June 2026 in London is 2026-05-31T23:00Z → 2026-06-30T23:00Z (BST)
    expect(monthBounds('2026-06')).toMatchObject({ from: new Date('2026-05-31T23:00:00Z'), to: new Date('2026-06-30T23:00:00Z'), label: 'June 2026' });
    await order(y2.id, 'PAID', '2026-05-31T23:30:00Z', 2000, 100); // 00:30 on 1 June, London → June
    await order(y2.id, 'SHIPPED', '2026-06-15T12:00:00Z', 3000, 200);
    await order(y3.id, 'FULFILLING', '2026-06-30T22:59:00Z', 4000, 300); // 23:59 on 30 June → June
    await order(y3.id, 'PAID', '2026-06-30T23:00:00Z', 5000, 400); // midnight → July
    await order(y2.id, 'PAID', '2026-05-31T22:59:00Z', 6000, 700); // 23:59 on 31 May → May
    await order(y2.id, 'PENDING', null, 7000, 500); // not paid
    await order(y2.id, 'CANCELLED', '2026-06-10T12:00:00Z', 8000, 600); // paid, then refunded in full

    const june = await commissionOwed(db, admin, '2026-06');
    const mine = june.partners.filter((p) => p.key === school);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ partnerName: school, partnerType: 'PTA', paidOrders: 3, earningOrders: 3, salesPence: 9000, commissionPence: 600, hasEmail: true, classes: ['Year 2', 'Year 3'] });
    expect([...mine[0]!.codes].sort()).toEqual([y2.code, y3.code].sort());
    expect(JSON.stringify(june)).not.toContain(email); // the email is only ever shown on request
    expect((await commissionOwed(db, admin, '2026-07')).partners.find((p) => p.key === school)?.commissionPence).toBe(400);
    expect((await commissionOwed(db, admin, '2026-05')).partners.find((p) => p.key === school)?.commissionPence).toBe(700);

    const list = (await listCodes(db, admin, 'all')).codes;
    expect(list.find((c) => c.id === y2.id)).toMatchObject({ uses: 3, revenuePence: 11000, commissionPence: 1000, holding: 1, hasPartnerEmail: true, firstOrderOnly: false });
    expect(list.find((c) => c.id === y3.id)).toMatchObject({ uses: 2, revenuePence: 9000, commissionPence: 700, holding: 0, hasPartnerEmail: false });
    expect(JSON.stringify(list)).not.toContain(email);
  });

  it('showing a partner’s email is logged as personal data viewed, against the code, by the admin who looked', async () => {
    const partner = `Creator ${tag}`;
    const email = `creator-${ids.nonce}@example.test`;
    const c = await make({ code: name('EMAIL'), kind: 'PERCENT', amount: '10', commission: '5', partnerName: partner, partnerType: 'INFLUENCER', partnerEmail: email });
    const logged = () => db.select().from(auditRecords).where(and(eq(auditRecords.event, 'ADMIN_PERSONAL_DATA_VIEWED'), eq(auditRecords.targetType, 'promo_code'), eq(auditRecords.targetId, c.id)));
    await expect(revealPartnerEmail(db, { ...admin, mfaVerified: false }, partner)).rejects.toBeInstanceOf(AuthzError);
    expect(await logged()).toHaveLength(0);
    expect(await revealPartnerEmail(db, admin, partner)).toEqual([email]);
    const rows = await logged();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorAccountId: admin.accountId, actorType: 'ADMIN' });
    expect(await revealPartnerEmail(db, admin, `Nobody ${tag}`)).toEqual([]);
  });
});
