/**
 * How long a sign-in lasts (founder, 17 Nov 2026). Parents buy every month or two, so Auth.js's default 30 days
 * meant a new email on almost every visit. A sign-in now lasts a year from the LAST visit: each visit (at most once a
 * day) pushes the expiry on again, so a family that keeps coming back never sees the email.
 *
 * Still safe because the sessions live in Postgres (strategy 'database'): removing a member or closing an account
 * deletes their sessions at once (src/server/members.ts, accountClosure.ts), sign-out deletes the row, and widening
 * what the Draw app sends still needs a sign-in in the last 15 minutes (src/lib/freshSignIn.ts).
 */
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60;
/** Refresh the stored expiry at most once a day (Auth.js's own default), so a busy page isn't a write per request. */
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;

export const SESSION_POLICY = {
  strategy: 'database',
  maxAge: SESSION_MAX_AGE_S,
  updateAge: SESSION_UPDATE_AGE_S,
} as const;
