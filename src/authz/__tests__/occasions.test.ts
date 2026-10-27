import { describe, expect, it } from 'vitest';
import { canAddOccasion, canChangeOccasion, canSeeFamilyCalendar, canSeeOccasion, canSetCelebrate, type CalendarMembership } from '../occasions';
import { ACCESS_LEVELS, CIRCLES } from '../../domain/types';

const FAM = 'fam-A';
const m = (over: Partial<CalendarMembership> = {}): CalendarMembership => ({
  familyId: FAM,
  accountId: 'acct-member',
  circle: 'FAMILY',
  accessLevel: 'VIEW',
  status: 'ACTIVE',
  isOwner: false,
  seesOccasions: true,
  ...over,
});
const owner = m({ accountId: 'acct-owner', isOwner: true, seesOccasions: false, accessLevel: 'CONTRIBUTE' });
const occ = (shareCircle: 'FAMILY' | 'EXTENDED', createdByAccountId = 'acct-owner') => ({ familyId: FAM, shareCircle, createdByAccountId });

describe('the family calendar — who sees it', () => {
  it('the owner always; a member only once the owner shared it with them', () => {
    expect(canSeeFamilyCalendar(owner, FAM)).toBe(true);
    expect(canSeeFamilyCalendar(m(), FAM)).toBe(true);
    expect(canSeeFamilyCalendar(m({ seesOccasions: false }), FAM)).toBe(false);
  });

  it('never across families, never for an ex-member, never for no one', () => {
    expect(canSeeFamilyCalendar(m({ familyId: 'fam-B' }), FAM)).toBe(false);
    for (const status of ['REMOVED', 'LEFT'] as const) expect(canSeeFamilyCalendar(m({ status }), FAM)).toBe(false);
    expect(canSeeFamilyCalendar(null, FAM)).toBe(false);
  });
});

describe('an occasion — at the circle it is shared with', () => {
  it('FAMILY occasions reach the Family circle only; EXTENDED ones both circles', () => {
    for (const accessLevel of ACCESS_LEVELS) {
      expect(canSeeOccasion(occ('FAMILY'), m({ circle: 'FAMILY', accessLevel }))).toBe(true);
      expect(canSeeOccasion(occ('FAMILY'), m({ circle: 'EXTENDED', accessLevel }))).toBe(false);
      expect(canSeeOccasion(occ('EXTENDED'), m({ circle: 'EXTENDED', accessLevel }))).toBe(true);
      expect(canSeeOccasion(occ('EXTENDED'), m({ circle: 'FAMILY', accessLevel }))).toBe(true);
    }
  });

  it('the owner sees every occasion; nobody without the calendar sees any', () => {
    for (const c of ['FAMILY', 'EXTENDED'] as const) {
      expect(canSeeOccasion(occ(c), owner)).toBe(true);
      for (const circle of CIRCLES) expect(canSeeOccasion(occ(c), m({ circle, seesOccasions: false }))).toBe(false);
      expect(canSeeOccasion(occ(c), m({ familyId: 'fam-B' }))).toBe(false);
      expect(canSeeOccasion(occ(c), null)).toBe(false);
    }
  });
});

describe('adding and changing occasions', () => {
  it('the owner and contributors add; viewers and buyers do not', () => {
    expect(canAddOccasion(owner, FAM)).toBe(true);
    expect(canAddOccasion(m({ accessLevel: 'CONTRIBUTE' }), FAM)).toBe(true);
    expect(canAddOccasion(m({ accessLevel: 'VIEW' }), FAM)).toBe(false);
    expect(canAddOccasion(m({ accessLevel: 'VIEW_BUY' }), FAM)).toBe(false);
    expect(canAddOccasion(m({ accessLevel: 'CONTRIBUTE', familyId: 'fam-B' }), FAM)).toBe(false);
    expect(canAddOccasion(m({ accessLevel: 'CONTRIBUTE', status: 'REMOVED' }), FAM)).toBe(false);
  });

  it('the owner changes any; a contributor only their own; nobody else', () => {
    const mine = occ('FAMILY', 'acct-member');
    expect(canChangeOccasion(occ('FAMILY'), owner)).toBe(true);
    expect(canChangeOccasion(mine, m({ accessLevel: 'CONTRIBUTE' }))).toBe(true);
    expect(canChangeOccasion(occ('FAMILY'), m({ accessLevel: 'CONTRIBUTE' }))).toBe(false);
    expect(canChangeOccasion(mine, m({ accessLevel: 'VIEW' }))).toBe(false); // no longer a contributor
    expect(canChangeOccasion(mine, m({ accessLevel: 'CONTRIBUTE', status: 'LEFT' }))).toBe(false);
  });

  it('only the owner chooses the days the family celebrates', () => {
    expect(canSetCelebrate(owner, FAM)).toBe(true);
    for (const accessLevel of ACCESS_LEVELS) expect(canSetCelebrate(m({ accessLevel }), FAM)).toBe(false);
    expect(canSetCelebrate({ ...owner, familyId: 'fam-B' }, FAM)).toBe(false);
  });
});
