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
// The maths lives in scripts/lib/gtm-metrics.mjs (unit-tested); the queries in scripts/lib/gtm-metrics-data.mjs,
// shared with the admin app's "this week" screen (src/server/admin/week.ts) so both show the same numbers.

import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { parseArgs, parseSpendCsv, renderReport, trendWindows } from './lib/gtm-metrics.mjs';
import { loadGtmData } from './lib/gtm-metrics-data.mjs';

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
  const data = await sql.begin('read only', (tx) => loadGtmData(tx, asOf));
  console.log(renderReport({ ...data, now: new Date() }, windows, spend));
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
