import type { Decision } from './policy';

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

/** Who is looking: their account (null = signed out) and the families they're ACTIVE in. */
export interface ProfileViewer {
  accountId: string | null;
  activeFamilyIds: readonly string[];
}

/**
 * Who may see a profile picture, profile header or family banner. They can show children, so the
 * same rules as everything else: nothing is public, and only people in your circle see them.
 *  - CSAM-blocked → nobody, ever (not even the uploader).
 *  - A person's picture/header → themselves always; otherwise only someone who shares an ACTIVE
 *    family with them, and only once it has cleared screening.
 *  - A family banner → ACTIVE members of that family; anyone but the uploader only once cleared.
 */
export function canViewProfileImage(image: ProfileImageRef, viewer: ProfileViewer): Decision {
  if (image.moderationStatus === 'BLOCKED') return { allowed: false, reason: 'blocked content is never shown' };
  if (viewer.accountId === null) return { allowed: false, reason: 'signed out — nothing is public' };
  const isUploader = viewer.accountId === image.accountId;
  const cleared = image.moderationStatus === 'CLEAR';

  if (image.kind === 'FAMILY_BANNER') {
    if (!image.familyId || !viewer.activeFamilyIds.includes(image.familyId)) return { allowed: false, reason: 'not an active member of this family' };
    if (!cleared && !isUploader) return { allowed: false, reason: 'not yet cleared by screening' };
    return { allowed: true, reason: 'active member of the family' };
  }

  if (isUploader) return { allowed: true, reason: 'your own picture' };
  if (!cleared) return { allowed: false, reason: 'not yet cleared by screening' };
  const shared = image.ownerFamilyIds.some((f) => viewer.activeFamilyIds.includes(f));
  return shared ? { allowed: true, reason: 'you share a family' } : { allowed: false, reason: 'no family in common' };
}
