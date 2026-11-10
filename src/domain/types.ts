// Core domain vocabulary shared across authz, the DB schema, and services.
// Enums are `as const` arrays so they drive both TS types and runtime validation.

/** Narrowest first (D27, founder 10 Nov 2026): only me < home < family < extended. Nothing is ever public. */
export const VISIBILITY_TIERS = ['ONLY_ME', 'HOME', 'FAMILY', 'EXTENDED'] as const;
export type VisibilityTier = (typeof VISIBILITY_TIERS)[number];

/** A member's circle, closest first: home (the leader, partner / co-parent, grown-up children) < family < extended. */
export const CIRCLES = ['HOME', 'FAMILY', 'EXTENDED'] as const;
export type Circle = (typeof CIRCLES)[number];

export const ACCESS_LEVELS = ['VIEW', 'VIEW_BUY', 'CONTRIBUTE'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const RELATIONSHIPS = [
  'CHILD',
  'PARENT',
  'GRANDPARENT',
  'AUNT_UNCLE',
  'CLOSE_FRIEND',
  'OTHER',
  // a grown-up son or daughter (an adult account holder). A little one (CHILD) is never invited.
  'ADULT_CHILD',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'REMOVED', 'LEFT'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Whose day an occasion is (D27): mine / ours (the household's own) or someone else's (never shared beyond home). */
export const OCCASION_WHOSE = ['OURS', 'SOMEONE_ELSE'] as const;
export type OccasionWhose = (typeof OCCASION_WHOSE)[number];
