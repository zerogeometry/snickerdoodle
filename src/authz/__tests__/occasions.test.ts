import { describe, expect, it } from 'vitest';
import {
  canAddHouseholdOccasion,
  canAddOwnOccasion,
  canAddThisOccasion,
  canChangeOccasion,
  canMakeOccasionChange,
  canSeeFamilyCalendar,
  canSeeOccasion,
  canSetCelebrate,
  effectiveOccasionShare,
  occasionEditRole,
  occasionShareChoices,
  seesOccasionDetail,
  type CalendarMembership,
  type OccasionRef,
} from '../occasions';
import { ACCESS_LEVELS, CIRCLES, type Circle, type OccasionWhose } from '../../domain/types';
import { circleSees } from '../tiers';

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
const owner = m({ accountId: 'acct-owner', circle: 'FAMILY', isOwner: true, seesOccasions: false, accessLevel: 'CONTRIBUTE' });
const occ = (shareCircle: Circle, whose: OccasionWhose = 'OURS', createdByAccountId = 'acct-owner', memberAccountId: string | null = null): OccasionRef => ({
  familyId: FAM,
  shareCircle,
  whose,
  createdByAccountId,
  memberAccountId,
});

describe('the family calendar — who sees it', () => {
  it('the leader always; a member only once the leader shared it with them', () => {
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

describe('"ours" days — share × circle × access (tiers nest, the leader counts as home)', () => {
  for (const share of CIRCLES) {
    for (const circle of CIRCLES) {
      for (const accessLevel of ACCESS_LEVELS) {
        const expected = circleSees(circle, share);
        it(`${share} day, ${circle}/${accessLevel} member -> ${expected}`, () => {
          expect(canSeeOccasion(occ(share), m({ circle, accessLevel }))).toBe(expected);
        });
      }
    }
    it(`${share} day: the leader sees it; nobody without the calendar, another family or nobody does`, () => {
      expect(canSeeOccasion(occ(share), owner)).toBe(true);
      for (const circle of CIRCLES) expect(canSeeOccasion(occ(share), m({ circle, seesOccasions: false }))).toBe(false);
      expect(canSeeOccasion(occ(share), m({ familyId: 'fam-B', circle: 'HOME' }))).toBe(false);
      expect(canSeeOccasion(occ(share), m({ circle: 'HOME', status: 'REMOVED' }))).toBe(false);
      expect(canSeeOccasion(occ(share), null)).toBe(false);
    });
  }
});

describe('"someone else’s" days are HOME ONLY — whatever is stored, with no way to widen', () => {
  it('only home choices are ever offered', () => {
    expect(occasionShareChoices('SOMEONE_ELSE')).toEqual(['HOME']);
    expect(occasionShareChoices('OURS')).toEqual(['HOME', 'FAMILY', 'EXTENDED']);
  });

  for (const stored of CIRCLES) {
    it(`stored as ${stored} (a forged or legacy row) it still reaches home only`, () => {
      const o = occ(stored, 'SOMEONE_ELSE');
      expect(effectiveOccasionShare(o)).toBe('HOME');
      expect(canSeeOccasion(o, m({ circle: 'HOME' }))).toBe(true);
      expect(canSeeOccasion(o, owner)).toBe(true);
      expect(canSeeOccasion(o, m({ circle: 'FAMILY' }))).toBe(false);
      expect(canSeeOccasion(o, m({ circle: 'EXTENDED' }))).toBe(false);
    });
  }

  it('the person who added it still sees it (their own reminder), even outside home', () => {
    expect(canSeeOccasion(occ('HOME', 'SOMEONE_ELSE', 'acct-member'), m({ circle: 'EXTENDED', seesOccasions: false }))).toBe(true);
  });

  it('nobody can widen it: not the creator, not the leader', () => {
    const o = occ('HOME', 'SOMEONE_ELSE');
    // the creator (the leader here) may keep it someone else's at home…
    expect(canMakeOccasionChange(o, { shareCircle: 'HOME', whose: 'SOMEONE_ELSE', sameDetails: true }, owner)).toBe(true);
    // …but re-sharing it wider never makes it visible beyond home while it's someone else's
    expect(effectiveOccasionShare({ shareCircle: 'EXTENDED', whose: 'SOMEONE_ELSE' })).toBe('HOME');
    // and the leader can't flip a member's "someone else's" day back to "ours"
    const membersEntry = occ('HOME', 'SOMEONE_ELSE', 'acct-partner');
    expect(canMakeOccasionChange(membersEntry, { shareCircle: 'EXTENDED', whose: 'OURS', sameDetails: true }, owner)).toBe(false);
  });
});

describe('the year (and lines that give it away) travels to whoever added it and home only', () => {
  it('home and the creator see the detail; family and extended get the day and month only', () => {
    expect(seesOccasionDetail(occ('EXTENDED'), owner)).toBe(true);
    expect(seesOccasionDetail(occ('EXTENDED'), m({ circle: 'HOME' }))).toBe(true);
    expect(seesOccasionDetail(occ('EXTENDED', 'OURS', 'acct-member'), m({ circle: 'EXTENDED' }))).toBe(true);
    expect(seesOccasionDetail(occ('EXTENDED'), m({ circle: 'FAMILY' }))).toBe(false);
    expect(seesOccasionDetail(occ('EXTENDED'), m({ circle: 'EXTENDED' }))).toBe(false);
    expect(seesOccasionDetail(occ('EXTENDED'), m({ circle: 'HOME', familyId: 'fam-B' }))).toBe(false);
  });
});

describe('adding days', () => {
  it('anyone active in the family may add THEIR OWN day (their own consent), whatever their circle or access', () => {
    for (const circle of CIRCLES) {
      for (const accessLevel of ACCESS_LEVELS) {
        const me = m({ circle, accessLevel, seesOccasions: false });
        expect(canAddOwnOccasion(me, FAM)).toBe(true);
        expect(canAddThisOccasion({ familyId: FAM, whose: 'OURS', memberAccountId: 'acct-member' }, me)).toBe(true);
      }
    }
  });

  it('the household’s days (ours, or someone else’s) only the leader or a home member who can add', () => {
    expect(canAddHouseholdOccasion(owner, FAM)).toBe(true);
    expect(canAddHouseholdOccasion(m({ circle: 'HOME', accessLevel: 'CONTRIBUTE' }), FAM)).toBe(true);
    expect(canAddHouseholdOccasion(m({ circle: 'HOME', accessLevel: 'VIEW_BUY' }), FAM)).toBe(false);
    expect(canAddHouseholdOccasion(m({ circle: 'FAMILY', accessLevel: 'CONTRIBUTE' }), FAM)).toBe(false);
    expect(canAddHouseholdOccasion(m({ circle: 'EXTENDED', accessLevel: 'CONTRIBUTE' }), FAM)).toBe(false);
    for (const whose of ['OURS', 'SOMEONE_ELSE'] as const) {
      expect(canAddThisOccasion({ familyId: FAM, whose, memberAccountId: null }, m({ circle: 'FAMILY', accessLevel: 'CONTRIBUTE' }))).toBe(false);
      expect(canAddThisOccasion({ familyId: FAM, whose, memberAccountId: null }, owner)).toBe(true);
    }
  });

  it('someone outside home can’t pass off another person’s day as their own', () => {
    expect(canAddThisOccasion({ familyId: FAM, whose: 'OURS', memberAccountId: 'acct-granny' }, m({ circle: 'EXTENDED', accessLevel: 'CONTRIBUTE' }))).toBe(false);
  });

  it('never in another family, never once removed', () => {
    expect(canAddOwnOccasion(m({ familyId: 'fam-B' }), FAM)).toBe(false);
    expect(canAddOwnOccasion(m({ status: 'REMOVED' }), FAM)).toBe(false);
    expect(canAddHouseholdOccasion({ ...owner, familyId: 'fam-B' }, FAM)).toBe(false);
  });
});

describe('changing days — whoever added it; the leader may only narrow or take off', () => {
  it('the leader changes their own days freely', () => {
    expect(occasionEditRole(occ('FAMILY'), owner)).toBe('creator');
    expect(canMakeOccasionChange(occ('FAMILY'), { shareCircle: 'EXTENDED', whose: 'OURS', sameDetails: false }, owner)).toBe(true);
  });

  it('a member changes their own day, and its share, freely', () => {
    const mine = occ('FAMILY', 'OURS', 'acct-member', 'acct-member');
    const me = m({ circle: 'EXTENDED', accessLevel: 'VIEW' });
    expect(occasionEditRole(mine, me)).toBe('creator');
    expect(canMakeOccasionChange(mine, { shareCircle: 'EXTENDED', whose: 'OURS', memberAccountId: 'acct-member', sameDetails: false }, me)).toBe(true);
    // …but can't turn it into somebody else's day
    expect(canMakeOccasionChange(mine, { shareCircle: 'FAMILY', whose: 'SOMEONE_ELSE', memberAccountId: null, sameDetails: true }, me)).toBe(false);
  });

  it('the leader on a member’s own day: narrower only, same details', () => {
    const grannys = occ('EXTENDED', 'OURS', 'acct-granny', 'acct-granny');
    expect(occasionEditRole(grannys, owner)).toBe('leader');
    expect(canChangeOccasion(grannys, owner)).toBe(true); // may take it off
    for (const narrower of ['HOME', 'FAMILY', 'EXTENDED'] as const) {
      expect(canMakeOccasionChange(grannys, { shareCircle: narrower, whose: 'OURS', memberAccountId: 'acct-granny', sameDetails: true }, owner)).toBe(true);
    }
    expect(canMakeOccasionChange(occ('HOME', 'OURS', 'acct-granny', 'acct-granny'), { shareCircle: 'FAMILY', whose: 'OURS', sameDetails: true }, owner)).toBe(false);
    expect(canMakeOccasionChange(grannys, { shareCircle: 'HOME', whose: 'OURS', sameDetails: false }, owner)).toBe(false);
  });

  it('nobody else: another member, an ex-creator, another family', () => {
    const grannys = occ('EXTENDED', 'OURS', 'acct-granny', 'acct-granny');
    expect(canChangeOccasion(grannys, m({ circle: 'HOME', accessLevel: 'CONTRIBUTE' }))).toBe(false);
    expect(canChangeOccasion(grannys, m({ accountId: 'acct-granny', status: 'LEFT' }))).toBe(false);
    expect(canChangeOccasion(grannys, { ...owner, familyId: 'fam-B' })).toBe(false);
  });

  it('a contributor who added a household day before D27, now outside home, can’t change it (the leader can narrow it)', () => {
    const old = occ('FAMILY', 'OURS', 'acct-member');
    expect(canChangeOccasion(old, m({ circle: 'FAMILY', accessLevel: 'CONTRIBUTE' }))).toBe(false);
    expect(occasionEditRole(old, owner)).toBe('leader');
  });

  it('only the leader chooses the days the family celebrates', () => {
    expect(canSetCelebrate(owner, FAM)).toBe(true);
    for (const accessLevel of ACCESS_LEVELS) expect(canSetCelebrate(m({ accessLevel, circle: 'HOME' }), FAM)).toBe(false);
    expect(canSetCelebrate({ ...owner, familyId: 'fam-B' }, FAM)).toBe(false);
  });
});
