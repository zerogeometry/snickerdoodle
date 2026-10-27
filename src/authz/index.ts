// The only public surface of the central authorization module.
// Every asset read, every signed-URL mint, and every mutation goes through here.
export {
  canViewAsset,
  assertCanViewAsset,
  AuthzError,
  type AssetRef,
  type Membership,
  type ViewerContext,
  type Decision,
} from './policy';

export {
  canBuyFromGiftList,
  canPurchaseViaGiftLink,
  type GiftLinkAssetRef,
  type GiftLinkGrant,
  canContributeCreations,
  canDeleteAsset,
  canManageFamily,
  canSetAssetVisibility,
} from './actions';

export { canViewProfileImage, type ProfileImageRef, type ProfileViewer } from './profileImages';

export { canReview, hashCheckSkipped, HASH_UNCHECKED_LABEL, type Reviewer, type ReviewAction, type ReviewSubject } from './review';

export {
  canAddOccasion,
  canChangeOccasion,
  canSeeFamilyCalendar,
  canSeeOccasion,
  canSetCelebrate,
  type CalendarMembership,
  type OccasionRef,
} from './occasions';
