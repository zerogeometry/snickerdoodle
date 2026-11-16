// Discount + partner codes — create, list, switch off, and report what partners have earned.
// Values are only ever set HERE (or in the DB); the shop resolves + prices codes server-side.
//
//   node --env-file=.env scripts/promo-codes.mjs list
//   node --env-file=.env scripts/promo-codes.mjs create WELCOME10 --percent 10
//   node --env-file=.env scripts/promo-codes.mjs create TENOFF --pounds 10 --min 60
//   node --env-file=.env scripts/promo-codes.mjs create SARAHMAKES --percent 10 --commission 5 --partner "Sarah (Instagram)" --type INFLUENCER --partner-email sarah@example.com
//   node --env-file=.env scripts/promo-codes.mjs create FIRSTCARD --free-card --max 500
//   node --env-file=.env scripts/promo-codes.mjs create STMARYSPTA --percent 0 --commission 10 --partner "St Mary's PTA" --type PTA
//   PTA class codes roll up to one school: add --class "Year 2" (e.g. STMARYS-Y2, STMARYS-Y3 …)
//   options: --ends 2026-12-24 --starts 2026-11-01 --max 500 --min 15 --first-order
//   (dates are UK days: a code starts / stops at midnight as that day begins. The rules — percent 0–50, pounds
//   above £0, commission 0–30 with a partner, dates in order — live in scripts/lib/promo-codes.mjs, shared with
//   the admin app's codes screen, so the two make identical codes. The admin app refuses a code that exists; here
//   `create` on an existing code updates it and switches it back on.)
//   The codes screen: /admin/codes (create, switch off/on, commission owed per month).
//
// WHO a code is for (src/pricing/promo.ts codeTerms): creator (INFLUENCER), REFERRAL and --free-card
// codes are ALWAYS first-order-only (by account, or a guest by email); --first-order makes any other
// code so too. A partner's commission is paid on the follower's FIRST paid order only — except a PTA,
// which earns on every order. --partner-email: the creator's own email, so their code never works on
// (or earns from) their own orders.
//   node --env-file=.env scripts/promo-codes.mjs off CODE
//   node --env-file=.env scripts/promo-codes.mjs earnings        (PAID orders only; per code)
//   node --env-file=.env scripts/promo-codes.mjs partners        (rolled up per partner → class)
//
// Every order is also protected by the margin guard (src/pricing/promo.ts): a code can never
// push an order below 10% contribution, whatever values are set here.

import postgres from 'postgres';
import { buildCodeRow, describeOffer, inputFromArgs, normaliseCode } from './lib/promo-codes.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const gbp = (p) => `£${(p / 100).toFixed(2)}`;

try {
  if (cmd === 'create') {
    // the same rules as the admin app's codes screen (scripts/lib/promo-codes.mjs): the two make identical codes
    const parsed = inputFromArgs(rest);
    if (!parsed.ok) throw new Error(parsed.message);
    const built = buildCodeRow(parsed.input);
    if (!built.ok) throw new Error(built.problems.map((p) => p.message).join('; '));
    const c = built.row;
    const [row] = await sql`
      insert into promo_codes (code, kind, value, min_spend_pence, partner_name, partner_type, partner_email, commission_bps, class_label, first_order_only, starts_at, ends_at, max_redemptions)
      values (${c.code}, ${c.kind}, ${c.value}, ${c.minSpendPence}, ${c.partnerName}, ${c.partnerType}, ${c.partnerEmail}, ${c.commissionBps}, ${c.classLabel}, ${c.firstOrderOnly},
              ${c.startsAt}, ${c.endsAt}, ${c.maxRedemptions})
      on conflict (code) do update set kind = excluded.kind, value = excluded.value, min_spend_pence = excluded.min_spend_pence,
        partner_name = excluded.partner_name, partner_type = excluded.partner_type, partner_email = excluded.partner_email, commission_bps = excluded.commission_bps,
        class_label = excluded.class_label, first_order_only = excluded.first_order_only,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, max_redemptions = excluded.max_redemptions, active = true
      returning code`;
    console.log(`✓ ${row.code} saved`);
  } else if (cmd === 'off') {
    await sql`update promo_codes set active = false where code = ${normaliseCode(rest[0])}`;
    console.log('✓ switched off');
  } else if (cmd === 'partners') {
    // One row per partner (school / creator) and per class, with a partner subtotal — the PTA pack.
    const rows = await sql`
      select coalesce(c.partner_name, '—') as partner, coalesce(c.class_label, '') as class,
             count(o.id)::int as orders, coalesce(sum(o.total_pence), 0)::int as sales,
             coalesce(sum(o.partner_commission_pence), 0)::int as owed
      from promo_codes c left join orders o on o.promo_code_id = c.id and o.status in ('PAID','FULFILLING','SHIPPED')
      where c.partner_type in ('PTA', 'INFLUENCER', 'CAMPAIGN')
      group by rollup (coalesce(c.partner_name, '—'), coalesce(c.class_label, ''))
      having grouping(coalesce(c.partner_name, '—')) = 0
      order by 1, (coalesce(c.class_label, '') = '') desc, 2`;
    console.table(rows.map((r) => ({ partner: r.partner, class: r.class === null ? '— total —' : r.class || '(school-wide)', paidOrders: r.orders, sales: gbp(r.sales), owed: gbp(r.owed) })));
  } else if (cmd === 'earnings') {
    const rows = await sql`
      select c.code, c.partner_name, c.partner_type, count(o.id)::int as orders,
             coalesce(sum(o.total_pence), 0)::int as sales, coalesce(sum(o.promo_saving_pence), 0)::int as discounts,
             coalesce(sum(o.partner_commission_pence), 0)::int as owed,
             count(o.id) filter (where o.partner_commission_pence > 0)::int as earning
      from promo_codes c left join orders o on o.promo_code_id = c.id and o.status in ('PAID','FULFILLING','SHIPPED')
      group by c.id order by owed desc, c.code`;
    // (commission is settled when an order is paid: only a follower's first paid order earns — a PTA every order)
    console.table(rows.map((r) => ({ code: r.code, partner: r.partner_name ?? '—', type: r.partner_type ?? '—', paidOrders: r.orders, earningOrders: r.earning, sales: gbp(r.sales), discountsGiven: gbp(r.discounts), partnerOwed: gbp(r.owed) })));
  } else {
    const rows = await sql`select code, kind, value, min_spend_pence, commission_bps, partner_name, partner_type, first_order_only, class_label, ends_at, max_redemptions, active from promo_codes where owner_account_id is null order by created_at`;
    console.table(rows.map((r) => ({
      code: r.code,
      offer: describeOffer(r),
      firstOrder: r.first_order_only || r.kind === 'FREE_CARD' || ['INFLUENCER', 'REFERRAL'].includes(r.partner_type) ? 'yes' : '—',
      minSpend: r.min_spend_pence ? gbp(r.min_spend_pence) : '—',
      partner: r.partner_name ? `${r.partner_name}${r.class_label ? ` (${r.class_label})` : ''} · ${r.commission_bps / 100}%` : '—',
      ends: r.ends_at ? r.ends_at.toISOString().slice(0, 10) : '—',
      max: r.max_redemptions ?? '∞',
      active: r.active,
    })));
  }
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
