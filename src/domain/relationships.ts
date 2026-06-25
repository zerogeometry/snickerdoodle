import type { Circle, Relationship } from './types';

/**
 * Relationship sets a member's DEFAULT circle (docs/04):
 *   Parent / Child  -> Family
 *   Grandparent / Aunt-uncle / Close friend / Other -> Extended
 * The controller can override this default at invite time.
 *
 * (Children are subjects, not account holders, so CHILD never produces a real
 * membership — but the mapping is defined for completeness and matches docs/04.)
 */
export function defaultCircleFor(relationship: Relationship): Circle {
  switch (relationship) {
    case 'PARENT':
    case 'CHILD':
      return 'FAMILY';
    case 'GRANDPARENT':
    case 'AUNT_UNCLE':
    case 'CLOSE_FRIEND':
    case 'OTHER':
      return 'EXTENDED';
  }
}
