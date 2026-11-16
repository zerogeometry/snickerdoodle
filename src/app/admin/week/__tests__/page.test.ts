import { cloneElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelRows, channelTotal, settledRepeatRate, weekSummary } from '../../../../../scripts/lib/gtm-metrics.mjs';
import { funnelSteps, salesOf, weekPair } from '@/server/admin/weekMaths';
import type { WeekInsights, WeekSide } from '@/server/admin/week';

// The "this week" page's markup on made-up numbers (no database): every section renders with plain words, the
// spend box feeds cost per first order, and an empty week shows the empty card instead of a wall of zeros.

const reviewer = { accountId: 'admin-1', isAdmin: true, mfaVerified: true, email: null, enrolled: true };
vi.mock('@/server/admin/context', () => ({ currentReviewer: async () => reviewer }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
const weekInsights = vi.fn();
vi.mock('@/server/admin/week', () => ({ weekInsights: (...a: unknown[]) => weekInsights(...a) }));

const { default: WeekPage } = await import('../page');

const now = new Date('2026-11-18T10:00:00Z');
const pair = weekPair(now, 'this');
const order = (customer: string, at: string, totalPence: number, over: Record<string, unknown> = {}) => ({
  customer, at: new Date(at), totalPence, commissionPence: 0, code: null, partnerType: null, partnerName: null, isReferral: false,
  giftLink: false, linkOwner: null, joined: false, items: 1, parcelSavingPence: 0, familySetSavingPence: 0, bundle: false, ...over,
});
const data = {
  orders: [order('a', '2026-11-16T12:00:00Z', 3600), order('b', '2026-11-17T12:00:00Z', 14500, { items: 8, bundle: true }), order('c', '2026-11-10T12:00:00Z', 5000)],
  codes: [],
  giftLinks: [{ at: new Date('2026-11-16T09:00:00Z'), purchasedAt: null }],
  joins: [],
  flags: [{ at: new Date('2026-11-17T09:00:00Z'), decidedAt: new Date('2026-11-17T09:40:00Z'), viaLink: false }],
  blocked: [],
};

function fixture(spend: { channel: string; pence: number }[] | null, hasData = true): WeekInsights {
  const side = (w: typeof pair.current, funnel: WeekSide['funnel'], draw: WeekSide['draw']): WeekSide => ({ window: w, sales: salesOf(data.orders, w), summary: weekSummary(data, w, pair.asOf), funnel, draw });
  const current = side(pair.current, { uploads: 10, uploadsWeb: 7, uploadsDraw: 3, designs: 6, checkouts: 4, paid: 2 }, { phonesLinked: 1, drawingsSent: 3, drawOrders: 1 });
  const previous = side(pair.previous, { uploads: 5, uploadsWeb: 5, uploadsDraw: 0, designs: 2, checkouts: 1, paid: 1 }, { phonesLinked: 0, drawingsSent: 0, drawOrders: 0 });
  const rows = channelRows(data, pair.current, spend);
  return {
    pair,
    current,
    previous,
    products: [{ label: 'christmas family bundles', units: 1 }, { label: 'framed prints', units: 1 }],
    channels: { rows, total: channelTotal(rows, !!spend), withSpend: !!spend, cutLinePence: 1500 },
    funnel: funnelSteps(current.funnel),
    repeat: { settled: settledRepeatRate(data.orders, pair.asOf), returningOrders: 0, returningOrdersBefore: 0 },
    waitingNow: { count: 2, oldestAt: new Date('2026-11-18T08:00:00Z') },
    phonesLinkedNow: 4,
    hasData,
    now,
  } as WeekInsights;
}

/** Render the page, resolving its one async child (the week itself) the way the server would. */
async function render(search: Record<string, string>) {
  const shell = (await WeekPage({ searchParams: Promise.resolve(search) })) as ReactElement<{ children: ReactElement }>;
  const child = shell.props.children;
  const resolved = isValidElement(child) && typeof child.type === 'function' ? await (child.type as (p: unknown) => Promise<ReactElement>)(child.props) : child;
  return renderToStaticMarkup(cloneElement(shell, {}, resolved));
}

describe('admin · this week page', () => {
  beforeEach(() => {
    weekInsights.mockReset();
  });

  it('shows every section, in plain words, with the week switch', async () => {
    weekInsights.mockImplementation(async (_db, _r, o: { spend: unknown }) => fixture(o.spend as null));
    const html = await render({});
    expect(weekInsights).toHaveBeenCalledWith({}, reviewer, { which: 'this', spend: null });
    for (const h of ['sales', 'best sellers', 'where families drop off', 'channels', 'the gift loop', 'coming back', 'draw', 'safety']) expect(html).toContain(`>${h}</h2>`);
    expect(html).toContain('this week so far');
    expect(html).toContain('href="/admin/week?week=last"');
    expect(html).toContain('£181.00'); // takings this week so far, VAT included
    expect(html).toContain('60% of the step before'); // designs 6 → checkouts 4 is 67%; uploads 10 → designs 6 is 60%
    expect(html).toContain('7 on the website, 3 from Draw');
    expect(html).toContain('the oldest has waited 2.0h');
    expect(html).toContain('href="/admin/review"');
    expect(html).not.toMatch(/\bAI\b/);
    expect(html).not.toContain('cost per first order</th>'); // no spend typed: no cost column
  });

  it('typed spend works out cost per first order and flags a channel over £15', async () => {
    weekInsights.mockImplementation(async (_db, _r, o: { spend: { channel: string; pence: number }[] | null }) => fixture(o.spend));
    const html = await render({ week: 'last', spend: 'direct, 40' });
    expect(weekInsights).toHaveBeenCalledWith({}, reviewer, { which: 'last', spend: [{ channel: 'direct', pence: 4000 }] });
    expect(html).toContain('cost per first order</th>');
    expect(html).toContain('over £15<');
    expect(html).toContain('anything over £15 per first order is flagged');
    expect(html).toContain('name="week" value="last"'); // the form keeps the week
  });

  it("spend that doesn't read says so kindly and isn't used", async () => {
    weekInsights.mockImplementation(async () => fixture(null));
    const html = await render({ spend: 'direct, 40\nSARAHMAKES, lots' });
    expect(weekInsights).toHaveBeenCalledWith({}, reviewer, { which: 'this', spend: null });
    expect(html).toContain('role="alert"');
    expect(html).toContain('that didn&#x27;t quite read');
  });

  it('an empty week shows the empty card, not a wall of zeros', async () => {
    weekInsights.mockImplementation(async () => fixture(null, false));
    const html = await render({});
    expect(html).toContain('a quiet week so far');
    expect(html).not.toContain('>sales</h2>');
  });
});
