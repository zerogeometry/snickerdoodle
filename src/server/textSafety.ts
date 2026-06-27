/**
 * Minimal text safety for user-supplied strings tied to children. A child is named
 * by FIRST NAME ONLY (never a surname) and screened for obvious abuse before it is
 * stored or shown anywhere — the children's-data + content-safety rules in
 * CLAUDE.md. This is a deliberately small, deterministic server gate (not the image
 * moderation pipeline); it is the load-bearing screen for the name fields and is
 * reusable for member names / gift messages.
 */

// Unambiguous profanity / slurs that must never appear in a child's name field.
// Kept short + strong and matched as a substring of a single name token, which
// avoids the Scunthorpe problem on legitimate names.
const ABUSE = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'piss',
  'nigger', 'faggot', 'whore', 'slut', 'rape', 'wank', 'twat',
];

/** True if the text contains obvious abusive language. */
export function containsAbusiveText(raw: string): boolean {
  const s = raw.toLowerCase();
  return ABUSE.some((w) => s.includes(w));
}

export type NameScreen =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'surname' | 'invalid' | 'length' | 'abuse' };

// A single first-name token: letters/marks (any script), apostrophe, hyphen.
const NAME_TOKEN = /^[\p{L}\p{M}'’-]+$/u;
const MAX_FIRST_NAME = 24;

/**
 * Screen a child's FIRST NAME. Empty → ok with null (no subject). Otherwise it must
 * be a single token (any whitespace ⇒ a surname ⇒ rejected), within length, made of
 * name-like characters only, and free of abusive language. Returns the trimmed name.
 */
export function screenChildFirstName(raw: string | null | undefined): NameScreen {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_FIRST_NAME) return { ok: false, reason: 'length' };
  if (/\s/.test(trimmed)) return { ok: false, reason: 'surname' };
  if (!NAME_TOKEN.test(trimmed)) return { ok: false, reason: 'invalid' };
  if (containsAbusiveText(trimmed)) return { ok: false, reason: 'abuse' };
  return { ok: true, value: trimmed };
}
