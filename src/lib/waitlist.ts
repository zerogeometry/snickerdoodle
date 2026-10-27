/**
 * The "hear about new things first" email list — the bits the form and the server share (client-safe).
 * PECR: marketing email only with a specific, informed, unticked, separate tick-box, confirmed by
 * double opt-in. Email address only — never a name, never anything about a child.
 */

/** Bump the version whenever the wording changes: the version a person ticked is their evidence. */
export const WAITLIST_CONSENT_VERSION = 'waitlist-2026-10-26';
export const WAITLIST_CONSENT_WORDING =
  'Yes, email me snickerdoodle news — new keepsakes first, and the odd peek behind the scenes (a couple of emails a month, at most). I can unsubscribe in one tap, any time.';

const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\].]{2,}$/;

/** Trimmed + lowercased, or null when it isn't a plausible email address. */
export function normaliseWaitlistEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL.test(email)) return null;
  const [local, domain] = email.split('@') as [string, string];
  if (local.length > 64 || domain.startsWith('.') || domain.includes('..') || local.startsWith('.') || local.endsWith('.')) return null;
  return email;
}

export type WaitlistJoinReason = 'invalid-email' | 'needs-consent' | 'too-many' | 'error';
