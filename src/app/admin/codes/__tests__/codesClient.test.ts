import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The codes screen's client parts render on the server without the app (a smoke test of what's shown first):
// the list's wording and states, the "switch off" step that asks before it acts, and a partner's email never in the
// page until asked for.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/actions/adminCodes', () => ({ createCodeAction: vi.fn(), setCodeActiveAction: vi.fn(), revealPartnerEmailAction: vi.fn() }));

const { CodeList, CommissionPartners, NewCode } = await import('../CodesClient');

const base = {
  kind: 'PERCENT' as const,
  value: 1000,
  offer: '10% off',
  active: true,
  state: 'live' as const,
  startsAt: null,
  endsAt: '2026-12-24T00:00:00.000Z',
  minSpendPence: 1500,
  firstOrderOnly: true,
  uses: 12,
  holding: 1,
  maxRedemptions: 500,
  partnerName: null,
  partnerType: null,
  classLabel: null,
  commissionBps: 0,
  hasPartnerEmail: false,
  revenuePence: 48000,
  discountPence: 4800,
  commissionPence: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
};

describe('codes screen (client parts)', () => {
  it('lists each code in plain words, with a switch that asks before it acts', () => {
    const html = renderToStaticMarkup(
      createElement(CodeList, {
        codes: [
          { ...base, id: 'a', code: 'WELCOME10' },
          { ...base, id: 'b', code: 'STMARYS-Y2', offer: 'no discount', value: 0, active: false, state: 'off', partnerName: 'St Mary’s PTA', partnerType: 'PTA', classLabel: 'Year 2', commissionBps: 1000, commissionPence: 2300, hasPartnerEmail: true },
        ],
      }),
    );
    expect(html).toContain('WELCOME10');
    expect(html).toContain('first order only · when they spend £15 · 12 of 500 used · 1 at checkout now · stops at the start of 24 Dec 2026');
    expect(html).toContain('working');
    expect(html).toContain('switch off');
    expect(html).toContain('switch back on');
    expect(html).toContain('school PTA · 10% commission · their email is on file');
    expect(html).not.toContain('yes, switch it off'); // the question only appears after the first tap
  });

  it('never puts a partner’s email in the page until it’s asked for', () => {
    const html = renderToStaticMarkup(
      createElement(CommissionPartners, {
        partners: [{ key: 'Sarah', partnerName: 'Sarah', partnerType: 'INFLUENCER', codes: ['SARAHMAKES'], classes: [], paidOrders: 4, earningOrders: 3, salesPence: 12000, commissionPence: 450, hasEmail: true }],
      }),
    );
    expect(html).toContain('show their email');
    expect(html).toContain('£4.50');
    expect(html).not.toContain('@');
  });

  it('“new code” starts as one clear button', () => {
    const html = renderToStaticMarkup(createElement(NewCode));
    expect(html).toContain('new code');
    expect(html).toContain('aria-expanded="false"');
  });
});
