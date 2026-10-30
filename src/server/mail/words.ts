import type { AccessLevel, Circle, Relationship } from '@/domain/types';

/**
 * Plain words the family emails share (sweep 04). Nothing here ever names a child or a keepsake —
 * these emails only ever talk about the person they're sent to and the parent, by first name.
 */

/** A first name only, from an account's display name ("Sam Hartley" → "Sam"); null when there isn't one. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first && /^[\p{L}][\p{L}'’-]{0,39}$/u.test(first) ? first : null;
}

/**
 * How an email names a family: by the parent's first name ("Sam’s family"), never by the family's
 * own name — that's often a surname ("The Hartleys"), and emails carry no surnames.
 */
export function familyLabel(ownerFirstName: string | null): string {
  return ownerFirstName ? `${ownerFirstName}’s family` : 'a family';
}

export const RELATIONSHIP_WORDS: Record<Relationship, string> = {
  CHILD: 'little one',
  PARENT: 'parent',
  GRANDPARENT: 'grandparent',
  AUNT_UNCLE: 'aunt or uncle',
  CLOSE_FRIEND: 'close friend',
  OTHER: 'family friend',
};

/** What a circle means, in one plain sentence about what you see. */
export function circleWords(circle: Circle): string {
  return circle === 'FAMILY'
    ? 'in the Family circle — the keepsakes shared with the family, and the Extended ones too'
    : 'in the Extended family circle — the keepsakes shared with Extended family';
}

/** What an access level lets you do. */
export function accessWords(access: AccessLevel): string {
  return access === 'CONTRIBUTE' ? 'look, order gifts and add drawings' : access === 'VIEW_BUY' ? 'look and order gifts' : 'look';
}
