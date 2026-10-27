// Prints the "founding families" waitlist as CSV, for the founder to email (P0 L · PECR):
// ONLY addresses that confirmed the double opt-in AND whose latest marketing consent is still
// GRANTED (anyone who unsubscribed is left out). Each row carries that person's one-tap
// unsubscribe link — put it in every email you send them.
//
//   DATABASE_URL=… APP_URL=https://snickerdoodle.co.uk node scripts/waitlist-export.mjs > waitlist.csv
//
// The CSV is personal data: keep it off shared drives, give it only to the (DPA'd) email
// provider, and delete it once the send is done. Re-export before every send so new
// unsubscribes are always respected.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const base = (process.env.APP_URL || 'https://snickerdoodle.co.uk').replace(/\/+$/, '');

const csv = (v) => {
  const s = v == null ? '' : String(v);
  // quote everything; neutralise spreadsheet formula injection
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql`
    select w.email, w.confirmed_at, w.unsubscribe_token
    from waitlist_signups w
    join lateral (
      select c.status from consent_records c
      where c.waitlist_signup_id = w.id and c.channel = 'EMAIL' and c.purpose = 'MARKETING'
      order by c.created_at desc limit 1
    ) latest on true
    where w.confirmed_at is not null and w.unsubscribed_at is null and latest.status = 'GRANTED'
    order by w.confirmed_at asc`;
  process.stdout.write('email,confirmed_at,unsubscribe_url\n');
  for (const r of rows) {
    const unsub = `${base}/api/waitlist/unsubscribe?t=${r.unsubscribe_token}`;
    process.stdout.write(`${[r.email, new Date(r.confirmed_at).toISOString(), unsub].map(csv).join(',')}\n`);
  }
  console.error(`${rows.length} confirmed, still-consented address${rows.length === 1 ? '' : 'es'}`);
} finally {
  await sql.end();
}
