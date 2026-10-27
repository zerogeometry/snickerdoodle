import type { Circle } from '../domain/types';
import type { Membership } from './policy';

/**
 * The family CALENDAR (founder, 27 Oct): who sees a family's dates, and who may add / change them.
 * Name + date only — never a picture — but still the family's own: nothing here is ever public, and
 * every rule starts from an ACTIVE membership in THAT family (the family-scope check, as for assets).
 *
 *  - SEE the calendar: the owner, or a member the owner shared it with (`seesOccasions`).
 *  - SEE an occasion: the calendar, at the circle it's shared with — FAMILY occasions reach the
 *    Family circle only; EXTENDED ones the Extended circle too (tiers nest, as for keepsakes).
 *  - ADD occasions: the owner, or a member who can CONTRIBUTE.
 *  - CHANGE / REMOVE an occasion: the owner, or whoever added it (while they can still contribute).
 *  - "The days we celebrate": the owner alone (it's the family's own choice).
 */
export type CalendarMembership = Membership & { seesOccasions: boolean };
export interface OccasionRef {
  familyId: string;
  shareCircle: Circle;
  createdByAccountId: string;
}

const activeIn = (m: CalendarMembership | null | undefined, familyId: string): m is CalendarMembership =>
  !!m && m.status === 'ACTIVE' && m.familyId === familyId;

export function canSeeFamilyCalendar(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && (m.isOwner || m.seesOccasions);
}

export function canSeeOccasion(o: Pick<OccasionRef, 'familyId' | 'shareCircle'>, m: CalendarMembership | null | undefined): boolean {
  if (!canSeeFamilyCalendar(m, o.familyId)) return false;
  return m!.isOwner || o.shareCircle === 'EXTENDED' || m!.circle === 'FAMILY';
}

export function canAddOccasion(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && (m.isOwner || m.accessLevel === 'CONTRIBUTE');
}

export function canChangeOccasion(o: OccasionRef, m: CalendarMembership | null | undefined): boolean {
  if (!activeIn(m, o.familyId)) return false;
  if (m.isOwner) return true;
  return m.accessLevel === 'CONTRIBUTE' && m.accountId === o.createdByAccountId;
}

export function canSetCelebrate(m: CalendarMembership | null | undefined, familyId: string): boolean {
  return activeIn(m, familyId) && m.isOwner;
}
