# The Monday numbers (GTM C14)

One read-only report for the weekly GTM review: which channels earn **first orders** and
**relatives** (gift-link purchases + family joins), what each first order costs, and whether the
gift loop, repeat orders and content review are healthy.

```bash
npm run metrics -- --from 2026-11-16 --to 2026-11-22 --spend spend.csv
```

Or directly: `node --env-file=.env scripts/gtm-metrics.mjs --from … --to … [--spend spend.csv]`.
No dates = the last full Monday–Sunday week. Dates are London calendar days, both ends included.
On the live box, run it wherever `DATABASE_URL` points at the live database (same as
`scripts/promo-codes.mjs`).

## The spend file

Plain `channel,amount` in pounds, one line per channel (a header row is fine; repeats add up;
save from a spreadsheet as CSV):

```
channel,amount
SARAHMAKES,40
St Mary's PTA,0
DRAWIT,85.50
```

The channel is a **code** (creator, campaign, leaflet `DRAWIT`, founding-families …), a **PTA's
school name** (or any of its class codes — they roll up), or `direct` / `gift link`. Spend that
matches nothing still shows as its own row, so money with no orders is never hidden.

## What it prints

**Channels (the week).** Orders, first orders, revenue ex-VAT, AOV ex-VAT, partner commission owed
(`orders.partner_commission_pence`), relatives, and with `--spend`: cost per first order =
(spend + commission) ÷ first orders, flagged `over £15` or `no 1st orders`.

- The channel is the code on the order; else the gift link; else `direct`. A code wins over a gift
  link (it is what the partner is paid on).
- Personal referral codes roll up to one `referral codes` row — each belongs to a parent.
- A first order is the customer's first paid order ever (guest + signed-in orders with the same
  email are one customer).
- Relatives are credited to the channel the family's owner first bought through.

**Last 4 weeks.** The same headline numbers per week, plus:

- **Gift links**: made, per first order, % bought from (so far), and % of gift-link buyers who
  joined that family.
- **Repeat**: of the customers whose first order was that week, % with a 2nd order within 90 days.
  `*` = still inside its 90 days, can rise. The footer gives the settled rate over every customer
  90+ days in.
- **Moderation**: items flagged for review, median and max time from flag to the reviewer's
  decision, reports made via a gift link, and blocked uploads (known-image hash). The footer gives
  how many are waiting right now and how long the oldest has waited.
- **Multi-buy**: % of orders with 2+ items, % using the same-parcel saving and the family set
  saving, and christmas bundles (an order with both placemats and coasters — only sold as the
  bundle). `n/a` = that column doesn't exist in this database yet.

## Reading it on Monday

The plan: keep channels that earn first orders and relatives; **cut a channel whose cost per first
order is still over about £15 after 3 weeks**. The report flags any week over £15; the 3-week call
is yours. Look at the trend before cutting: a PTA or leaflet often pays back in relatives
(gift links, joins) rather than in first orders.

## Safety

- **Read-only.** Every query runs inside a `READ ONLY` transaction, so the database refuses any
  write. No migrations.
- **No personal data in the output.** Only counts, sums, rates and durations: no names, emails,
  addresses, order refs, asset ids or anything about a child. Customers are told apart by an md5
  of their email made inside the query, and it is never printed. Fine to paste into a doc.
- The maths is in `scripts/lib/gtm-metrics.mjs` (pure, no I/O) with unit tests in
  `src/lib/__tests__/gtmMetrics.test.ts`.
