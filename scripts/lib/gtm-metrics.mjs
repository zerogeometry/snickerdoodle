// The Monday GTM review's maths (C14) — PURE: no I/O, no clock, no database. scripts/gtm-metrics.mjs
// fetches aggregate-ready rows (read-only) and hands them here; src/lib/__tests__/gtmMetrics.test.ts
// pins the sums on synthetic rows.
//
// Privacy: the rows carry no names, emails, addresses or asset ids. A customer is an opaque hash
// (md5 of the lower-cased email, made in SQL) used only to tell first orders from repeats; it is
// never printed. Everything rendered is a count, a sum, a rate or a duration.

export const VAT_RATE = 0.2; // every line is standard-rated (src/pricing/promo.ts PROMO_ECONOMICS)
export const CUT_LINE_PENCE = 1500; // the GTM plan: cut a channel whose cost per first order is over ~£15 after 3 weeks
export const REPEAT_WINDOW_DAYS = 90;
const DAY = 86_400_000;

/**
 * @typedef {{ customer: string, at: Date, totalPence: number, commissionPence: number,
 *   code: string | null, partnerType: string | null, partnerName: string | null, isReferral: boolean,
 *   giftLink: boolean, linkOwner: string | null, joined: boolean, items: number,
 *   parcelSavingPence: number | null, familySetSavingPence: number | null, bundle: boolean | null }} OrderRow
 * @typedef {{ at: Date, purchasedAt: Date | null }} GiftLinkRow
 * @typedef {{ at: Date, owner: string | null }} JoinRow
 * @typedef {{ at: Date, decidedAt: Date | null, viaLink: boolean }} FlagRow
 * @typedef {{ start: Date, end: Date, from: string, to: string }} Window  end is exclusive
 * @typedef {{ key: string, label: string, aliases: string[] }} Channel
 * @typedef {{ code: string, partnerType: string | null, partnerName: string | null }} CodeRow
 */

// ── dates (Europe/London calendar days) ──────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** UTC instant of 00:00 on this London calendar day (GMT or BST). */
export function londonMidnight(ymd) {
  if (!YMD.test(ymd) || Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) throw new Error(`not a date: ${ymd} (want YYYY-MM-DD)`);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const name = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d+)?/.exec(name);
  const offsetH = m && m[1] ? Number(m[1]) : 0;
  return new Date(guess.getTime() - offsetH * 3_600_000);
}

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The last full Monday–Sunday week before `today` (YYYY-MM-DD). */
export function lastFullWeek(today) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const thisMonday = addDays(today, -((dow + 6) % 7));
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

/** `count` back-to-back windows the length of from..to (inclusive days), the last one being from..to. Oldest first. */
export function trendWindows(from, to, count = 4) {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  if (!(days >= 1)) throw new Error('--from must be on or before --to');
  /** @type {Window[]} */
  const out = [];
  for (let k = count - 1; k >= 0; k--) {
    const f = addDays(from, -k * days);
    const t = addDays(to, -k * days);
    out.push({ from: f, to: t, start: londonMidnight(f), end: londonMidnight(addDays(t, 1)) });
  }
  return out;
}

const inWin = (at, w) => at >= w.start && at < w.end;

// ── arguments + the spend file ───────────────────────────────────────────────

/** --from / --to (London dates, inclusive; default the last full Mon–Sun week) and --spend file. */
export function parseArgs(argv, today) {
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
    return v;
  };
  const def = lastFullWeek(today);
  const from = opt('from') ?? def.from;
  const to = opt('to') ?? def.to;
  londonMidnight(from);
  londonMidnight(to);
  if (from > to) throw new Error('--from must be on or before --to');
  return { from, to, spendPath: opt('spend') ?? null };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** One CSV line's fields ("quoted, with commas" and "" escapes, as a spreadsheet saves them). */
function csvFields(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "channel,amount" lines (a header row is fine; amount in pounds, "£" optional). Repeated channels add up. */
export function parseSpendCsv(text) {
  /** @type {Map<string, { channel: string, pence: number }>} */
  const byChannel = new Map();
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const fields = csvFields(line);
    if (fields.length < 2) throw new Error(`spend line ${i + 1}: want "channel,amount"`);
    const channel = fields[0].trim();
    const amount = fields[1].replace(/[£,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      if (i === 0 || byChannel.size === 0) return; // a header row
      throw new Error(`spend line ${i + 1}: "${amount}" isn't an amount in pounds`);
    }
    if (!channel) throw new Error(`spend line ${i + 1}: no channel`);
    const key = norm(channel);
    const prev = byChannel.get(key);
    byChannel.set(key, { channel: prev?.channel ?? channel, pence: (prev?.pence ?? 0) + Math.round(Number(amount) * 100) });
  });
  return [...byChannel.values()];
}

// ── channels ─────────────────────────────────────────────────────────────────

/**
 * Which channel earned this order. A code is the attribution (it is what the partner is paid on),
 * so it wins over the gift link; PTA class codes roll up to their school; personal referral codes
 * roll up to one "referral" channel (each one belongs to a parent — never broken out).
 * @param {OrderRow} o @returns {Channel}
 */
export function channelOf(o) {
  if (o.code) {
    if (o.isReferral || o.partnerType === 'REFERRAL') return { key: 'referral', label: 'referral codes', aliases: ['referral'] };
    if (o.partnerType === 'PTA') {
      const school = o.partnerName || o.code;
      return { key: `pta:${norm(school)}`, label: `pta · ${school}`, aliases: [school, o.code] };
    }
    if (o.partnerType === 'INFLUENCER') return { key: `creator:${o.code}`, label: `creator · ${o.code}`, aliases: [o.code] };
    if (o.partnerType === 'CAMPAIGN') return { key: `campaign:${o.code}`, label: `campaign · ${o.code}`, aliases: [o.code] };
    return { key: `code:${o.code}`, label: `code · ${o.code}`, aliases: [o.code] };
  }
  if (o.giftLink) return { key: 'gift-link', label: 'gift link', aliases: ['gift link', 'giftlink'] };
  return DIRECT;
}

/** @type {Channel} */
const DIRECT = { key: 'direct', label: 'direct', aliases: ['direct'] };

// ── customers ────────────────────────────────────────────────────────────────

/** Each customer's paid orders, oldest first. */
function ordersByCustomer(orders) {
  /** @type {Map<string, OrderRow[]>} */
  const by = new Map();
  for (const o of orders) by.set(o.customer, [...(by.get(o.customer) ?? []), o]);
  for (const list of by.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
  return by;
}

/** The set of orders that were their customer's FIRST paid order (ever, in the rows given). */
export function firstOrders(orders) {
  const first = new Set();
  for (const list of ordersByCustomer(orders).values()) first.add(list[0]);
  return first;
}

/** customer → the channel of their first order (how they came to us). */
function acquiredVia(orders) {
  const m = new Map();
  for (const [customer, list] of ordersByCustomer(orders)) m.set(customer, channelOf(list[0]));
  return m;
}

export const exVat = (pence) => Math.round(pence / (1 + VAT_RATE));

// ── the channel table ────────────────────────────────────────────────────────

/**
 * One row per channel for the window. "relatives" = what the channel's customers brought in this
 * window: purchases through their gift links + relatives who joined their family (the GTM plan keeps
 * channels that earn first orders AND relatives). Spend rows match a channel by its label, code or
 * school (case/punctuation-blind); spend that matches nothing is still shown (money with no orders).
 * @param {{ orders: OrderRow[], joins: JoinRow[], codes?: CodeRow[] }} data  codes = the shop's non-personal codes
 * @param {Window} w
 * @param {{ channel: string, pence: number }[] | null} spend
 */
export function channelRows(data, w, spend) {
  const first = firstOrders(data.orders);
  const via = acquiredVia(data.orders);
  /** @type {Map<string, any>} */
  const rows = new Map();
  const row = (ch) => {
    if (!rows.has(ch.key)) rows.set(ch.key, { key: ch.key, label: ch.label, aliases: new Set(), orders: 0, first: 0, revenuePence: 0, commissionPence: 0, relatives: 0, spendPence: null });
    const r = rows.get(ch.key);
    for (const a of ch.aliases.concat(ch.label)) r.aliases.add(norm(a));
    return r;
  };
  for (const o of data.orders) {
    if (!inWin(o.at, w)) continue;
    const r = row(channelOf(o));
    r.orders++;
    if (first.has(o)) r.first++;
    r.revenuePence += exVat(o.totalPence);
    r.commissionPence += o.commissionPence;
    if (o.giftLink) row(via.get(o.linkOwner) ?? DIRECT).relatives++;
  }
  for (const j of data.joins) {
    if (inWin(j.at, w)) row(via.get(j.owner) ?? DIRECT).relatives++;
  }
  if (spend) {
    for (const s of spend) {
      const k = norm(s.channel);
      // a code that sold nothing this week still gets its proper channel (from the codes list)
      const code = (data.codes ?? []).find((c) => norm(c.code) === k || (c.partnerType === 'PTA' && c.partnerName && norm(c.partnerName) === k));
      const r = [...rows.values()].find((x) => x.aliases.has(k)) ?? row(code ? channelOf({ ...code, isReferral: false, giftLink: false }) : { key: `spend:${k}`, label: s.channel, aliases: [s.channel] });
      r.spendPence = (r.spendPence ?? 0) + s.pence;
    }
  }
  const out = [...rows.values()].map(({ aliases: _a, ...r }) => {
    const costPence = spend ? (r.spendPence ?? 0) + r.commissionPence : null;
    const costPerFirstPence = costPence === null || r.first === 0 ? null : Math.round(costPence / r.first);
    const flag = costPence === null ? '' : r.first === 0 && costPence > 0 ? 'no 1st orders' : costPerFirstPence !== null && costPerFirstPence > CUT_LINE_PENCE ? 'over £15' : '';
    return { ...r, aovPence: r.orders ? Math.round(r.revenuePence / r.orders) : null, costPence, costPerFirstPence, flag };
  });
  out.sort((a, b) => b.first - a.first || b.orders - a.orders || (b.spendPence ?? 0) - (a.spendPence ?? 0) || a.label.localeCompare(b.label));
  return out;
}

/** The channel rows' total line. */
export function channelTotal(rows, withSpend) {
  const t = rows.reduce(
    (n, r) => ({ orders: n.orders + r.orders, first: n.first + r.first, revenuePence: n.revenuePence + r.revenuePence, commissionPence: n.commissionPence + r.commissionPence, relatives: n.relatives + r.relatives, spendPence: n.spendPence + (r.spendPence ?? 0) }),
    { orders: 0, first: 0, revenuePence: 0, commissionPence: 0, relatives: 0, spendPence: 0 },
  );
  const costPence = withSpend ? t.spendPence + t.commissionPence : null;
  return {
    label: 'total',
    ...t,
    spendPence: withSpend ? t.spendPence : null,
    aovPence: t.orders ? Math.round(t.revenuePence / t.orders) : null,
    costPence,
    costPerFirstPence: costPence === null || t.first === 0 ? null : Math.round(costPence / t.first),
    flag: '',
  };
}

// ── the rest of the week ─────────────────────────────────────────────────────

const ratio = (num, den) => (den > 0 ? num / den : null);

function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Repeat rate: of the customers whose FIRST order fell in the window, the share with a 2nd paid
 * order within 90 days of it (counting orders up to `asOf`). `maturing` = the 90 days haven't all
 * passed yet for this cohort, so the rate can still rise.
 */
export function repeatRate(orders, w, asOf) {
  let cohort = 0;
  let repeated = 0;
  for (const list of ordersByCustomer(orders).values()) {
    const f = list[0];
    if (!inWin(f.at, w)) continue;
    cohort++;
    const second = list[1];
    if (second && second.at < asOf && second.at.getTime() - f.at.getTime() <= REPEAT_WINDOW_DAYS * DAY) repeated++;
  }
  return { cohort, repeated, rate: ratio(repeated, cohort), maturing: w.end.getTime() + REPEAT_WINDOW_DAYS * DAY > asOf.getTime() };
}

/** All customers whose first order is at least 90 days before `asOf`: the settled repeat rate. */
export function settledRepeatRate(orders, asOf) {
  let cohort = 0;
  let repeated = 0;
  for (const list of ordersByCustomer(orders).values()) {
    const f = list[0];
    if (f.at.getTime() + REPEAT_WINDOW_DAYS * DAY > asOf.getTime()) continue;
    cohort++;
    const second = list[1];
    if (second && second.at.getTime() - f.at.getTime() <= REPEAT_WINDOW_DAYS * DAY) repeated++;
  }
  return { cohort, repeated, rate: ratio(repeated, cohort) };
}

/**
 * Everything but the channel split, for one window.
 * @param {{ orders: OrderRow[], giftLinks: GiftLinkRow[], joins: JoinRow[], flags: FlagRow[], blocked: Date[] }} data
 * @param {Window} w @param {Date} asOf
 */
export function weekSummary(data, w, asOf) {
  const first = firstOrders(data.orders);
  const week = data.orders.filter((o) => inWin(o.at, w));
  const firstCount = week.filter((o) => first.has(o)).length;
  const revenuePence = week.reduce((n, o) => n + exVat(o.totalPence), 0);

  const links = data.giftLinks.filter((g) => inWin(g.at, w));
  const linksBought = links.filter((g) => g.purchasedAt && g.purchasedAt < asOf).length;
  const giftBuyers = new Map(); // customer → joined?
  for (const o of week) if (o.giftLink) giftBuyers.set(o.customer, giftBuyers.get(o.customer) || o.joined);
  const joinedBuyers = [...giftBuyers.values()].filter(Boolean).length;

  const flags = data.flags.filter((f) => inWin(f.at, w) && !f.viaLink);
  const waits = flags.filter((f) => f.decidedAt && f.decidedAt < asOf).map((f) => f.decidedAt.getTime() - f.at.getTime());

  // a column another session hasn't added yet comes back null on every row → undefined ("n/a");
  // a week with no orders is null ("—")
  const known = (k) => week.filter((o) => o[k] !== null && o[k] !== undefined);
  const share = (rows, hit) => (rows.length ? ratio(rows.filter(hit).length, rows.length) : week.length ? undefined : null);
  const parcelKnown = known('parcelSavingPence');
  const setKnown = known('familySetSavingPence');
  const bundleKnown = known('bundle');

  return {
    orders: week.length,
    firstOrders: firstCount,
    revenuePence,
    aovPence: week.length ? Math.round(revenuePence / week.length) : null,
    commissionPence: week.reduce((n, o) => n + o.commissionPence, 0),
    giftLinksMade: links.length,
    giftLinksPerFirst: ratio(links.length, firstCount),
    giftLinkBoughtRate: ratio(linksBought, links.length),
    giftLinkOrders: week.filter((o) => o.giftLink).length,
    giftBuyers: giftBuyers.size,
    giftBuyersJoinedRate: ratio(joinedBuyers, giftBuyers.size),
    familyJoins: data.joins.filter((j) => inWin(j.at, w)).length,
    repeat: repeatRate(data.orders, w, asOf),
    flagged: flags.length,
    flaggedDecided: waits.length,
    flagMedianMs: median(waits),
    flagMaxMs: waits.length ? Math.max(...waits) : null,
    giftLinkReports: data.flags.filter((f) => inWin(f.at, w) && f.viaLink).length,
    blocked: data.blocked.filter((at) => inWin(at, w)).length,
    multiItemRate: ratio(week.filter((o) => o.items >= 2).length, week.length),
    parcelSavingRate: share(parcelKnown, (o) => o.parcelSavingPence > 0),
    familySetRate: share(setKnown, (o) => o.familySetSavingPence > 0),
    bundles: bundleKnown.length ? bundleKnown.filter((o) => o.bundle).length : week.length ? undefined : 0,
  };
}

// ── formatting ───────────────────────────────────────────────────────────────

export const gbp = (p) => (p === null || p === undefined ? '—' : `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const pct = (r) => (r === null ? '—' : r === undefined ? 'n/a' : `${Math.round(r * 100)}%`);
const num = (n) => (n === null ? '—' : n === undefined ? 'n/a' : String(n));
const ratioTxt = (r) => (r === null ? '—' : r.toFixed(2));

/** "45m", "3.5h", "2d 4h". */
export function duration(ms) {
  if (ms === null || ms === undefined) return '—';
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.round(h - d * 24)}h`;
}

/** A plain aligned text table: first column left, the rest right. */
export function renderTable(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
  const line = (r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd();
  const rule = widths.map((n) => '─'.repeat(n)).join('  ');
  return [line(all[0]), rule, ...all.slice(1).map(line)].join('\n');
}

const shortDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The whole Monday report as text.
 * @param {{ orders: OrderRow[], giftLinks: GiftLinkRow[], joins: JoinRow[], flags: FlagRow[], blocked: Date[],
 *   waitingNow: { count: number, oldestAt: Date | null }, now: Date }} data
 * @param {Window[]} windows oldest first; the last is the report week
 * @param {{ channel: string, pence: number }[] | null} spend
 */
export function renderReport(data, windows, spend) {
  const w = windows[windows.length - 1];
  const asOf = w.end;
  const out = [];
  out.push(`snickerdoodle · gtm week ${shortDay(w.from)} → ${shortDay(w.to)} ${w.to.slice(0, 4)}  (London days; paid orders only; revenue ex-VAT)`);
  out.push('');

  const rows = channelRows(data, w, spend);
  const withSpend = !!spend;
  const head = ['channel', 'orders', '1st', 'revenue', 'AOV', 'commission', 'relatives', ...(withSpend ? ['spend', 'cost/1st', 'flag'] : [])];
  const cells = (r) => [r.label, r.orders, r.first, gbp(r.revenuePence), gbp(r.aovPence), gbp(r.commissionPence), r.relatives, ...(withSpend ? [gbp(r.spendPence ?? 0), gbp(r.costPerFirstPence), r.flag] : [])];
  out.push(rows.length ? renderTable(head, [...rows.map(cells), cells(channelTotal(rows, withSpend))]) : '(no paid orders this week)');
  out.push(withSpend ? 'cost/1st = (spend + commission owed) ÷ first orders. the plan: cut a channel still over £15 after 3 weeks.' : 'add --spend spend.csv (channel,amount) for cost per first order.');
  out.push('relatives = gift-link purchases + family joins this week, credited to the channel the family first came from.');
  out.push('');

  const s = windows.map((x) => weekSummary(data, x, asOf));
  const trend = [
    ['orders', (x) => num(x.orders)],
    ['first orders', (x) => num(x.firstOrders)],
    ['revenue ex-VAT', (x) => gbp(x.revenuePence)],
    ['AOV ex-VAT', (x) => gbp(x.aovPence)],
    ['partner commission', (x) => gbp(x.commissionPence)],
    ['gift links made', (x) => num(x.giftLinksMade)],
    ['  per first order', (x) => ratioTxt(x.giftLinksPerFirst)],
    ['  bought from (so far)', (x) => pct(x.giftLinkBoughtRate)],
    ['gift-link orders', (x) => num(x.giftLinkOrders)],
    ['  buyers who joined the family', (x) => pct(x.giftBuyersJoinedRate)],
    ['family joins', (x) => num(x.familyJoins)],
    ['2nd order ≤90d (1st-order cohort)', (x) => (x.repeat.cohort ? `${pct(x.repeat.rate)}${x.repeat.maturing ? '*' : ''}` : '—')],
    ['flagged for review', (x) => num(x.flagged)],
    ['  flag → decision, median', (x) => duration(x.flagMedianMs)],
    ['  flag → decision, max', (x) => duration(x.flagMaxMs)],
    ['  reports via a gift link', (x) => num(x.giftLinkReports)],
    ['blocked (known-image hash)', (x) => num(x.blocked)],
    ['orders with 2+ items', (x) => pct(x.multiItemRate)],
    ['  same-parcel saving used', (x) => pct(x.parcelSavingRate)],
    ['  family set saving used', (x) => pct(x.familySetRate)],
    ['christmas bundles', (x) => num(x.bundles)],
  ];
  out.push(renderTable([`last ${windows.length} weeks`, ...windows.map((x) => `w/c ${shortDay(x.from)}`)], trend.map(([label, f]) => [label, ...s.map(f)])));
  out.push('* still inside its 90 days — can rise. "bought from" and repeat rates count orders up to the end of the report week.');
  out.push('');

  const settled = settledRepeatRate(data.orders, asOf);
  const waiting = data.waitingNow;
  const oldest = waiting.oldestAt ? duration(data.now.getTime() - waiting.oldestAt.getTime()) : '—';
  out.push(`waiting for review right now: ${waiting.count}${waiting.count ? ` (oldest ${oldest})` : ''}`);
  out.push(`2nd order within 90 days, every customer 90+ days in: ${pct(settled.rate)} (${settled.repeated} of ${settled.cohort})`);
  return out.join('\n');
}
