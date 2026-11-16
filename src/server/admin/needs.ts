/**
 * THE "NEEDS YOU" LIST (the admin app's Today screen, project-office/briefs/ADMIN-APP-plan.md): everything a person
 * has to deal with, most urgent first, each with what's wrong, how long it has waited, any deadline, and where to go.
 *
 * Pure: the facts are gathered from the database elsewhere (./today.ts), so the rules here are unit-tested on their
 * own. References only (order refs, message refs, counts): no names, emails, addresses or anything about a child.
 */

export type NeedKind =
  | 'dispute'
  | 'report'
  | 'site'
  | 'order'
  | 'refund-at-prodigi'
  | 'rights'
  | 'review'
  | 'support'
  | 'prodigi'
  | 'commission';

export interface Need {
  /** Names the problem; "done" and the once-only email are keyed on it. */
  key: string;
  kind: NeedKind;
  title: string;
  detail: string;
  /** When it started (for "waiting 3h"). */
  since: Date;
  /** A deadline, when there is one. */
  due: Date | null;
  href: string;
  action: string;
  /** Emailed to the team straight away (once). */
  urgent: boolean;
  /** "Done" can clear it (otherwise it clears itself when the problem goes: a queue emptied, a check passing). */
  dismissable: boolean;
}

export interface NeedFacts {
  disputes: { ref: string; disputeId: string; status: string; reason: string | null; amountPence: number; dueBy: Date | null; openedAt: Date }[];
  orders: {
    ref: string;
    status: string;
    paidAt: Date | null;
    claimedAt: Date | null;
    createdAt: Date;
    prodigiOrderId: string | null;
    submitError: string | null;
    totalPence: number;
    refundedPence: number;
    refundedAt: Date | null;
    /** lines by fulfilment state, only the troubled ones: RENDER_FAILED, ERROR, BLOCKED_GATE */
    troubled: { state: string; count: number }[];
    /** nothing on it is the printer's (gift wrap only): the founder packs it by hand */
    handOnly: boolean;
  }[];
  review: { waiting: number; oldestAt: Date | null; reported: number; reportedOldestAt: Date | null };
  rights: { id: string; type: string; status: string; receivedAt: Date; dueAt: Date | null }[];
  support: { id: string; ref: string; topic: string; receivedAt: Date; orderRef: string | null }[];
  status: { key: string; ok: boolean; problems: string[]; checkedAt: Date }[];
  /** Partner commission earned last month (shown in the first days of a month, until "done"). */
  commission: { month: string; pence: number; partners: number } | null;
  /** keys a person marked done */
  handled: Set<string>;
}

/** The limits (founder, 16 Nov 2026): paid but not at Prodigi after 2 hours; at Prodigi with no shipping after 5 working days. */
export const LIMITS = { notSentHours: 2, slowWorkingDays: 5, rightsSoonDays: 7, recentDays: 30 } as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Whole working days (Mon–Fri) from `from` to `to`. Bank holidays aren't counted out: a day early is the safe side. */
export function workingDaysBetween(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

export const pounds = (p: number) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "3h", "2 days", "just now". */
export function waited(since: Date, now: Date): string {
  const ms = now.getTime() - since.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < HOUR) return `${Math.round(ms / 60_000)} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)} days`;
}

const STRIPE = 'https://dashboard.stripe.com';
const RANK: Record<NeedKind, number> = { dispute: 1, report: 2, site: 3, order: 4, 'refund-at-prodigi': 5, rights: 6, review: 7, support: 8, prodigi: 9, commission: 10 };
const TOPIC: Record<string, string> = { 'order-where': 'where’s my order', 'order-change': 'change or cancel', 'order-problem': 'order not right', making: 'help making something', gifts: 'gifts and family', account: 'account or signing in' };

/** The list, most urgent first (a deadline that's close jumps its group). */
export function buildNeeds(f: NeedFacts, now: Date): Need[] {
  const out: Need[] = [];

  // ── chargebacks: answered in Stripe, before its deadline ──
  for (const d of f.disputes) {
    if (!['needs_response', 'warning_needs_response'].includes(d.status)) continue;
    out.push({
      key: `dispute:${d.disputeId}`,
      kind: 'dispute',
      title: `Chargeback on ${d.ref}: ${pounds(d.amountPence)}`,
      detail: `${d.reason ? `The bank says: ${d.reason.replace(/_/g, ' ')}. ` : ''}Answer in Stripe with the order details and tracking${d.dueBy ? ` by ${d.dueBy.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}, or the money goes back automatically.`,
      since: d.openedAt,
      due: d.dueBy,
      href: `${STRIPE}/disputes/${d.disputeId}`,
      action: 'answer in Stripe',
      urgent: true,
      dismissable: false,
    });
  }

  // ── pictures reported from a gift link or by family: held, waiting for a look ──
  if (f.review.reported > 0) {
    out.push({
      key: `report:${f.review.reportedOldestAt?.toISOString() ?? 'now'}`,
      kind: 'report',
      title: f.review.reported === 1 ? 'A picture was reported' : `${f.review.reported} pictures were reported`,
      detail: 'Someone said something’s wrong with a keepsake. It’s held (offline, can’t be printed) until it’s reviewed.',
      since: f.review.reportedOldestAt ?? now,
      due: null,
      href: '/admin/review',
      action: 'review',
      urgent: true,
      dismissable: false,
    });
  }

  // ── the site itself: the watchdog, failed jobs ──
  for (const s of f.status) {
    if (s.ok || s.key === 'prodigi-check') continue;
    out.push({
      key: `site:${s.key}`,
      kind: 'site',
      title: s.key === 'watchdog' ? 'The site needs a look' : `The ${s.key.replace(/^job:/, '')} job failed`,
      detail: s.problems.length ? s.problems.join('; ') : 'see the health screen',
      since: s.checkedAt,
      due: null,
      href: '/admin/health',
      action: 'see what’s wrong',
      urgent: true,
      dismissable: false,
    });
  }
  const prodigi = f.status.find((s) => s.key === 'prodigi-check' && !s.ok);
  if (prodigi) {
    const key = `prodigi:${prodigi.checkedAt.toISOString().slice(0, 10)}`;
    out.push({
      key,
      kind: 'prodigi',
      title: 'Prodigi changed a product',
      detail: prodigi.problems.slice(0, 3).join('; ') + (prodigi.problems.length > 3 ? ` and ${prodigi.problems.length - 3} more` : ''),
      since: prodigi.checkedAt,
      due: null,
      href: '/admin/health',
      action: 'see what changed',
      urgent: false,
      dismissable: true,
    });
  }

  // ── orders: anything that isn't moving the way it should ──
  for (const o of f.orders) {
    const at = (k: string) => `order:${o.ref}:${k}`;
    const fullyRefunded = o.refundedPence > 0 && o.refundedPence >= o.totalPence;
    const failed = o.troubled.filter((t) => t.state === 'RENDER_FAILED' || t.state === 'ERROR').reduce((n, t) => n + t.count, 0);
    const held = o.troubled.filter((t) => t.state === 'BLOCKED_GATE').reduce((n, t) => n + t.count, 0);
    if (o.status === 'PAID' && failed) {
      out.push({ key: at('render-failed'), kind: 'order', title: `${o.ref}: the print file didn’t make`, detail: `${failed} item${failed === 1 ? '' : 's'} couldn’t be made into a print file, so the order can’t go to Prodigi.`, since: o.paidAt ?? o.createdAt, due: null, href: `/admin/orders/${o.ref}`, action: 'try again', urgent: true, dismissable: true });
    }
    if (o.status === 'PAID' && held) {
      out.push({ key: at('held'), kind: 'order', title: `${o.ref}: held by the safety check`, detail: `${held} item${held === 1 ? '' : 's'} can’t be sent to the printer until the picture is cleared in review.`, since: o.paidAt ?? o.createdAt, due: null, href: '/admin/review', action: 'review', urgent: true, dismissable: true });
    }
    if (o.status === 'PAID' && o.handOnly) {
      out.push({ key: at('by-hand'), kind: 'order', title: `${o.ref}: pack and post by hand`, detail: 'Nothing on it is made by Prodigi (gift wrap only), so it’s yours to send.', since: o.paidAt ?? o.createdAt, due: null, href: `/admin/orders/${o.ref}`, action: 'open order', urgent: false, dismissable: true });
    }
    if (o.status === 'PAID' && !o.handOnly && !o.prodigiOrderId && !failed && !held && o.paidAt && now.getTime() - o.paidAt.getTime() > LIMITS.notSentHours * HOUR) {
      out.push({ key: at('not-sent'), kind: 'order', title: `${o.ref}: paid ${waited(o.paidAt, now)} ago, not at Prodigi yet`, detail: o.submitError ? `Prodigi said: ${o.submitError.slice(0, 160)}` : 'It hasn’t been sent to the printer. It may still be making its print files.', since: o.paidAt, due: null, href: `/admin/orders/${o.ref}`, action: 'open order', urgent: true, dismissable: true });
    }
    if (o.status === 'FULFILLING' && o.prodigiOrderId && !fullyRefunded) {
      const sent = o.claimedAt ?? o.paidAt ?? o.createdAt;
      const days = workingDaysBetween(sent, now);
      if (days >= LIMITS.slowWorkingDays) {
        out.push({ key: at('slow'), kind: 'order', title: `${o.ref}: at Prodigi ${days} working days, not shipped`, detail: 'Longer than usual. Worth a look in Prodigi in case it’s stuck.', since: sent, due: null, href: `/admin/orders/${o.ref}`, action: 'open order', urgent: true, dismissable: true });
      }
    }
    if (o.status === 'CANCELLED' && o.prodigiOrderId && !fullyRefunded && now.getTime() - o.createdAt.getTime() < LIMITS.recentDays * DAY) {
      out.push({ key: at('prodigi-cancelled'), kind: 'order', title: `${o.ref}: Prodigi cancelled it`, detail: 'The customer paid but won’t get it. Refund them in Stripe, or make it again.', since: o.claimedAt ?? o.createdAt, due: null, href: `/admin/orders/${o.ref}`, action: 'open order', urgent: true, dismissable: true });
    }
    if (fullyRefunded && o.prodigiOrderId && o.status === 'FULFILLING') {
      out.push({ key: at('refund-at-prodigi'), kind: 'refund-at-prodigi', title: `${o.ref}: refunded, but already at Prodigi`, detail: 'Cancel it in Prodigi if they haven’t made it yet, or it will still be printed and posted.', since: o.refundedAt ?? now, due: null, href: `/admin/orders/${o.ref}`, action: 'cancel at Prodigi', urgent: true, dismissable: true });
    }
  }

  // ── data-protection requests and complaints: legal deadlines ──
  for (const r of f.rights) {
    if (r.status === 'COMPLETED' || r.status === 'DECLINED') continue;
    const soon = r.dueAt ? r.dueAt.getTime() - now.getTime() < LIMITS.rightsSoonDays * DAY : false;
    out.push({
      key: `rights:${r.id}`,
      kind: 'rights',
      title: r.type === 'COMPLAINT' ? 'A data-protection complaint' : `A data request (${r.type.toLowerCase()})`,
      detail: `${r.dueAt ? `Due ${r.dueAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${soon ? ' (soon)' : ''}. ` : ''}${r.status === 'CLOCK_PAUSED' ? 'Clock paused, waiting on them.' : 'The law gives a month to respond.'}`,
      since: r.receivedAt,
      due: r.dueAt,
      href: '/admin/inbox',
      action: 'open',
      urgent: false,
      dismissable: false,
    });
  }

  // ── flagged pictures (not reported ones: those are above) ──
  const flaggedOnly = f.review.waiting - f.review.reported;
  if (flaggedOnly > 0) {
    out.push({
      key: 'review:waiting',
      kind: 'review',
      title: flaggedOnly === 1 ? 'A picture is waiting for review' : `${flaggedOnly} pictures are waiting for review`,
      detail: 'The safety check flagged them. Nothing is printed until each is cleared.',
      since: f.review.oldestAt ?? now,
      due: null,
      href: '/admin/review',
      action: 'review',
      urgent: false,
      dismissable: false,
    });
  }

  // ── people waiting on a reply ──
  for (const m of f.support) {
    out.push({
      key: `support:${m.id}`,
      kind: 'support',
      title: `${m.ref} · ${TOPIC[m.topic] ?? m.topic}`,
      detail: m.orderRef ? `About order ${m.orderRef}.` : 'Waiting for a reply.',
      since: m.receivedAt,
      due: null,
      href: '/admin/inbox',
      action: 'reply',
      urgent: false,
      dismissable: false,
    });
  }

  if (f.commission && f.commission.pence > 0) {
    out.push({
      key: `commission:${f.commission.month}`,
      kind: 'commission',
      title: `Partner commission for ${f.commission.month}: ${pounds(f.commission.pence)}`,
      detail: `${f.commission.partners} partner${f.commission.partners === 1 ? '' : 's'} to pay.`,
      since: now,
      due: null,
      href: '/admin/codes',
      action: 'see who’s owed',
      urgent: false,
      dismissable: true,
    });
  }

  const shown = out.filter((n) => !(n.dismissable && f.handled.has(n.key)));
  // a deadline within 7 days goes to the top of its group; then oldest first
  const order = (n: Need) => RANK[n.kind] - (n.due && n.due.getTime() - now.getTime() < LIMITS.rightsSoonDays * DAY ? 0.5 : 0);
  return shown.sort((a, b) => order(a) - order(b) || a.since.getTime() - b.since.getTime());
}
