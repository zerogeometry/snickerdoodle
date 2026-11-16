import type { Sql, TransactionSql } from 'postgres';
import type { Reviewer } from '@/authz';
import { CUT_LINE_PENCE, channelRows, channelTotal, settledRepeatRate, weekSummary } from '../../../scripts/lib/gtm-metrics.mjs';
import { loadGtmData, PAID } from '../../../scripts/lib/gtm-metrics-data.mjs';
import type { DbHandle } from '../db';
import { APP_TOKEN_IDLE_MS } from '../app/link';
import { assertAdmin } from './today';
import { funnelSteps, salesOf, weekPair, type FunnelCounts, type FunnelStep, type Sales, type WeekPair, type WeekWindow, type WhichWeek } from './weekMaths';

/**
 * The "this week" screen's data (the admin app, project-office/briefs/ADMIN-APP-plan.md §4). Admins with two-step
 * login only. COUNTS, SUMS AND RATES ONLY: no names, emails, order refs, pictures or anything about a child leaves
 * this module. The channel, gift-loop, repeat and safety numbers are the Monday report's own maths on its own rows
 * (scripts/lib/gtm-metrics*.mjs), so the screen and `npm run metrics` always agree. Every query runs inside one READ
 * ONLY transaction, as the report's does: the database refuses any write.
 *
 * Where families drop off is counted from what the site already records (pictures, designs, orders): no cookies,
 * no tracking of anyone, and each step is that week's count on its own, not the same families followed through.
 */

/** A drizzle handle over postgres.js, with its raw client (getDb() and a test's drizzle(client) both are). */
export type WeekDb = DbHandle & { $client: Sql };

export interface SpendLine {
  channel: string;
  pence: number;
}

export interface ChannelRow {
  key?: string;
  label: string;
  orders: number;
  first: number;
  /** ex-VAT, as the Monday report. */
  revenuePence: number;
  commissionPence: number;
  relatives: number;
  spendPence: number | null;
  costPence: number | null;
  costPerFirstPence: number | null;
  /** '' | 'over £15' | 'no 1st orders' (the Monday report's words). */
  flag: string;
}

type Summary = ReturnType<typeof weekSummary>;

export interface WeekSide {
  window: WeekWindow;
  sales: Sales;
  summary: Summary;
  funnel: FunnelCounts & { uploadsWeb: number; uploadsDraw: number };
  draw: { phonesLinked: number; drawingsSent: number; drawOrders: number };
}

export interface WeekInsights {
  pair: WeekPair;
  current: WeekSide;
  previous: WeekSide;
  /** Best sellers this week by units (product names from the catalogue), most first, at most 8. */
  products: { label: string; units: number }[];
  channels: { rows: ChannelRow[]; total: ChannelRow; withSpend: boolean; cutLinePence: number };
  funnel: FunnelStep[];
  repeat: { settled: { cohort: number; repeated: number; rate: number | null }; returningOrders: number; returningOrdersBefore: number };
  waitingNow: { count: number; oldestAt: Date | null };
  /** Phones linked to a family right now (not unlinked, used in the last 90 days). */
  phonesLinkedNow: number;
  /** Anything at all happened in the week on screen. */
  hasData: boolean;
  /** When this was worked out. */
  now: Date;
}

const DRAW_SOURCES = ['app-screen', 'app-paper'];

/** Times go to the database as text: drizzle swaps the shared client's date serialisers for pass-through ones. */
const iso = (w: WeekWindow) => ({ start: w.start.toISOString(), end: w.end.toISOString() });

/** The week's own counts the Monday report doesn't have: drop-off steps and Draw. */
async function sideCounts(tx: TransactionSql, win: WeekWindow) {
  const w = iso(win);
  const [u] = await tx<{ web: number; draw: number }[]>`
    select count(*) filter (where source = 'web')::int as web, count(*) filter (where source in ${tx(DRAW_SOURCES)})::int as draw
    from assets where created_at >= ${w.start} and created_at < ${w.end} and not is_brand_safe_fixture`;
  const [d] = await tx<{ n: number }[]>`select count(*)::int as n from saved_designs where created_at >= ${w.start} and created_at < ${w.end}`;
  const [c] = await tx<{ n: number }[]>`select count(*)::int as n from orders where created_at >= ${w.start} and created_at < ${w.end}`;
  const [p] = await tx<{ n: number }[]>`select count(*)::int as n from app_tokens where created_at >= ${w.start} and created_at < ${w.end}`;
  // Orders with a drawing that came from Draw: the lasting trace of "make it real" (the app's one-off checkout
  // passes are cleared a day after they expire, so they can't be counted a week later).
  const [o] = await tx<{ n: number }[]>`
    select count(distinct o.id)::int as n from orders o
    join order_items i on i.order_id = o.id
    join order_item_artwork art on art.order_item_id = i.id
    join assets a on a.id = art.asset_id
    where o.status in ${tx(PAID)} and coalesce(o.paid_at, o.created_at) >= ${w.start} and coalesce(o.paid_at, o.created_at) < ${w.end}
      and a.source in ${tx(DRAW_SOURCES)}`;
  return { uploadsWeb: u?.web ?? 0, uploadsDraw: u?.draw ?? 0, designs: d?.n ?? 0, checkouts: c?.n ?? 0, phonesLinked: p?.n ?? 0, drawOrders: o?.n ?? 0 };
}

/** Units sold per product in the window. A christmas bundle counts once per bundle bought (not per piece in it). */
async function bestSellers(tx: TransactionSql, win: WeekWindow, limit = 8) {
  const w = iso(win);
  return tx<{ label: string; units: number }[]>`
    with paid as (
      select o.id from orders o
      where o.status in ${tx(PAID)} and coalesce(o.paid_at, o.created_at) >= ${w.start} and coalesce(o.paid_at, o.created_at) < ${w.end}
    ), lines as (
      select coalesce(p.label, vp.label, i.product_key) as label, i.qty as units
      from order_items i join paid on paid.id = i.order_id
      left join products p on p.key = i.product_key
      left join product_variants v on v.id = i.variant_id
      left join products vp on vp.id = v.product_id
      where i.bundle_key is null
      union all
      select coalesce(bp.label, bvp.label, b.bundle_key) as label, 1 as units
      from (select distinct i.order_id, i.bundle_key from order_items i join paid on paid.id = i.order_id where i.bundle_key is not null) b
      left join products bp on bp.key = b.bundle_key
      left join product_variants bv on bv.sku = b.bundle_key
      left join products bvp on bvp.id = bv.product_id
    )
    select label, sum(units)::int as units from lines group by label order by units desc, label limit ${limit}`;
}

/**
 * The week on screen (this week so far, or last week) against the week before, plus the optional spend lines the
 * founder typed for cost per first order. Throws AuthzError for anyone but an admin with two-step login.
 */
export async function weekInsights(db: WeekDb, reviewer: Reviewer, opts: { which: WhichWeek; spend?: SpendLine[] | null; now?: Date }): Promise<WeekInsights> {
  assertAdmin(reviewer);
  const now = opts.now ?? new Date();
  const pair = weekPair(now, opts.which);
  const spend = opts.spend && opts.spend.length ? opts.spend : null;

  return db.$client.begin('read only', async (tx) => {
    const data = await loadGtmData(tx, pair.asOf);
    const [cur, prev] = [await sideCounts(tx, pair.current), await sideCounts(tx, pair.previous)];
    const products = await bestSellers(tx, pair.current);
    const idleSince = new Date(pair.asOf.getTime() - APP_TOKEN_IDLE_MS);
    const [linked] = await tx<{ n: number }[]>`
      select count(*)::int as n from app_tokens where revoked_at is null and last_used_at >= ${idleSince.toISOString()} and created_at < ${pair.asOf.toISOString()}`;

    const side = (w: WeekWindow, c: typeof cur): WeekSide => {
      const summary = weekSummary(data, w, pair.asOf);
      const sales = salesOf(data.orders, w);
      return {
        window: w,
        sales,
        summary,
        funnel: { uploads: c.uploadsWeb + c.uploadsDraw, uploadsWeb: c.uploadsWeb, uploadsDraw: c.uploadsDraw, designs: c.designs, checkouts: c.checkouts, paid: sales.orders },
        draw: { phonesLinked: c.phonesLinked, drawingsSent: c.uploadsDraw, drawOrders: c.drawOrders },
      };
    };
    const current = side(pair.current, cur);
    const previous = side(pair.previous, prev);
    const rows = channelRows(data, pair.current, spend) as ChannelRow[];
    const total = channelTotal(rows, !!spend) as ChannelRow;

    const s = current.summary;
    const hasData =
      current.sales.orders + current.funnel.uploads + current.funnel.designs + current.funnel.checkouts + s.giftLinksMade + s.familyJoins + s.flagged + s.giftLinkReports + current.draw.phonesLinked > 0;

    return {
      pair,
      current,
      previous,
      products: products.map((p) => ({ label: p.label, units: Number(p.units) })),
      channels: { rows, total, withSpend: !!spend, cutLinePence: CUT_LINE_PENCE },
      funnel: funnelSteps(current.funnel),
      repeat: {
        settled: settledRepeatRate(data.orders, pair.asOf),
        returningOrders: current.summary.orders - current.summary.firstOrders,
        returningOrdersBefore: previous.summary.orders - previous.summary.firstOrders,
      },
      waitingNow: data.waitingNow,
      phonesLinkedNow: linked?.n ?? 0,
      hasData,
      now,
    };
  }) as Promise<WeekInsights>;
}
