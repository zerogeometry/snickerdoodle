import type { Circle, Relationship } from './types';

/**
 * Relationship sets a member's DEFAULT circle (docs/04; D27, founder 10 Nov 2026):
 *   Parent (partner / co-parent) / Grown-up child -> Home
 *   Grandparent / Aunt-uncle / Close friend / Other -> Extended
 * The leader can choose a different circle at invite time ({@link circlesFor} says which), and change it later.
 *
 * (Children are subjects, not account holders, so CHILD never produces a real membership — it maps to the most
 * private circle for completeness and is refused by every invite path.)
 */
export function defaultCircleFor(relationship: Relationship): Circle {
  switch (relationship) {
    case 'PARENT':
    case 'ADULT_CHILD':
    case 'CHILD':
      return 'HOME';
    case 'GRANDPARENT':
    case 'AUNT_UNCLE':
    case 'CLOSE_FRIEND':
    case 'OTHER':
      return 'EXTENDED';
  }
}

/** Home is the household: the leader, a partner / co-parent, grown-up children — nobody else (D27). */
export const HOME_RELATIONSHIPS: ReadonlySet<Relationship> = new Set<Relationship>(['PARENT', 'ADULT_CHILD']);

/** The circles a leader may put someone of this relationship in (closest first). */
export function circlesFor(relationship: Relationship): Circle[] {
  if (relationship === 'CHILD') return [];
  return HOME_RELATIONSHIPS.has(relationship) ? ['HOME', 'FAMILY', 'EXTENDED'] : ['FAMILY', 'EXTENDED'];
}

/** May someone of this relationship be in this circle? */
export const circleAllowedFor = (relationship: Relationship, circle: Circle): boolean => circlesFor(relationship).includes(circle);
