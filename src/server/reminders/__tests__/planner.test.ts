import { describe, expect, it } from 'vitest';
import { CAP_DAYS, planDigests, type Candidate, type PriorSend } from '../planner';

const NOW = new Date('2026-10-12T09:00:00Z');
const c = (over: Partial<Candidate> = {}): Candidate => ({ accountId: 'acct-1', email: 'p@example.test', key: 'child:mia', year: 2026, date: '2026-11-11', title: 'Mia turns 5', note: null, ...over });
const yes = new Map([['acct-1', true]]);
const plan = (candidates: Candidate[], opts: { consent?: Map<string, boolean>; sent?: PriorSend[]; now?: Date } = {}) =>
  planDigests({ candidates, consent: opts.consent ?? yes, sent: opts.sent ?? [], now: opts.now ?? NOW });

describe('occasion reminders — a month before AND two weeks before', () => {
  it('a month out: the 30-day nudge', () => {
    const out = plan([c({ date: '2026-11-11' })]); // in 30 days
    expect(out).toHaveLength(1);
    expect(out[0]!.lines).toEqual([expect.objectContaining({ key: 'child:mia', offset: 30, inDays: 30 })]);
  });

  it('two weeks out: the 14-day nudge', () => {
    expect(plan([c({ date: '2026-10-26' })])[0]!.lines[0]).toMatchObject({ offset: 14, inDays: 14 });
  });

  it('a little late (the job missed a day) still goes, inside the window', () => {
    expect(plan([c({ date: '2026-10-24' })])[0]!.lines[0]).toMatchObject({ offset: 14, inDays: 12 });
  });

  it('outside both windows: nothing (no third nudge, nothing months ahead)', () => {
    for (const date of ['2026-12-31', '2026-11-01', '2026-10-15']) expect(plan([c({ date })])).toEqual([]);
  });

  it('each nudge once per occasion per year', () => {
    const sent: PriorSend[] = [{ accountId: 'acct-1', occasionKey: 'child:mia', occasionYear: 2026, offsetDays: 30, sentAt: new Date('2026-10-01T09:00:00Z') }];
    expect(plan([c({ date: '2026-11-10' })], { sent })).toEqual([]); // the month nudge already went
    expect(plan([c({ date: '2026-10-26' })], { sent })[0]!.lines[0]!.offset).toBe(14); // the two-week one still comes
  });
});

describe('gentle and lawful', () => {
  it('PECR: no consent → nothing, ever', () => {
    expect(plan([c()], { consent: new Map([['acct-1', false]]) })).toEqual([]);
    expect(plan([c()], { consent: new Map() })).toEqual([]);
  });

  it('everything due goes in ONE email, soonest first', () => {
    const out = plan([c({ key: 'fest:fam:diwali', title: 'Diwali', date: '2026-11-08' }), c({ key: 'occ:anniv', title: 'Granny & grandad’s 40th', date: '2026-10-26' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.lines.map((l) => l.title)).toEqual(['Granny & grandad’s 40th', 'Diwali']);
  });

  it(`at most one email every ${CAP_DAYS} days — what's due waits (its window is wider)`, () => {
    const sent: PriorSend[] = [{ accountId: 'acct-1', occasionKey: 'occ:x', occasionYear: 2026, offsetDays: 14, sentAt: new Date('2026-10-11T09:00:00Z') }];
    expect(plan([c({ date: '2026-11-11' })], { sent })).toEqual([]);
    expect(plan([c({ date: '2026-11-11' })], { sent, now: new Date('2026-10-14T09:00:00Z') })[0]!.lines[0]!.offset).toBe(30);
  });

  it('each recipient only hears their own candidates (who-sees-what is decided upstream)', () => {
    const out = plan([c(), c({ accountId: 'acct-2', email: 'g@example.test' })], { consent: new Map([['acct-1', true], ['acct-2', true]]) });
    expect(out.map((d) => d.email).sort()).toEqual(['g@example.test', 'p@example.test']);
  });
});
