// The only public surface of the central authorization module.
// Every asset read, every signed-URL mint, and every mutation goes through here.
export {
  canViewAsset,
  assertCanViewAsset,
  childParentOf,
  effectiveVisibility,
  isAdderOrChildParent,
  originatorOf,
  AuthzError,
  type AssetRef,
  type Membership,
  type ViewerContext,
  type Decision,
} from './policy';

export {
  canBuyAsset,
  canBuyFromGiftList,
  canEditAsset,
  canPurchaseViaGiftLink,
  type GiftLinkAssetRef,
  type GiftLinkGrant,
  canContributeCreations,
  canDeleteAsset,
  canManageFamily,
  canSetAssetVisibility,
  giftLinkAudience,
  giftLinkShows,
  planVisibilityChange,
  visibilityChoicesFor,
  type VisibilityChoices,
  type VisibilityPlan,
  type VisibilityRole,
} from './actions';

export { circleSees, effectiveCircle, isNarrower, narrowerCircle, narrowerTier, tierRank } from './tiers';

export { canViewProfileImage, PROFILE_PICTURE_TIER, type FamilySeat, type ProfileImageRef, type ProfileViewer } from './profileImages';

export { canReview, hashCheckSkipped, hashDeferredSensitive, reviewRemoveOnly, HASH_UNCHECKED_LABEL, SCREENING_NOT_CONFIGURED_LABEL, type Reviewer, type ReviewAction, type ReviewSubject } from './review';

export {
  canAddHouseholdOccasion,
  canAddOccasion,
  canAddOwnOccasion,
  canAddThisOccasion,
  canChangeOccasion,
  canMakeOccasionChange,
  canSeeFamilyCalendar,
  canSeeOccasion,
  canSetCelebrate,
  effectiveOccasionShare,
  isOwnDay,
  occasionEditRole,
  occasionShareChoices,
  seesOccasionDetail,
  type CalendarMembership,
  type OccasionEditRole,
  type OccasionRef,
} from './occasions';
