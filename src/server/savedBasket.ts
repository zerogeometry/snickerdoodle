import { and, desc, eq, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { canViewAsset } from '@/authz';
import { accounts, assets, auditRecords, consentRecords, orders, savedBaskets } from '@/db/schema';
import { definedProducts } from '@/server/catalogue';
import { itemName } from '@/lib/product-names';
import { basketPromise, formatShortDate } from '@/lib/season';
import { sendMail } from '@/server/mail';
import { basketReminderEmail, readBasketReminderOffToken } from '@/server/mail/basketReminder';
import { assetRefOf } from './assetRef';
import { resolveViewerContext } from './assets';
import type { DbHandle } from './db';

/**
 * A signed-in shopper's basket, remembered on their account (founder, 25 Nov 2026), and the one kind
 * reminder if it's left unpaid for a day.
 *
 * - The basket is the shop's own lines (product keys, drawing ids, placements) — never a picture, and its
 *   prices are for show: checkout re-prices everything on the server, as for any basket.
 * - What comes back is checked: a line whose drawing is gone, blocked, or one this person can no longer
 *   see (central authz) is left out.
 * - The reminder is a marketing email under PECR, on the soft opt-in (a customer, mid-purchase, told at the
 *   basket). Their own "no thanks" — the basket's switch or the email's off link — is a MARKETING/EMAIL
 *   consent record, WITHDRAWN, logged like any consent change. ONE reminder per basket: a basket changed
 *   after a reminder can earn another, but not within a week.
 */

/** A day after the basket last changed. */
export const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
/** A basket untouched for longer than this gets no reminder (e.g. the job was down) — never a stale nudge. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Never two reminders within a week, whatever happens to the basket. */
export const REMIND_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_LINES = 60;
export const MAX_BYTES = 200_000;

export type SavedLine = Record<string, unknown> & { id: string; product: string; qty: number; pricePence: number; sku?: string; name?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The basket lines as sent from the browser, or null when they aren't a basket at all. Only the shape is
 * checked here (the lines are this person's own and are re-checked at checkout); too many lines, or too
 * much data, is refused.
 */
export function cleanBasketLines(raw: unknown): SavedLine[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  if (JSON.stringify(raw).length > MAX_BYTES) return null;
  const out: SavedLine[] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
    const r = l as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 400) return null;
    if (typeof r.product !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(r.product)) return null;
    if (!Number.isInteger(r.qty) || (r.qty as number) < 1 || (r.qty as number) > 99) return null;
    if (!Number.isInteger(r.pricePence) || (r.pricePence as number) < 0 || (r.pricePence as number) > 10_000_000) return null;
    if (r.sku !== undefined && (typeof r.sku !== 'string' || r.sku.length > 120)) return null;
    out.push(r as SavedLine);
  }
  return out;
}

/** Every drawing a line uses (its artwork, a pack's cards, a calendar's pages, a frame's squares, a bundle's drawings). */
export function drawingIdsOf(line: unknown): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'assetId' && typeof x === 'string' && UUID.test(x)) ids.add(x.toLowerCase());
      else walk(x, depth + 1);
    }
  };
  walk(line, 0);
  return [...ids];
}

/** The same data, whatever order its keys are in (Postgres keeps jsonb keys in its own order). */
export function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([k, x]) => [k, norm(x)])) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Save (or, when empty, forget) the account's basket. Only a real change moves `updatedAt` — the reminder clock. */
export async function saveBasket(db: DbHandle, accountId: string, raw: unknown, now = new Date()): Promise<{ ok: boolean }> {
  const lines = cleanBasketLines(raw);
  if (!lines) return { ok: false };
  if (lines.length === 0) {
    await db.delete(savedBaskets).where(eq(savedBaskets.accountId, accountId));
    return { ok: true };
  }
  const [cur] = await db.select({ items: savedBaskets.items }).from(savedBaskets).where(eq(savedBaskets.accountId, accountId));
  if (cur && sameJson(cur.items, lines)) return { ok: true };
  await db
    .insert(savedBaskets)
    .values({ accountId, items: lines, updatedAt: now })
    .onConflictDoUpdate({ target: savedBaskets.accountId, set: { items: lines, updatedAt: now } });
  return { ok: true };
}

/**
 * The account's saved basket — only the lines whose drawings are still there and that this person may still
 * see. (A guest draft not yet kept has no family; it stays — its picture and its order are gated by its own
 * upload claim, as everywhere.)
 */
export async function loadBasket(db: DbHandle, accountId: string): Promise<SavedLine[]> {
  const [row] = await db.select({ items: savedBaskets.items }).from(savedBaskets).where(eq(savedBaskets.accountId, accountId));
  const lines = cleanBasketLines(row?.items ?? []) ?? [];
  if (lines.length === 0) return [];
  const ids = [...new Set(lines.flatMap(drawingIdsOf))];
  if (ids.length === 0) return lines;
  const rows = await db.select().from(assets).where(inArray(assets.id, ids));
  const viewers = new Map<string, Awaited<ReturnType<typeof resolveViewerContext>>>();
  const ok = new Set<string>();
  for (const a of rows) {
    if (a.moderationStatus === 'BLOCKED') continue;
    if (!a.familyId) {
      ok.add(a.id);
      continue;
    }
    if (!viewers.has(a.familyId)) viewers.set(a.familyId, await resolveViewerContext(db, accountId, a.familyId));
    if (canViewAsset(assetRefOf(a), viewers.get(a.familyId)!).allowed) ok.add(a.id);
  }
  return lines.filter((l) => drawingIdsOf(l).every((id) => ok.has(id)));
}

/**
 * Paid: the basket that became this order is done with. Only a basket not changed since the order was placed
 * (things added after checkout started stay), and never for a gift-list purchase (that wasn't their basket).
 */
export async function forgetBasketAfterPaid(db: DbHandle, order: { accountId: string | null; giftLinkId: string | null; createdAt: Date }): Promise<void> {
  if (!order.accountId || order.giftLinkId) return;
  await db.delete(savedBaskets).where(and(eq(savedBaskets.accountId, order.accountId), lte(savedBaskets.updatedAt, order.createdAt)));
}

// ── the reminder ────────────────────────────────────────────────────────────────────────────────

/** Has this person said no to basket reminders? The latest MARKETING/EMAIL consent record decides. */
export async function basketRemindersOff(db: DbHandle, accountId: string): Promise<boolean> {
  const [latest] = await db
    .select({ status: consentRecords.status })
    .from(consentRecords)
    .where(and(eq(consentRecords.accountId, accountId), eq(consentRecords.channel, 'EMAIL'), eq(consentRecords.purpose, 'MARKETING')))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return latest?.status === 'WITHDRAWN';
}

/** Turn basket reminders off (or back on), logged like any consent change. */
export async function setBasketReminders(db: DbHandle, accountId: string, on: boolean, source: string): Promise<void> {
  await db.insert(consentRecords).values({ accountId, channel: 'EMAIL', purpose: 'MARKETING', status: on ? 'GRANTED' : 'WITHDRAWN', basis: 'SOFT_OPT_IN', source });
  await db.insert(auditRecords).values({
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'CONSENT_CHANGED',
    targetType: 'consent',
    targetId: accountId,
    metadata: { channel: 'EMAIL', purpose: 'MARKETING', what: 'basket-reminders', status: on ? 'GRANTED' : 'WITHDRAWN' },
  });
}

/** The email's off switch, from its signed link (no sign-in). Only ever turns them OFF; a tampered link does nothing. */
export async function turnBasketRemindersOffByLink(db: DbHandle, token: string, source: 'email-link' | 'one-click'): Promise<{ ok: boolean }> {
  const accountId = readBasketReminderOffToken(String(token ?? ''));
  if (!accountId) return { ok: false };
  const [exists] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!exists) return { ok: false };
  if (!(await basketRemindersOff(db, accountId))) await setBasketReminders(db, accountId, false, `basket-reminder:${source}`);
  return { ok: true };
}

/** PURE: is this basket due its reminder now? */
export function isReminderDue(b: { lineCount: number; updatedAt: Date; remindedAt: Date | null; optedOut: boolean; paidSince: boolean }, now: Date): boolean {
  if (b.lineCount === 0 || b.optedOut || b.paidSince) return false;
  const age = now.getTime() - b.updatedAt.getTime();
  if (age < REMIND_AFTER_MS || age > STALE_AFTER_MS) return false;
  if (!b.remindedAt) return true;
  return b.remindedAt < b.updatedAt && now.getTime() - b.remindedAt.getTime() >= REMIND_AGAIN_AFTER_MS;
}

/** "order by thu 10 dec and it all arrives by christmas" — only in season, only while it's still true. */
export function christmasLineFor(lines: SavedLine[], now: Date): string | null {
  const p = basketPromise(lines.map((l) => l.sku ?? l.product), now);
  return p.state === 'in-time' ? `order by ${formatShortDate(p.lastOrderDate)} and it all arrives by christmas` : null;
}

/** The names the email lists — from the shop's own catalogue, never text sent from a browser. */
export function namesFor(lines: SavedLine[]): string[] {
  const label = new Map(definedProducts().map((p) => [p.key, p.label]));
  return lines.map((l) => itemName(l.sku ?? l.product, label.get(l.product) ?? 'keepsake'));
}

/**
 * One reminder run (from the fulfilment tick, every few minutes). Each basket is CLAIMED before its email
 * goes (`reminded_at` set only if nobody else did), so an overlapping run can never send twice; a send that
 * fails puts the claim back for the next run, and the rest of the run carries on.
 */
export async function runBasketReminders(db: DbHandle, now = new Date(), limit = 50): Promise<{ sent: number; failed: number }> {
  const dueBefore = new Date(now.getTime() - REMIND_AFTER_MS);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const rows = await db
    .select({ b: savedBaskets, email: accounts.email, displayName: accounts.displayName })
    .from(savedBaskets)
    .innerJoin(accounts, eq(accounts.id, savedBaskets.accountId))
    .where(and(lte(savedBaskets.updatedAt, dueBefore), gte(savedBaskets.updatedAt, staleBefore), or(isNull(savedBaskets.remindedAt), lt(savedBaskets.remindedAt, savedBaskets.updatedAt))))
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const { b, email, displayName } of rows) {
    const lines = await loadBasket(db, b.accountId);
    const [paid] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.accountId, b.accountId), inArray(orders.status, ['PAID', 'FULFILLING', 'SHIPPED']), gte(orders.paidAt, b.updatedAt)))
      .limit(1);
    const due = isReminderDue({ lineCount: lines.length, updatedAt: b.updatedAt, remindedAt: b.remindedAt, optedOut: await basketRemindersOff(db, b.accountId), paidSince: !!paid }, now);
    if (!due) continue;
    const [claimed] = await db
      .update(savedBaskets)
      .set({ remindedAt: now })
      .where(and(eq(savedBaskets.accountId, b.accountId), eq(savedBaskets.updatedAt, b.updatedAt), b.remindedAt ? eq(savedBaskets.remindedAt, b.remindedAt) : isNull(savedBaskets.remindedAt)))
      .returning({ id: savedBaskets.accountId });
    if (!claimed) continue;
    try {
      await sendMail(
        basketReminderEmail({
          accountId: b.accountId,
          to: email,
          displayName,
          names: namesFor(lines),
          count: lines.reduce((n, l) => n + l.qty, 0),
          christmasLine: christmasLineFor(lines, now),
        }),
      );
      sent++;
    } catch (e) {
      await db.update(savedBaskets).set({ remindedAt: b.remindedAt }).where(and(eq(savedBaskets.accountId, b.accountId), eq(savedBaskets.remindedAt, now)));
      console.error('basket reminder not sent', (e as Error).message);
      failed++;
    }
  }
  return { sent, failed };
}
