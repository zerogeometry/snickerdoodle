import type { Circle, OccasionWhose } from '../domain/types';
import type { Membership } from './policy';
import { circleSees, effectiveCircle } from './tiers';

/**
 * The family CALENDAR (founder, 27 Oct; "whose day is it?" — D27, 10 Nov 2026): who sees a family's dates, and who
 * may add / change them. Name + day + month only beyond home — never a picture, never a year — but still the
 * family's own: nothing here is ever public, and every rule starts from an ACTIVE membership in THAT family.
 *
 *  - SEE the calendar: the leader, or a member the leader shared it with (`seesOccasions`).
 *  - WHOSE DAY: "mine / ours" (the leader, partner, the family's own little ones, or a member's own day) may be
 *    shared at home, family or extended (tiers nest, as for keepsakes). "Someone else's" (a brother-in-law, a
 *    friend) is HOME ONLY — whatever is stored — because that person never agreed to it going further.
 *  - SEE an occasion: whoever added it always; otherwise the calendar, at a circle its (effective) share reaches.
 *  - ADD: anyone in the family may add THEIR OWN day and pick who sees it (sharing your own day is your own consent).
 *    Anything else ("ours" for the household, or someone else's) only the leader or a home member who can add.
 *  - CHANGE: whoever added it (while they still could add it). The leader may always make someone's day more
 *    private, or take it off — never wider (as a little one's parent can with keepsakes).
 *  - "The days we celebrate": the leader alone (it's the family's own choice).
 */
export type CalendarMembership = Membership & { seesOccasions: boolean };
export interface OccasionRef {
  familyId: string;
  shareCircle: Circle;
  whose: OccasionWhose;
  createdByAccountId: string;
  /** who it's for, when they're a member (their own day when it's the person who added it) */
  memberAccountId?: string | null;
}

const activeIn = (m: CalendarMembership | null | undefined, familyId: string): m is CalendarMembership =>
  !!m && m.status === 'ACTIVE' && m.familyId === familyId;

/** Who actually sees it: someone else's day never leaves home. */
export function effectiveOccasionShare(o: Pick<OccasionRef, 'shareCircle' | 'whose'>): Circle {
  return o.whose === 'SOMEONE_ELSE' ? 'HOME' : o.shareCircle;
}

/** The share choices offered for a day: someone else's → home only (no option to widen at all). */
export function occasionShareChoices(whose: OccasionWhose): Circle[] {
  return whose === 'SOMEONE_ELSE' ? ['HOME'] : ['HOME', 'FAMILY', 'EXTENDED'];
}

/** Is this the member's own day (added by them, for them)? */
export const isOwnDay = (o: Pick<OccasionRef, 'createdByAccountId' | 'memberAccountId' | 'whose'>): boolean =>
  o.whose === 'OURS' && !!o.memberAccountId && o.memberAccountId === o.createdByAccountId;

export function canSeeFamilyCalendar(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && (m.isOwner || m.seesOccasions);
}

export function canSeeOccasion(o: Pick<OccasionRef, 'familyId' | 'shareCircle' | 'whose' | 'createdByAccountId'>, m: CalendarMembership | null | undefined): boolean {
  if (!activeIn(m, o.familyId)) return false;
  if (m.accountId === o.createdByAccountId) return true;
  if (!canSeeFamilyCalendar(m, o.familyId)) return false;
  return circleSees(effectiveCircle(m), effectiveOccasionShare(o));
}

/** The year, and lines that give it away ("turns 40", "10th anniversary"): whoever added it and home only. */
export function seesOccasionDetail(o: Pick<OccasionRef, 'familyId' | 'createdByAccountId'>, m: CalendarMembership | null | undefined): boolean {
  if (!activeIn(m, o.familyId)) return false;
  return m.accountId === o.createdByAccountId || effectiveCircle(m) === 'HOME';
}

/** May they add the household's days ("ours", or someone else's)? The leader, or a home member who can add. */
export function canAddHouseholdOccasion(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && (m.isOwner || (m.circle === 'HOME' && m.accessLevel === 'CONTRIBUTE'));
}

/** May they add their OWN day to this family's calendar? Anyone active in it. */
export function canAddOwnOccasion(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId);
}

/** Back-compat name: may they add anything at all (their own day, at least)? */
export function canAddOccasion(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return canAddOwnOccasion(m, familyId);
}

/** May they add THIS draft? Their own day: anyone in the family; anything else: the household. */
export function canAddThisOccasion(
  draft: Pick<OccasionRef, 'familyId' | 'whose' | 'memberAccountId'>,
  m: CalendarMembership | null | undefined,
): boolean {
  if (!activeIn(m, draft.familyId)) return false;
  const own = draft.whose === 'OURS' && draft.memberAccountId === m.accountId;
  return own ? canAddOwnOccasion(m, draft.familyId) : canAddHouseholdOccasion(m, draft.familyId);
}

/** 'creator' changes anything (within the add rules); 'leader' may only narrow it or take it off. */
export type OccasionEditRole = 'creator' | 'leader';
export function occasionEditRole(o: OccasionRef, m: CalendarMembership | null | undefined): OccasionEditRole | null {
  if (!activeIn(m, o.familyId)) return null;
  if (m.accountId === o.createdByAccountId && (isOwnDay(o) || canAddHouseholdOccasion(m, o.familyId))) return 'creator';
  if (m.isOwner) return 'leader';
  return null;
}

/** May they change or take off this day at all? */
export function canChangeOccasion(o: OccasionRef, m: CalendarMembership | null | undefined): boolean {
  return occasionEditRole(o, m) !== null;
}

/**
 * Is this change allowed? The creator: any change that passes the add rules (someone else's stays home). The
 * leader on someone else's addition: only narrower (the same name and date, a narrower share or "someone else's").
 */
export function canMakeOccasionChange(
  o: OccasionRef,
  next: Pick<OccasionRef, 'shareCircle' | 'whose' | 'memberAccountId'> & { sameDetails: boolean },
  m: CalendarMembership | null | undefined,
): boolean {
  const role = occasionEditRole(o, m);
  if (role === null) return false;
  if (role === 'creator') return canAddThisOccasion({ familyId: o.familyId, whose: next.whose, memberAccountId: next.memberAccountId ?? null }, m);
  // leader: never wider, never someone's details
  if (!next.sameDetails) return false;
  if (o.whose === 'SOMEONE_ELSE' && next.whose !== 'SOMEONE_ELSE') return false;
  const before = effectiveOccasionShare(o);
  const after = effectiveOccasionShare(next);
  const ORDER: Circle[] = ['HOME', 'FAMILY', 'EXTENDED'];
  return ORDER.indexOf(after) <= ORDER.indexOf(before);
}

export function canSetCelebrate(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && m.isOwner;
}
