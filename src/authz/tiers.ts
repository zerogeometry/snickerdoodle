import type { Circle, VisibilityTier } from '../domain/types';

/**
 * The tier ladder (D27, founder 10 Nov 2026) — narrowest first:
 *
 *   ONLY_ME < HOME < FAMILY < EXTENDED
 *
 * and the circles that see each rung (tiers nest):
 *   HOME circle     sees HOME · FAMILY · EXTENDED
 *   FAMILY circle   sees FAMILY · EXTENDED
 *   EXTENDED circle sees EXTENDED only
 * ONLY_ME is never reached through a circle (only the people the rule names). Nothing is ever public.
 *
 * Every "can this circle see this tier?" question in the app is answered HERE, so keepsakes, occasions, gift links
 * and profile pictures can never disagree.
 */
const RANK: Record<VisibilityTier, number> = { ONLY_ME: 0, HOME: 1, FAMILY: 2, EXTENDED: 3 };
const CIRCLE_RANK: Record<Circle, number> = { HOME: 1, FAMILY: 2, EXTENDED: 3 };

export const tierRank = (t: VisibilityTier): number => RANK[t] ?? -1;

/** Does a member in this circle see something shared at this tier? (Unknown values → no.) */
export function circleSees(circle: Circle, tier: VisibilityTier): boolean {
  const c = CIRCLE_RANK[circle];
  const t = RANK[tier];
  if (c === undefined || t === undefined || t === 0) return false;
  return c <= t;
}

/** The narrower of two tiers (null = no limit). */
export function narrowerTier(a: VisibilityTier, b: VisibilityTier | null | undefined): VisibilityTier {
  if (b == null) return a;
  return tierRank(b) < tierRank(a) ? b : a;
}

/** Is `next` strictly narrower than `current`? */
export const isNarrower = (next: VisibilityTier, current: VisibilityTier): boolean => tierRank(next) < tierRank(current);

/** The circle as a tier (HOME → HOME …) — the widest a link or share for that circle reaches. */
export const tierForCircle = (c: Circle): VisibilityTier => c;

/** The family leader is always in home, whatever their stored circle says. */
export function effectiveCircle(m: { circle: Circle; isOwner: boolean }): Circle {
  return m.isOwner ? 'HOME' : m.circle;
}

/** The narrower of two circles (a member's link never shows more than their circle does today). */
export function narrowerCircle(a: Circle, b: Circle | null | undefined): Circle {
  if (b == null) return a;
  return CIRCLE_RANK[b] > CIRCLE_RANK[a] ? b : a;
}
