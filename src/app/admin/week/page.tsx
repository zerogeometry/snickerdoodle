import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getDb } from '@/db/client';
import { weekInsights, type ChannelRow, type SpendLine, type WeekInsights } from '@/server/admin/week';
import { compareNote, parseWhichWeek, percent, weekLabel, type WhichWeek } from '@/server/admin/weekMaths';
import { duration, gbp, parseSpendCsv } from '../../../../scripts/lib/gtm-metrics.mjs';
import { Button } from '@/ui/primitives/Button';
import { AdminEmpty, AdminShell, AdminStat, adminOr404, type AdminReviewer } from '../AdminShell';

export const metadata: Metadata = { title: 'this week', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const SPEND_MAX_CHARS = 2000;

type Search = { week?: string | string[]; spend?: string | string[] };

/**
 * This week (the admin app, ADMIN-APP-plan.md §4): sales, channels, the gift loop, coming back, where families drop
 * off, Draw and safety, against last week. Counts and totals only (no names, emails or children), so it's fine to
 * screenshot for a meeting. Admins only, behind two-step login; to anyone else it doesn't exist (404).
 */
export default async function WeekPage({ searchParams }: { searchParams: Promise<Search> }) {
  const reviewer = await adminOr404();
  const q = await searchParams;
  const which = parseWhichWeek(q.week);
  const spendText = (Array.isArray(q.spend) ? q.spend[0] : q.spend)?.slice(0, SPEND_MAX_CHARS) ?? '';

  return (
    <AdminShell section="week" title="this week" blurb="how the week is going, against last week. counts and totals only — no names, no children — so it's fine to screenshot." reviewer={reviewer}>
      <Week reviewer={reviewer} which={which} spendText={spendText} />
    </AdminShell>
  );
}

function readSpend(text: string): { spend: SpendLine[] | null; error: string | null } {
  if (!text.trim()) return { spend: null, error: null };
  try {
    const spend = parseSpendCsv(text) as SpendLine[];
    return { spend: spend.length ? spend : null, error: spend.length ? null : 'nothing to add up yet — type one line per channel, like "SARAHMAKES, 40".' };
  } catch (e) {
    return { spend: null, error: `that didn't quite read: ${(e as Error).message}. one line per channel, like "SARAHMAKES, 40".` };
  }
}

async function Week({ reviewer, which, spendText }: { reviewer: AdminReviewer; which: WhichWeek; spendText: string }) {
  const { spend, error } = readSpend(spendText);
  const w = await weekInsights(getDb(), reviewer, { which, spend });
  const vs = w.pair.vsLabel;

  return (
    <>
      <WeekSwitch which={which} spendText={spendText} />
      <p className="mt-3 text-sm text-ink-soft">
        <b className="text-cocoa">{weekLabel(w.pair.current)}</b>
        {which === 'this' ? ', so far' : ''} · compared with {vs} ({weekLabel(w.pair.previous)}{which === 'this' ? ', to the same time' : ''}). London days.
      </p>

      {!w.hasData ? (
        <AdminEmpty title={which === 'this' ? 'a quiet week so far' : 'nothing happened last week'}>
          No orders, pictures or designs yet. The numbers fill in here as families start creating.
        </AdminEmpty>
      ) : (
        <>
          <SalesSection w={w} />
          <BestSellers w={w} />
          <DropOff w={w} />
          <Channels w={w} which={which} spendText={spendText} spendError={error} />
          <GiftLoop w={w} />
          <ComingBack w={w} />
          <Draw w={w} />
          <Safety w={w} />
        </>
      )}
    </>
  );
}

function WeekSwitch({ which, spendText }: { which: WhichWeek; spendText: string }) {
  const href = (wk: WhichWeek) => {
    const p = new URLSearchParams();
    if (wk === 'last') p.set('week', 'last');
    if (spendText) p.set('spend', spendText);
    const s = p.toString();
    return s ? `/admin/week?${s}` : '/admin/week';
  };
  const pill = (wk: WhichWeek, label: string) => (
    <Link
      href={href(wk)}
      aria-current={which === wk ? 'true' : undefined}
      className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 font-bold ${which === wk ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 bg-paper text-ink-soft hover:border-cocoa'}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="mt-5 flex flex-wrap gap-2 text-sm" role="group" aria-label="which week">
      {pill('this', 'this week so far')}
      {pill('last', 'last week')}
    </div>
  );
}

// ── building blocks ──────────────────────────────────────────────────────────

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`week-${id}`} className="mt-8">
      <h2 id={`week-${id}`} className="font-display text-xl text-cocoa">
        {title}
      </h2>
      {intro ? <p className="mt-1 max-w-xl text-sm text-ink-soft">{intro}</p> : null}
      {children}
    </section>
  );
}

const Stats = ({ children }: { children: ReactNode }) => <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">{children}</div>;

const count = (n: number) => n.toLocaleString('en-GB');
/** "£15", or "£15.50" when there are pence. */
const pounds = (pence: number) => (pence % 100 ? gbp(pence) : `£${(pence / 100).toLocaleString('en-GB')}`);
/** A rate last week, in words. */
const rateThen = (r: number | null | undefined, vs: string) => (r === null || r === undefined ? `none ${vs}` : `${percent(r)} ${vs}`);
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** A row of a simple bar list: the words and number carry the meaning; the bar is decoration. */
function Bar({ label, value, share, note }: { label: ReactNode; value: ReactNode; share: number; note?: ReactNode }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-cocoa">{label}</span>
        <span className="shrink-0 font-display text-cocoa">{value}</span>
      </div>
      <div aria-hidden="true" className="mt-1 h-3 overflow-hidden rounded-pill bg-paper-2">
        <div className="h-full rounded-pill border border-cocoa/30 bg-honey" style={{ width: `${Math.max(share > 0 ? 3 : 0, Math.round(share * 100))}%` }} />
      </div>
      {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
    </li>
  );
}

// ── the sections ─────────────────────────────────────────────────────────────

function SalesSection({ w }: { w: WeekInsights }) {
  const [c, p] = [w.current, w.previous];
  const vs = w.pair.vsLabel;
  const money = (n: number) => gbp(n);
  return (
    <Section id="sales" title="sales" intro="paid orders only. takings include VAT; the Monday report counts them without it.">
      <Stats>
        <AdminStat label="orders" value={count(c.sales.orders)} note={compareNote(c.sales.orders, p.sales.orders, vs)} />
        <AdminStat label="takings" value={gbp(c.sales.takingsPence)} note={<>{gbp(c.sales.takingsExVatPence)} before VAT · {compareNote(c.sales.takingsPence, p.sales.takingsPence, vs, money)}</>} />
        <AdminStat label="average order" value={gbp(c.sales.averagePence)} note={compareNote(c.sales.averagePence, p.sales.averagePence, vs, money)} />
        <AdminStat label="christmas bundles" value={c.summary.bundles === undefined ? '—' : count(c.summary.bundles)} note={compareNote(c.summary.bundles ?? 0, p.summary.bundles ?? 0, vs)} />
        <AdminStat label="orders with 2+ things" value={percent(c.summary.multiItemRate)} note={rateThen(p.summary.multiItemRate, vs)} />
      </Stats>
    </Section>
  );
}

function BestSellers({ w }: { w: WeekInsights }) {
  const max = Math.max(0, ...w.products.map((p) => p.units));
  return (
    <Section id="products" title="best sellers" intro="how many of each were bought this week. a christmas bundle counts once, however many pieces are in it.">
      {w.products.length ? (
        <ol className="mt-2 divide-y divide-cocoa/10 rounded-[18px] border-2 border-cocoa/15 bg-paper px-4 py-1">
          {w.products.map((p) => (
            <Bar key={p.label} label={p.label} value={count(p.units)} share={max ? p.units / max : 0} />
          ))}
        </ol>
      ) : (
        <AdminEmpty title="nothing sold yet">The best sellers show up here after the first paid order.</AdminEmpty>
      )}
    </Section>
  );
}

const FUNNEL_WORDS: Record<string, { label: string; counts: string }> = {
  uploads: { label: 'pictures uploaded', counts: 'drawings and photos added this week, on the website or sent from Draw (deleted ones drop out).' },
  designs: { label: 'designs made', counts: 'designs saved in the maker this week (one picture can make several).' },
  checkouts: { label: 'checkouts started', counts: 'orders begun this week, paid or not.' },
  paid: { label: 'paid', counts: 'orders paid this week.' },
};

function DropOff({ w }: { w: WeekInsights }) {
  const f = w.current.funnel;
  return (
    <Section
      id="funnel"
      title="where families drop off"
      intro="counted from what the site already keeps — pictures, designs and orders. no cookies, and nobody is followed: each step is just that week's count, so a step can be bigger than the one before."
    >
      <ol className="mt-2 divide-y divide-cocoa/10 rounded-[18px] border-2 border-cocoa/15 bg-paper px-4 py-1">
        {w.funnel.map((s) => {
          const words = FUNNEL_WORDS[s.key]!;
          const extra = s.key === 'uploads' ? ` ${count(f.uploadsWeb)} on the website, ${count(f.uploadsDraw)} from Draw.` : '';
          return (
            <Bar
              key={s.key}
              label={words.label}
              value={
                <>
                  {count(s.count)}
                  {s.ofPrevious !== null ? <span className="ml-2 text-xs font-bold text-ink-soft">{percent(s.ofPrevious)} of the step before</span> : null}
                </>
              }
              share={s.barShare}
              note={words.counts + extra}
            />
          );
        })}
      </ol>
    </Section>
  );
}

function Channels({ w, which, spendText, spendError }: { w: WeekInsights; which: WhichWeek; spendText: string; spendError: string | null }) {
  const { rows, total, withSpend, cutLinePence } = w.channels;
  const cells = (r: ChannelRow) => [count(r.orders), count(r.first), gbp(r.revenuePence), gbp(r.commissionPence), count(r.relatives), ...(withSpend ? [gbp(r.spendPence ?? 0), gbp(r.costPerFirstPence)] : [])];
  const cut = pounds(cutLinePence);
  const head = ['orders', 'first orders', 'takings ex VAT', 'commission owed', 'relatives', ...(withSpend ? ['spent', 'cost per first order'] : [])];
  return (
    <Section
      id="channels"
      title="channels"
      intro={
        <>
          where this week&apos;s orders came from — the Monday numbers. a first order is someone&apos;s very first. relatives = gift-link buys and family joins, credited to where that family first came from.
          {withSpend ? <> anything over {cut} per first order is flagged.</> : null}
        </>
      }
    >
      {rows.length ? (
        <div role="region" aria-label="channels table" tabIndex={0} className="mt-3 overflow-x-auto rounded-[18px] border-2 border-cocoa/15 bg-paper">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">orders by channel, {withSpend ? 'with cost per first order' : 'without spend'}</caption>
            <thead>
              <tr className="border-b-2 border-cocoa/15 text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-3 py-2">channel</th>
                {head.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key ?? r.label} className="border-b border-cocoa/10">
                  <th scope="row" className="px-3 py-2 text-left font-bold text-cocoa">
                    {r.label}
                    {r.flag ? <span className="mt-1 block w-max whitespace-nowrap rounded-pill border-2 border-cinnamon px-2 text-xs text-cinnamon">{r.flag === 'over £15' ? `over ${cut}` : 'no first orders yet'}</span> : null}
                  </th>
                  {cells(r).map((c, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-cocoa">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-paper-2 font-bold">
                <th scope="row" className="px-3 py-2 text-left text-cocoa">
                  total
                </th>
                {cells(total).map((c, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums text-cocoa">
                    {c}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty title="no paid orders yet">Channels show up here once orders come in.</AdminEmpty>
      )}

      <form method="get" action="/admin/week" className="mt-4 rounded-[18px] border-2 border-cocoa/15 bg-paper p-4">
        {which === 'last' ? <input type="hidden" name="week" value="last" /> : null}
        <label htmlFor="week-spend" className="block font-bold text-cocoa">
          what did you spend this week?
        </label>
        <p id="week-spend-help" className="mt-1 text-xs text-ink-soft">
          one line each: the channel, a comma, then pounds — a code (SARAHMAKES, 40), a school&apos;s name, or &quot;direct&quot;. it isn&apos;t saved anywhere; it only works out cost per first order on this page.
        </p>
        <textarea
          id="week-spend"
          name="spend"
          rows={3}
          maxLength={SPEND_MAX_CHARS}
          defaultValue={spendText}
          aria-describedby={`week-spend-help${spendError ? ' week-spend-error' : ''}`}
          aria-invalid={spendError ? true : undefined}
          className="mt-2 w-full rounded-[12px] border-2 border-cocoa/25 bg-oat p-3 font-mono text-sm text-cocoa focus:border-cocoa"
          placeholder={'SARAHMAKES, 40\ndirect, 25'}
        />
        {spendError ? (
          <p id="week-spend-error" role="alert" className="mt-1 text-sm font-bold text-cinnamon">
            {spendError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm">
            work out cost per first order
          </Button>
          {spendText ? (
            <Button href={which === 'last' ? '/admin/week?week=last' : '/admin/week'} variant="ghost" size="sm">
              clear
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function GiftLoop({ w }: { w: WeekInsights }) {
  const [c, p] = [w.current.summary, w.previous.summary];
  const vs = w.pair.vsLabel;
  return (
    <Section id="gift" title="the gift loop" intro="links families sent to grandparents and friends, and what came of them.">
      <Stats>
        <AdminStat label="gift links made" value={count(c.giftLinksMade)} note={compareNote(c.giftLinksMade, p.giftLinksMade, vs)} />
        <AdminStat label="links bought from" value={percent(c.giftLinkBoughtRate)} note={c.giftLinksMade ? `of this week's links, so far · ${rateThen(p.giftLinkBoughtRate, vs)}` : 'no links made yet'} />
        <AdminStat label="gift-link orders" value={count(c.giftLinkOrders)} note={compareNote(c.giftLinkOrders, p.giftLinkOrders, vs)} />
        <AdminStat label="buyers who joined" value={percent(c.giftBuyersJoinedRate)} note={c.giftBuyers ? `of ${plural(c.giftBuyers, 'gift-link buyer')} · ${rateThen(p.giftBuyersJoinedRate, vs)}` : 'no gift-link buyers yet'} />
        <AdminStat label="relatives joined" value={count(c.familyJoins)} note={compareNote(c.familyJoins, p.familyJoins, vs)} />
      </Stats>
    </Section>
  );
}

function ComingBack({ w }: { w: WeekInsights }) {
  const { settled, returningOrders, returningOrdersBefore } = w.repeat;
  return (
    <Section id="repeat" title="coming back" intro="customers who order again within 90 days of their first order.">
      <Stats>
        <AdminStat
          label="back within 90 days"
          value={percent(settled.rate)}
          note={settled.cohort ? `${count(settled.repeated)} of ${plural(settled.cohort, 'customer')} whose first order was 90+ days ago` : 'nobody is 90 days in yet'}
        />
        <AdminStat label="orders from returning customers" value={count(returningOrders)} note={compareNote(returningOrders, returningOrdersBefore, w.pair.vsLabel)} />
      </Stats>
    </Section>
  );
}

function Draw({ w }: { w: WeekInsights }) {
  const [c, p] = [w.current.draw, w.previous.draw];
  const vs = w.pair.vsLabel;
  return (
    <Section id="draw" title="draw" intro="the kids' drawing app.">
      <Stats>
        <AdminStat label="phones linked" value={count(w.phonesLinkedNow)} note={`right now · ${plural(c.phonesLinked, 'new link')} this week, ${count(p.phonesLinked)} ${vs}`} />
        <AdminStat label="drawings sent" value={count(c.drawingsSent)} note={compareNote(c.drawingsSent, p.drawingsSent, vs)} />
        <AdminStat label="make it real orders" value={count(c.drawOrders)} note={<>paid orders with a drawing from Draw · {compareNote(c.drawOrders, p.drawOrders, vs)}</>} />
      </Stats>
    </Section>
  );
}

function Safety({ w }: { w: WeekInsights }) {
  const [c, p] = [w.current.summary, w.previous.summary];
  const vs = w.pair.vsLabel;
  const waiting = w.waitingNow;
  const oldest = waiting.oldestAt ? duration(w.now.getTime() - waiting.oldestAt.getTime()) : null;
  return (
    <Section id="safety" title="safety" intro="pictures the safety checks held for a look, and how quickly they were seen to.">
      <Stats>
        <AdminStat label="pictures flagged" value={count(c.flagged)} note={compareNote(c.flagged, p.flagged, vs)} />
        <AdminStat label="time to review" value={duration(c.flagMedianMs)} note={c.flagMaxMs !== null ? `usually · the longest took ${duration(c.flagMaxMs)}` : 'none reviewed yet'} />
        <AdminStat label="reports from gift links" value={count(c.giftLinkReports)} note={compareNote(c.giftLinkReports, p.giftLinkReports, vs)} />
        <AdminStat
          label="waiting right now"
          value={count(waiting.count)}
          tone={waiting.count > 0 ? 'bad' : 'good'}
          note={waiting.count ? `the oldest has waited ${oldest}` : 'all seen to'}
        />
      </Stats>
      {waiting.count ? (
        <Button href="/admin/review" variant="secondary" size="sm" className="mt-3">
          review them
        </Button>
      ) : null}
    </Section>
  );
}
