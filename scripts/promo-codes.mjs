// Discount + partner codes — create, list, switch off, and report what partners have earned.
// Values are only ever set HERE (or in the DB); the shop resolves + prices codes server-side.
//
//   node --env-file=.env scripts/promo-codes.mjs list
//   node --env-file=.env scripts/promo-codes.mjs create WELCOME10 --percent 10
//   node --env-file=.env scripts/promo-codes.mjs create TENOFF --pounds 10 --min 60
//   node --env-file=.env scripts/promo-codes.mjs create SARAHMAKES --percent 10 --commission 5 --partner "Sarah (Instagram)" --type INFLUENCER
//   node --env-file=.env scripts/promo-codes.mjs create STMARYSPTA --percent 0 --commission 10 --partner "St Mary's PTA" --type PTA
//   PTA class codes roll up to one school: add --class "Year 2" (e.g. STMARYS-Y2, STMARYS-Y3 …)
//   options: --ends 2026-12-24 --starts 2026-11-01 --max 500
//   node --env-file=.env scripts/promo-codes.mjs off CODE
//   node --env-file=.env scripts/promo-codes.mjs earnings        (PAID orders only; per code)
//   node --env-file=.env scripts/promo-codes.mjs partners        (rolled up per partner → class)
//
// Every order is also protected by the margin guard (src/pricing/promo.ts): a code can never
// push an order below 10% contribution, whatever values are set here.

import postgres from 'postgres';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const gbp = (p) => `£${(p / 100).toFixed(2)}`;

try {
  if (cmd === 'create') {
    const code = String(rest[0] ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{3,32}$/.test(code)) throw new Error('code must be 3–32 letters/digits/dashes');
    const percent = opt('percent'), pounds = opt('pounds');
    if ((percent === undefined) === (pounds === undefined)) throw new Error('give exactly one of --percent N or --pounds N');
    const kind = percent !== undefined ? 'PERCENT' : 'FIXED';
    const value = percent !== undefined ? Math.round(Number(percent) * 100) : Math.round(Number(pounds) * 100);
    const minSpend = Math.round(Number(opt('min') ?? 0) * 100);
    const commission = Math.round(Number(opt('commission') ?? 0) * 100);
    if (!(value >= 0) || (kind === 'PERCENT' && value > 5000)) throw new Error('percent must be 0–50');
    if (!(commission >= 0 && commission <= 3000)) throw new Error('commission must be 0–30 (%)');
    const [row] = await sql`
      insert into promo_codes (code, kind, value, min_spend_pence, partner_name, partner_type, commission_bps, class_label, starts_at, ends_at, max_redemptions)
      values (${code}, ${kind}, ${value}, ${minSpend}, ${opt('partner') ?? null}, ${opt('type') ?? null}, ${commission}, ${opt('class') ?? null},
              ${opt('starts') ? new Date(opt('starts')) : null}, ${opt('ends') ? new Date(opt('ends')) : null}, ${opt('max') ? Number(opt('max')) : null})
      on conflict (code) do update set kind = excluded.kind, value = excluded.value, min_spend_pence = excluded.min_spend_pence,
        partner_name = excluded.partner_name, partner_type = excluded.partner_type, commission_bps = excluded.commission_bps, class_label = excluded.class_label,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, max_redemptions = excluded.max_redemptions, active = true
      returning code`;
    console.log(`✓ ${row.code} saved`);
  } else if (cmd === 'off') {
    await sql`update promo_codes set active = false where code = ${String(rest[0] ?? '').toUpperCase()}`;
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
             coalesce(sum(o.partner_commission_pence), 0)::int as owed
      from promo_codes c left join orders o on o.promo_code_id = c.id and o.status in ('PAID','FULFILLING','SHIPPED')
      group by c.id order by owed desc, c.code`;
    console.table(rows.map((r) => ({ code: r.code, partner: r.partner_name ?? '—', type: r.partner_type ?? '—', paidOrders: r.orders, sales: gbp(r.sales), discountsGiven: gbp(r.discounts), partnerOwed: gbp(r.owed) })));
  } else {
    const rows = await sql`select code, kind, value, min_spend_pence, commission_bps, partner_name, class_label, ends_at, max_redemptions, active from promo_codes where owner_account_id is null order by created_at`;
    console.table(rows.map((r) => ({
      code: r.code,
      offer: r.kind === 'PERCENT' ? (r.value ? `${r.value / 100}% off` : 'no discount') : `${gbp(r.value)} off`,
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
