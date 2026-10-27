// The Monday GTM review (C14): orders + first orders by channel, cost per first order, the gift
// loop, repeat rate, content review times and multi-buy — one week plus a 4-week trend.
//
//   npm run metrics -- --from 2026-11-16 --to 2026-11-22 [--spend spend.csv]
//   node --env-file=.env scripts/gtm-metrics.mjs --from 2026-11-16 --to 2026-11-22 [--spend spend.csv]
//   (no --from/--to = last full Monday–Sunday week; dates are London calendar days, inclusive)
//
// spend.csv is "channel,amount" in pounds — the channel is a code (SARAHMAKES, DRAWIT), a PTA's
// school name, or "direct" / "gift link". See project-office/ops/METRICS.md.
//
// READ-ONLY: every query runs inside a READ ONLY transaction (the database refuses any write).
// The output is aggregates only — no names, emails, addresses, asset ids or anything about a
// child. Customers are told apart by an md5 of the email made inside the query, never printed.
// The maths lives in scripts/lib/gtm-metrics.mjs (unit-tested).

import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { parseArgs, parseSpendCsv, renderReport, trendWindows } from './lib/gtm-metrics.mjs';

const PAID = ['PAID', 'FULFILLING', 'SHIPPED'];

let args;
try {
  args = parseArgs(process.argv.slice(2), new Date().toISOString().slice(0, 10));
} catch (e) {
  console.error('✗', e.message);
  process.exit(1);
}
const spend = args.spendPath ? parseSpendCsv(readFileSync(args.spendPath, 'utf8')) : null;
const windows = trendWindows(args.from, args.to, 4);
const asOf = windows[windows.length - 1].end;

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const data = await sql.begin('read only', async (tx) => {
    // Columns other sessions may still be adding: use them when they're there, skip when not.
    const cols = new Set((await tx`select column_name from information_schema.columns where table_schema = current_schema() and table_name = 'orders'`).map((r) => r.column_name));
    const optional = (name) => (cols.has(name) ? tx`o.${tx(name)}` : tx`null::int`);

    // Every paid order up to the end of the report week (first orders + repeats need the history).
    const orders = await tx`
      select md5(coalesce(lower(coalesce(a.email, o.buyer_email)), o.id::text)) as customer,
             coalesce(o.paid_at, o.created_at) as at,
             o.total_pence, o.partner_commission_pence,
             c.code, c.partner_type, c.partner_name, (c.owner_account_id is not null) as is_referral,
             (o.gift_link_id is not null) as gift_link,
             md5(lower(la.email)) as link_owner,
             (o.gift_link_id is not null and (o.join_saving_pence > 0 or exists (
                select 1 from memberships m join accounts ma on ma.id = m.account_id
                where m.family_id = gl.family_id and not m.is_owner
                  and (m.account_id = o.account_id or ma.email = lower(o.buyer_email))))) as joined,
             (select coalesce(sum(i.qty), 0)::int from order_items i where i.order_id = o.id) as items,
             ${optional('parcel_saving_pence')} as parcel_saving_pence,
             ${optional('family_set_saving_pence')} as family_set_saving_pence,
             -- the christmas bundle is split into its pieces at order time; placemats + coasters
             -- together are only sold as the bundle (src/lib/christmas-bundle.ts)
             (exists (select 1 from order_items i where i.order_id = o.id and i.product_key like 'placemat%')
              and exists (select 1 from order_items i where i.order_id = o.id and i.product_key like 'coaster%')) as bundle
      from orders o
      left join accounts a on a.id = o.account_id
      left join promo_codes c on c.id = o.promo_code_id
      left join gift_links gl on gl.id = o.gift_link_id
      left join accounts la on la.id = gl.created_by_account_id
      where o.status in ${tx(PAID)} and coalesce(o.paid_at, o.created_at) < ${asOf}`;

    // The shop's codes (personal referral codes left out — each belongs to a parent), so spend on a
    // code that sold nothing this week still lands on the right channel.
    const codes = await tx`select code, partner_type, partner_name from promo_codes where owner_account_id is null`;

    const giftLinks = await tx`
      select gl.created_at as at,
             (select min(coalesce(o.paid_at, o.created_at)) from orders o where o.gift_link_id = gl.id and o.status in ${tx(PAID)}) as purchased_at
      from gift_links gl where gl.created_at < ${asOf}`;

    // Relatives joining a family from a parent's invite (never the owner's own membership).
    const joins = await tx`
      select coalesce(m.joined_at, m.created_at) as at, md5(lower(fa.email)) as owner
      from memberships m join families f on f.id = m.family_id join accounts fa on fa.id = f.owner_account_id
      where not m.is_owner and m.invite_id is not null and coalesce(m.joined_at, m.created_at) < ${asOf}`;

    // Content review (D8): each flag, paired with the first review decision on the same item after it.
    const flags = await tx`
      select f.created_at as at, (f.target_type = 'gift_link') as via_link,
             (select min(r.created_at) from audit_records r
               where r.event = 'CONTENT_REVIEWED' and r.target_type = f.target_type and r.target_id = f.target_id
                 and r.created_at >= f.created_at) as decided_at
      from audit_records f where f.event = 'CONTENT_FLAGGED' and f.created_at < ${asOf}`;
    const blocked = await tx`select created_at as at from audit_records where event = 'CONTENT_BLOCKED' and created_at < ${asOf}`;
    const [waiting] = await tx`
      select count(*)::int as count, min(moderated_at) as oldest_at from (
        select moderated_at from assets where moderation_status = 'FLAGGED'
        union all select moderated_at from profile_images where moderation_status = 'FLAGGED') q`;

    return {
      orders: orders.map((r) => ({
        customer: r.customer,
        at: r.at,
        totalPence: r.total_pence,
        commissionPence: r.partner_commission_pence,
        code: r.code,
        partnerType: r.partner_type,
        partnerName: r.partner_name,
        isReferral: r.is_referral,
        giftLink: r.gift_link,
        linkOwner: r.link_owner,
        joined: r.joined,
        items: r.items,
        parcelSavingPence: r.parcel_saving_pence,
        familySetSavingPence: r.family_set_saving_pence,
        bundle: r.bundle,
      })),
      codes: codes.map((r) => ({ code: r.code, partnerType: r.partner_type, partnerName: r.partner_name })),
      giftLinks: giftLinks.map((r) => ({ at: r.at, purchasedAt: r.purchased_at })),
      joins: joins.map((r) => ({ at: r.at, owner: r.owner })),
      flags: flags.map((r) => ({ at: r.at, decidedAt: r.decided_at, viaLink: r.via_link })),
      blocked: blocked.map((r) => r.at),
      waitingNow: { count: waiting.count, oldestAt: waiting.oldest_at },
      now: new Date(),
    };
  });
  console.log(renderReport(data, windows, spend));
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
