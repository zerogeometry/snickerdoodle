import { describe, it, expect } from 'vitest';
import { visibilityTier, circle, accessLevel, relationship, membershipStatus } from '../schema';
import {
  VISIBILITY_TIERS,
  CIRCLES,
  ACCESS_LEVELS,
  RELATIONSHIPS,
  MEMBERSHIP_STATUSES,
} from '../../domain/types';

// The DB enums duplicate the domain vocabulary (pgEnum needs a literal tuple).
// These assertions fail CI if the two ever drift apart.
describe('DB enums stay in sync with the domain vocabulary', () => {
  it('visibility_tier', () => expect(visibilityTier.enumValues).toEqual([...VISIBILITY_TIERS]));
  it('circle', () => expect(circle.enumValues).toEqual([...CIRCLES]));
  it('access_level', () => expect(accessLevel.enumValues).toEqual([...ACCESS_LEVELS]));
  it('relationship', () => expect(relationship.enumValues).toEqual([...RELATIONSHIPS]));
  it('membership_status', () => expect(membershipStatus.enumValues).toEqual([...MEMBERSHIP_STATUSES]));
});
