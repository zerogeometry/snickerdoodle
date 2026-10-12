import { describe, expect, it } from 'vitest';
import { CAP_DAYS, planReminders, type PlannerChild, type PlannerRecipient } from '../planner';

const NOW = new Date('2026-10-12T09:00:00Z');
const mia: PlannerChild = { id: 'c-mia', familyId: 'fam-A', firstName: 'Mia', birthday: '2021-10-28' }; // in 16 days
const leo: PlannerChild = { id: 'c-leo', familyId: 'fam-A', firstName: 'Leo', birthday: '2019-10-30' }; // in 18 days
const parent: PlannerRecipient = { accountId: 'acct-1', email: 'p@example.test', familyId: 'fam-A', remindersConsent: true };

describe('planReminders', () => {
  it('sends one gentle reminder in the window, for the soonest birthday', () => {
    const out = planReminders({ children: [mia, leo], recipients: [parent], sent: [], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ childId: 'c-mia', firstName: 'Mia', turns: 5, inDays: 16, occasionDate: '2026-10-28' });
  });

  it('PECR: no consent → nothing, ever', () => {
    expect(planReminders({ children: [mia], recipients: [{ ...parent, remindersConsent: false }], sent: [], now: NOW })).toEqual([]);
  });

  it('one reminder per child per year', () => {
    const sent = [{ accountId: 'acct-1', childId: 'c-mia', occasionYear: 2026, sentAt: new Date('2026-10-01T09:00:00Z') }];
    const out = planReminders({ children: [mia], recipients: [parent], sent, now: NOW });
    expect(out).toEqual([]);
  });

  it(`frequency cap: nothing within ${CAP_DAYS} days of the last reminder, even for another child`, () => {
    const sent = [{ accountId: 'acct-1', childId: 'c-mia', occasionYear: 2026, sentAt: new Date('2026-10-10T09:00:00Z') }];
    expect(planReminders({ children: [mia, leo], recipients: [parent], sent, now: NOW })).toEqual([]);
  });

  it('after the cap window, the next child can be reminded', () => {
    const sent = [{ accountId: 'acct-1', childId: 'c-mia', occasionYear: 2026, sentAt: new Date('2026-10-01T09:00:00Z') }];
    const out = planReminders({ children: [mia, leo], recipients: [parent], sent, now: NOW });
    expect(out.map((o) => o.childId)).toEqual(['c-leo']);
  });

  it('outside the window (too far or too close) → nothing', () => {
    const far = { ...mia, birthday: '2021-12-25' };
    const close = { ...mia, birthday: '2021-10-15' };
    expect(planReminders({ children: [far, close], recipients: [parent], sent: [], now: NOW })).toEqual([]);
  });

  it("never crosses families: another family's child is not this recipient's occasion", () => {
    expect(planReminders({ children: [{ ...mia, familyId: 'fam-B' }], recipients: [parent], sent: [], now: NOW })).toEqual([]);
  });

  it('ignores malformed birthdays rather than guessing', () => {
    expect(planReminders({ children: [{ ...mia, birthday: '28/10/2021' }], recipients: [parent], sent: [], now: NOW })).toEqual([]);
  });
});
