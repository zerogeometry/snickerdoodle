import type { Relationship } from '@/domain/types';
import { RELATIONSHIP_WORDS } from './mail/words';
import { containsAbusiveText } from './textSafety';

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

/**
 * A grown-up's display name, cleaned and screened — the ONE rule for a name someone sets for
 * themselves (account page) and the name a parent types when inviting them. Spaces tidied,
 * 1–40 characters, no abusive words. null ⇒ not usable (the caller keeps what it had).
 * (A little one's name has its own, stricter first-name-only rule — never this one.)
 */
export function screenDisplayName(raw: unknown): string | null {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40 || containsAbusiveText(name)) return null;
  return name;
}

/**
 * Is this display name still just the stand-in — empty, or the email's first part (what an
 * account shows before the person ever sets a name)? Then a name the inviting parent gave may
 * replace it. A name the person chose themselves is never "unset".
 */
export function isUnsetDisplayName(displayName: string | null | undefined, email: string): boolean {
  const set = displayName?.trim();
  if (!set) return true;
  const prefix = email.trim().split('@')[0]?.toLowerCase() ?? '';
  return set.toLowerCase() === prefix;
}
