import type { Circle } from '../domain/types';
import type { Decision } from './policy';
import { circleSees, effectiveCircle } from './tiers';

/** A profile picture / profile header / family banner, as authz needs it (resolved server-side). */
export interface ProfileImageRef {
  kind: 'AVATAR' | 'ACCOUNT_HEADER' | 'FAMILY_BANNER';
  /** The person it belongs to (AVATAR / ACCOUNT_HEADER) or who uploaded it (FAMILY_BANNER). */
  accountId: string;
  /** FAMILY_BANNER: the family it belongs to. */
  familyId: string | null;
  moderationStatus: string;
  /** AVATAR / ACCOUNT_HEADER: the families the OWNER is an ACTIVE member of. */
  ownerFamilyIds: readonly string[];
}

/** A family someone is ACTIVE in, and their seat in it. */
export interface FamilySeat {
  familyId: string;
  circle: Circle;
  isOwner: boolean;
}

/** Who is looking: their account (null = signed out) and the families they're ACTIVE in (with their circle there). */
export interface ProfileViewer {
  accountId: string | null;
  activeFamilies: readonly FamilySeat[];
}

/** A person's picture / header counts as a FAMILY-level picture in each family you share (D27). */
export const PROFILE_PICTURE_TIER = 'FAMILY' as const;

/**
 * Who may see a profile picture, profile header or family banner. They can show children, so the
 * same rules as everything else: nothing is public, and only people in your circle see them.
 *  - CSAM-blocked → nobody, ever (not even the uploader).
 *  - A person's picture/header → themselves always; otherwise (D27, founder 10 Nov 2026: circle rules, not "shares
 *    any family") only someone in the HOME or FAMILY circle of a family they're both ACTIVE in — as a family-level
 *    keepsake would be — and only once it has cleared screening. Extended relatives see initials. Person to person:
 *    nobody reaches it through a third family.
 *  - A family banner → ACTIVE members of that family; anyone but the uploader only once cleared.
 */
export function canViewProfileImage(image: ProfileImageRef, viewer: ProfileViewer): Decision {
  if (image.moderationStatus === 'BLOCKED') return { allowed: false, reason: 'blocked content is never shown' };
  if (viewer.accountId === null) return { allowed: false, reason: 'signed out — nothing is public' };
  const isUploader = viewer.accountId === image.accountId;
  const cleared = image.moderationStatus === 'CLEAR';

  if (image.kind === 'FAMILY_BANNER') {
    if (!image.familyId || !viewer.activeFamilies.some((f) => f.familyId === image.familyId)) return { allowed: false, reason: 'not an active member of this family' };
    if (!cleared && !isUploader) return { allowed: false, reason: 'not yet cleared by screening' };
    return { allowed: true, reason: 'active member of the family' };
  }

  if (isUploader) return { allowed: true, reason: 'your own picture' };
  if (!cleared) return { allowed: false, reason: 'not yet cleared by screening' };
  const seat = viewer.activeFamilies.find((f) => image.ownerFamilyIds.includes(f.familyId) && circleSees(effectiveCircle(f), PROFILE_PICTURE_TIER));
  return seat
    ? { allowed: true, reason: 'you share a family, in its home or family circle' }
    : { allowed: false, reason: 'no family in common where your circle sees family-level pictures' };
}
