import { activeMembershipFor, childParentOf, originatorOf, type AssetRef, type ViewerContext } from './policy';

/**
 * FILING a keepsake into a little one's corner (founder, 17 Nov 2026: "only whoever added it").
 *
 * Filing is not just tidying: a keepsake filed under a child is CONTROLLED by that child's parent, who then
 * always sees it and may make it more private or take it off (D27). So moving it changes who has a say, and
 * it goes through here, never around it:
 *
 *  - NOT in someone else's child's corner yet (unfiled, or in a corner of the adder's own little one):
 *    only WHOEVER ADDED IT may file it — under any little one in the SAME family, or take it out again.
 *  - IN a corner of a child whose parent is someone else: only THAT PARENT may move it, and only to another of
 *    their OWN little ones (the adder can't take it out of the parent's hands; the parent can't hand it to a
 *    different parent, and can't drop the say they were given).
 *  - Nobody else: not the family leader, not a CONTRIBUTE relative, not a removed member, not another family.
 *  - Whoever added it stays whoever added it (filing never rewrites the originator), and who sees it never
 *    gets wider: the adder's choice is untouched and the parent's ceiling travels with it.
 */

/** A little one a keepsake could be filed under. */
export interface ChildRef {
  id: string;
  familyId: string;
  /** The child's controlling parent. */
  controllerAccountId: string;
}

export interface FilingChoices {
  /** The little ones this viewer may file it under (its current corner included, when allowed). */
  childIds: string[];
  /** May take it out of its corner ("not filed yet") — only the adder, while no other parent has a say. */
  canUnfile: boolean;
}

/** The fields a filing writes: the corner, its controller, and the parent's ceiling. */
export interface FilingPatch {
  childSubjectId: string | null;
  controllerAccountId: string;
  parentLimit: AssetRef['parentLimit'];
}

export type FilingPlan = { allowed: true; patch: FilingPatch } | { allowed: false; reason: string };

/** Where this viewer may file this keepsake — null when they may not file it at all. */
export function filingChoicesFor(asset: AssetRef & { childSubjectId: string | null }, viewer: ViewerContext, kids: ChildRef[]): FilingChoices | null {
  if (asset.ephemeralClaimId != null || asset.familyId === null) return null; // a guest's draft is kept first
  if (activeMembershipFor(asset, viewer) === null || viewer.accountId === null) return null;
  const sameFamily = kids.filter((c) => c.familyId === asset.familyId);
  const otherParent = childParentOf(asset);
  if (otherParent === null) {
    if (viewer.accountId !== originatorOf(asset)) return null;
    // a family handed over (no uploader recorded) is the controller's own: they may file under their own little
    // ones only — filing under another parent's child would make THAT parent the originator
    const kidsOk = asset.uploaderAccountId === null ? sameFamily.filter((c) => c.controllerAccountId === asset.controllerAccountId) : sameFamily;
    return { childIds: kidsOk.map((c) => c.id), canUnfile: true };
  }
  if (viewer.accountId !== otherParent) return null;
  return { childIds: sameFamily.filter((c) => c.controllerAccountId === otherParent).map((c) => c.id), canUnfile: false };
}

/** The change to store to file it under `child` (null = take it out of its corner), or a deny. */
export function planFiling(asset: AssetRef & { childSubjectId: string | null }, viewer: ViewerContext, child: ChildRef | null, kids: ChildRef[]): FilingPlan {
  const choices = filingChoicesFor(asset, viewer, child ? [...kids.filter((k) => k.id !== child.id), child] : kids);
  if (!choices) return { allowed: false, reason: 'only whoever added it, or the little one’s parent, may file it' };
  if (child === null) {
    if (!choices.canUnfile) return { allowed: false, reason: 'it’s in a little one’s corner — only their parent can move it, to another of their own' };
  } else if (child.familyId !== asset.familyId || !choices.childIds.includes(child.id)) {
    return { allowed: false, reason: 'not a little one this keepsake can be filed under' };
  }
  const originator = originatorOf(asset);
  if (originator === null) return { allowed: false, reason: 'no one is in charge of this keepsake' };
  const controllerAccountId = child ? child.controllerAccountId : originator;
  // defence in depth: filing never changes who added it
  if (originatorOf({ uploaderAccountId: asset.uploaderAccountId, controllerAccountId }) !== originator) {
    return { allowed: false, reason: 'filing can’t change who added it' };
  }
  return {
    allowed: true,
    patch: {
      childSubjectId: child?.id ?? null,
      controllerAccountId,
      // the same parent keeps their ceiling; with no other parent, there's no ceiling to keep
      parentLimit: controllerAccountId === originator ? null : controllerAccountId === asset.controllerAccountId ? asset.parentLimit : null,
    },
  };
}
