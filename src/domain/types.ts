// Core domain vocabulary shared across authz, the DB schema, and services.
// Enums are `as const` arrays so they drive both TS types and runtime validation.

export const VISIBILITY_TIERS = ['ONLY_ME', 'FAMILY', 'EXTENDED'] as const;
export type VisibilityTier = (typeof VISIBILITY_TIERS)[number];

export const CIRCLES = ['FAMILY', 'EXTENDED'] as const;
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
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'REMOVED', 'LEFT'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
