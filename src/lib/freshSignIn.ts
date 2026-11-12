/**
 * "Sign in again first" (DPIA A-63, founder 12 Nov 2026): widening what the Draw app sends from the account page needs a
 * sign-in in the last FRESH_SIGN_IN_MS. A child on a family tablet where the grown-up's browser stays signed in can't
 * turn "all drawings" on: a fresh sign-in needs the grown-up's own email. Narrowing and stopping never ask.
 */
export const FRESH_SIGN_IN_MS = 15 * 60_000;

/** Whether a sign-in at `signedInAt` still counts as fresh at `now`. A missing time never does. */
export function isFreshSignIn(signedInAt: Date | null | undefined, now = new Date()): boolean {
  if (!signedInAt) return false;
  const age = now.getTime() - signedInAt.getTime();
  return age >= -60_000 && age <= FRESH_SIGN_IN_MS;
}
