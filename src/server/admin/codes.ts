import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { auditRecords, orders, promoCodes } from '@/db/schema';
import type { Reviewer } from '@/authz';
import { codeTerms, type PartnerType, type PromoKind } from '@/pricing';
import { buildCodeRow, describeOffer, type CodeInput, type CodeProblem } from '../../../scripts/lib/promo-codes.mjs';
import type { DbHandle } from '../db';
import { PROMO_HOLD_MS } from '../promos';
import { assertAdmin, londonDay, londonMidnight, PAID_STATES } from './today';

/**
 * The codes screen's data (/admin/codes, the admin app): every discount and partner code with what it has brought in,
 * making a new one, switching one off or on, and what each partner is owed for a month. Admins with two-step login only.
 *
 * A code is made by the SAME rules as the terminal script (scripts/lib/promo-codes.mjs buildCodeRow), so the two make
 * identical codes and nothing the shop's pricing can't price. Money is counted on PAID orders only (paid, being made,
 * shipped). Parents' personal referral codes are one rolled-up line, never listed per parent. A partner's email is
 * only shown when asked for, and every time it is, an audit record says who looked.
 */

export type CodeFilter = 'active' | 'off' | 'all';
/** live: works today · off: switched off · ended / not-started: outside its dates · used-up: every use taken. */
export type CodeState = 'live' | 'off' | 'ended' | 'not-started' | 'used-up';

export interface CodeLine {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  offer: string;
  active: boolean;
  state: CodeState;
  startsAt: Date | null;
  endsAt: Date | null;
  minSpendPence: number;
  /** Who it's for, as the shop decides it (codeTerms): first paid order only? */
  firstOrderOnly: boolean;
  /** Paid orders that used it (what counts against the limit, with open checkouts). */
  uses: number;
  /** Checkouts open with it right now (they hold a use for an hour). */
  holding: number;
  maxRedemptions: number | null;
  partnerName: string | null;
  partnerType: PartnerType | null;
  classLabel: string | null;
  commissionBps: number;
  /** Whether a partner email is on file (the email itself is only shown on request, logged). */
  hasPartnerEmail: boolean;
  revenuePence: number;
  discountPence: number;
  commissionPence: number;
  createdAt: Date;
}

export interface ReferralRollup {
  codes: number;
  active: number;
  orders: number;
  revenuePence: number;
  discountPence: number;
}

const PAID = [...PAID_STATES];
const paidJoin = and(eq(orders.promoCodeId, promoCodes.id), inArray(orders.status, PAID));
const sums = {
  orders: sql<number>`count(${orders.id})::int`,
  revenuePence: sql<number>`coalesce(sum(${orders.totalPence}), 0)::int`,
  discountPence: sql<number>`coalesce(sum(${orders.promoSavingPence}), 0)::int`,
  commissionPence: sql<number>`coalesce(sum(${orders.partnerCommissionPence}), 0)::int`,
};

function stateOf(c: { active: boolean; startsAt: Date | null; endsAt: Date | null; maxRedemptions: number | null }, uses: number, now: Date): CodeState {
  if (!c.active) return 'off';
  if (c.endsAt && c.endsAt <= now) return 'ended';
  if (c.startsAt && c.startsAt > now) return 'not-started';
  if (c.maxRedemptions !== null && uses >= c.maxRedemptions) return 'used-up';
  return 'live';
}

/** Every shop code (not parents' referral codes), newest first, with paid orders, revenue and commission; plus the referral roll-up. */
export async function listCodes(db: DbHandle, reviewer: Reviewer, filter: CodeFilter = 'all', now = new Date()): Promise<{ codes: CodeLine[]; referrals: ReferralRollup }> {
  assertAdmin(reviewer);
  const shop = and(isNull(promoCodes.ownerAccountId), filter === 'active' ? eq(promoCodes.active, true) : filter === 'off' ? eq(promoCodes.active, false) : undefined);
  const rows = await db
    .select({
      id: promoCodes.id,
      code: promoCodes.code,
      kind: promoCodes.kind,
      value: promoCodes.value,
      active: promoCodes.active,
      startsAt: promoCodes.startsAt,
      endsAt: promoCodes.endsAt,
      minSpendPence: promoCodes.minSpendPence,
      flaggedFirstOrder: promoCodes.firstOrderOnly,
      maxRedemptions: promoCodes.maxRedemptions,
      partnerName: promoCodes.partnerName,
      partnerType: promoCodes.partnerType,
      classLabel: promoCodes.classLabel,
      commissionBps: promoCodes.commissionBps,
      hasPartnerEmail: sql<boolean>`${promoCodes.partnerEmail} is not null`,
      createdAt: promoCodes.createdAt,
      ...sums,
    })
    .from(promoCodes)
    .leftJoin(orders, paidJoin)
    .where(shop)
    .groupBy(promoCodes.id)
    .orderBy(sql`${promoCodes.createdAt} desc`, asc(promoCodes.code));

  const ids = rows.map((r) => r.id);
  const held = ids.length
    ? await db
        .select({ id: orders.promoCodeId, n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(inArray(orders.promoCodeId, ids), eq(orders.status, 'PENDING'), gt(orders.createdAt, new Date(now.getTime() - PROMO_HOLD_MS))))
        .groupBy(orders.promoCodeId)
    : [];
  const holding = new Map(held.map((h) => [h.id, h.n]));

  const [ref] = await db
    .select({
      codes: sql<number>`count(distinct ${promoCodes.id})::int`,
      active: sql<number>`count(distinct ${promoCodes.id}) filter (where ${promoCodes.active})::int`,
      orders: sums.orders,
      revenuePence: sums.revenuePence,
      discountPence: sums.discountPence,
    })
    .from(promoCodes)
    .leftJoin(orders, paidJoin)
    .where(isNotNull(promoCodes.ownerAccountId));

  return {
    codes: rows.map(({ orders: uses, flaggedFirstOrder, ...r }) => ({
      ...r,
      offer: describeOffer(r),
      state: stateOf(r, uses, now),
      firstOrderOnly: codeTerms({ kind: r.kind, partnerType: r.partnerType, firstOrderOnly: flaggedFirstOrder }).firstOrderOnly,
      uses,
      holding: holding.get(r.id) ?? 0,
    })),
    referrals: { codes: ref?.codes ?? 0, active: ref?.active ?? 0, orders: ref?.orders ?? 0, revenuePence: ref?.revenuePence ?? 0, discountPence: ref?.discountPence ?? 0 },
  };
}

export type CreateCodeResult = { ok: true; id: string; code: string } | { ok: false; problems: CodeProblem[] };

/** Make a new code, by the script's rules. A code that already exists is refused (switch it on instead). */
export async function createCode(db: DbHandle, reviewer: Reviewer, input: CodeInput, now = new Date()): Promise<CreateCodeResult> {
  assertAdmin(reviewer);
  const built = buildCodeRow(input, now);
  if (!built.ok) return built;
  const taken = { ok: false as const, problems: [{ field: 'code' as const, message: `there’s already a code called ${built.row.code}: pick another name, or switch that one back on` }] };
  const [exists] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, built.row.code));
  if (exists) return taken;
  const [row] = await db.insert(promoCodes).values(built.row).onConflictDoNothing({ target: promoCodes.code }).returning({ id: promoCodes.id, code: promoCodes.code });
  return row ? { ok: true, ...row } : taken; // made by someone else between the check and the insert
}

/** Switch a shop code off (it stops working at once, even mid-checkout) or back on. Not a parent's referral code. */
export async function setCodeActive(db: DbHandle, reviewer: Reviewer, id: string, active: boolean): Promise<{ code: string } | null> {
  assertAdmin(reviewer);
  const [row] = await db
    .update(promoCodes)
    .set({ active })
    .where(and(eq(promoCodes.id, id), isNull(promoCodes.ownerAccountId)))
    .returning({ code: promoCodes.code });
  return row ?? null;
}
export const switchOff = (db: DbHandle, reviewer: Reviewer, id: string) => setCodeActive(db, reviewer, id, false);
export const switchOn = (db: DbHandle, reviewer: Reviewer, id: string) => setCodeActive(db, reviewer, id, true);

// ── commission owed, per London calendar month ───────────────────────────────

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH.test(v) && Number(v.slice(0, 4)) >= 2020 && Number(v.slice(0, 4)) <= 2100;
}

/** The London calendar month before the one `now` is in, as YYYY-MM. */
export function lastMonth(now = new Date()): string {
  const today = londonDay(now);
  return new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
}

/** 00:00 London on the 1st of the month, to 00:00 London on the 1st of the next. */
export function monthBounds(month: string): { from: Date; to: Date; label: string } {
  if (!isMonth(month)) throw new Error(`not a month: ${month}`);
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return {
    from: londonMidnight(`${month}-01`),
    to: londonMidnight(next),
    label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

export interface PartnerOwed {
  /** What groups a partner's codes: their name (a school's class codes roll up), or the code if it has none. */
  key: string;
  partnerName: string | null;
  partnerType: PartnerType | null;
  codes: string[];
  classes: string[];
  paidOrders: number;
  /** Paid orders that earned (a creator earns on a follower's first paid order only; a PTA on every one). */
  earningOrders: number;
  salesPence: number;
  commissionPence: number;
  hasEmail: boolean;
}

/** Per partner: paid orders in the month (by when they were paid), and the commission they earned. No emails. */
export async function commissionOwed(db: DbHandle, reviewer: Reviewer, month: string): Promise<{ month: string; label: string; partners: PartnerOwed[]; totalPence: number }> {
  assertAdmin(reviewer);
  const { from, to, label } = monthBounds(month);
  const key = sql<string>`coalesce(${promoCodes.partnerName}, ${promoCodes.code})`;
  const rows = await db
    .select({
      key,
      partnerName: sql<string | null>`min(${promoCodes.partnerName})`,
      partnerType: promoCodes.partnerType,
      codes: sql<string[]>`array_agg(distinct ${promoCodes.code} order by ${promoCodes.code})`,
      classes: sql<string[]>`coalesce(array_agg(distinct ${promoCodes.classLabel}) filter (where ${promoCodes.classLabel} is not null), '{}')`,
      paidOrders: sql<number>`count(${orders.id})::int`,
      earningOrders: sql<number>`count(${orders.id}) filter (where ${orders.partnerCommissionPence} > 0)::int`,
      salesPence: sql<number>`coalesce(sum(${orders.totalPence}), 0)::int`,
      commissionPence: sql<number>`coalesce(sum(${orders.partnerCommissionPence}), 0)::int`,
      hasEmail: sql<boolean>`bool_or(${promoCodes.partnerEmail} is not null)`,
    })
    .from(orders)
    .innerJoin(promoCodes, eq(promoCodes.id, orders.promoCodeId))
    .where(
      and(
        inArray(orders.status, PAID),
        gte(orders.paidAt, from),
        lt(orders.paidAt, to),
        isNull(promoCodes.ownerAccountId),
        sql`(${promoCodes.partnerType} is not null or ${promoCodes.commissionBps} > 0)`,
      ),
    )
    .groupBy(key, promoCodes.partnerType)
    .orderBy(sql`coalesce(sum(${orders.partnerCommissionPence}), 0) desc`, key);
  return { month, label, partners: rows, totalPence: rows.reduce((n, r) => n + r.commissionPence, 0) };
}

/**
 * A partner's email, to pay them or say thank you. Personal data shown to a person, so each code whose email is
 * shown gets an audit record (ADMIN_PERSONAL_DATA_VIEWED, promo_code) naming the admin who looked.
 */
export async function revealPartnerEmail(db: DbHandle, reviewer: Reviewer, partnerKey: string, now = new Date()): Promise<string[]> {
  assertAdmin(reviewer);
  const rows = await db
    .select({ id: promoCodes.id, email: promoCodes.partnerEmail })
    .from(promoCodes)
    .where(and(sql`coalesce(${promoCodes.partnerName}, ${promoCodes.code}) = ${partnerKey}`, isNull(promoCodes.ownerAccountId), isNotNull(promoCodes.partnerEmail)));
  if (!rows.length) return [];
  await db.insert(auditRecords).values(
    rows.map((r) => ({
      actorAccountId: reviewer.accountId,
      actorType: 'ADMIN' as const,
      event: 'ADMIN_PERSONAL_DATA_VIEWED' as const,
      targetType: 'promo_code',
      targetId: r.id,
      metadata: { field: 'partner_email', screen: 'admin/codes' },
      createdAt: now,
    })),
  );
  return [...new Set(rows.map((r) => r.email!))];
}
