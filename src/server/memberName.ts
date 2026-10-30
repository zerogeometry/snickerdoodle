import type { Relationship } from '@/domain/types';
import { RELATIONSHIP_WORDS } from './mail/words';

/**
 * The name a family member goes by on screen. Their own display name when they've set one.
 * Otherwise the email's first part — but ONLY for themselves and the parent who invited that
 * address; everyone else sees what they are to the family ("grandparent", "aunt or uncle"), so an
 * email handle (often a full name) is never shown round the whole family (sweep 04-B9).
 */
export function memberName(
  account: { displayName: string | null; email: string },
  relationship: Relationship,
  seen: { byThemself: boolean; byParent: boolean },
): string {
  const set = account.displayName?.trim();
  if (set) return set;
  if (seen.byThemself || seen.byParent) return account.email.split('@')[0] || 'member';
  return RELATIONSHIP_WORDS[relationship] ?? 'family member';
}
