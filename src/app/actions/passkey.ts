'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from 'simplewebauthn-server';
import { getDb } from '@/db/client';
import { accounts, sessions } from '@/db/schema';
import { relyingParty, sessionCookieName } from '@/auth/passkeyConfig';
import { rememberKeepForEmail } from '@/server/keepsakes';
import { finishAddPasskey, finishPasskeySignIn, removePasskey, startAddPasskey, startPasskeySignIn } from '@/server/passkeys';
import { currentSignInAt } from '@/server/freshSignIn';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { PasskeyProblem, PasskeyRow } from '@/lib/passkeys';

/**
 * "Sign in with Face ID" from the page (src/server/passkeys.ts has the rules). Everything is decided here, on the
 * server: who's signed in, which challenge this browser was given, whose passkey it is. The page only relays
 * what the person's device says.
 */

type Fail = { ok: false; reason: PasskeyProblem };

/** This browser's sign-in challenge (httpOnly, five minutes): a signature for a challenge it wasn't given is refused. */
const CHALLENGE_COOKIE = 'sd-passkey-challenge';

async function rp() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return relyingParty(process.env, host ? `${proto.split(',')[0]!.trim()}://${host}` : null);
}

/** "use Face ID" step 1 — signed in only. */
export async function passkeyAddOptionsAction(): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | Fail> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'signed-out' };
  const party = await rp();
  if (!party) return { ok: false, reason: 'unsupported' };
  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.passkeyAddPerAccount, caller: account.id })).ok) return { ok: false, reason: 'busy' };
  // only within 15 minutes of signing in, in this browser (see mayAddPasskey)
  return startAddPasskey(db, account, party, await currentSignInAt(db, account.id));
}

/** "use Face ID" step 2 — keep the new passkey's public key. */
export async function passkeyAddFinishAction(response: RegistrationResponseJSON): Promise<{ ok: true; passkey: PasskeyRow } | Fail> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'signed-out' };
  const party = await rp();
  if (!party) return { ok: false, reason: 'unsupported' };
  const db = getDb();
  const res = await finishAddPasskey(db, account, party, response, (await headers()).get('user-agent'), await currentSignInAt(db, account.id));
  if (res.ok) revalidatePath('/account');
  return res;
}

/** "sign in with Face ID" step 1 — anyone (rate limited per device). */
export async function passkeySignInOptionsAction(): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Fail> {
  const party = await rp();
  if (!party) return { ok: false, reason: 'unsupported' };
  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.passkeySignInPerIp, caller: await clientIp() })).ok) return { ok: false, reason: 'busy' };
  const options = await startPasskeySignIn(db, party);
  const { secure } = sessionCookieName(process.env, (await headers()).get('x-forwarded-proto'));
  (await cookies()).set(CHALLENGE_COOKIE, options.challenge, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: 5 * 60 });
  return { ok: true, options };
}

/**
 * "sign in with Face ID" step 2 — checks the signature and signs this browser in: the same database session and the
 * same cookie Auth.js would set. A drawing a guest asked to keep (`keepId`) is remembered for the account, exactly as
 * the email form does, and finished back on the page they land on (this browser still holds its upload claim).
 */
export async function passkeySignInFinishAction(response: AuthenticationResponseJSON, keepId?: string | null): Promise<{ ok: true } | Fail> {
  const party = await rp();
  if (!party) return { ok: false, reason: 'unsupported' };
  const jar = await cookies();
  const browserChallenge = jar.get(CHALLENGE_COOKIE)?.value ?? null;
  jar.delete(CHALLENGE_COOKIE);
  const db = getDb();
  const res = await finishPasskeySignIn(db, party, response, browserChallenge);
  if (!res.ok) return res;
  const cookie = sessionCookieName(process.env, (await headers()).get('x-forwarded-proto'));
  // a sign-in this browser already had (theirs, or someone else's on a shared tablet) ends here — one at a time
  const before = jar.get(cookie.name)?.value;
  if (before) await db.delete(sessions).where(eq(sessions.sessionToken, before));
  jar.set(cookie.name, res.sessionToken, { httpOnly: true, sameSite: 'lax', path: '/', secure: cookie.secure, expires: res.expires });
  if (typeof keepId === 'string' && keepId) {
    const [a] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, res.accountId));
    if (a) await rememberKeepForEmail(db, { assetId: keepId, email: a.email, uploadClaims: await getUploadClaims() }).catch(() => false);
  }
  return { ok: true };
}

/** "remove" on the account page — only the signed-in person's own passkey. */
export async function removePasskeyAction(passkeyId: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account || typeof passkeyId !== 'string') return { ok: false };
  const res = await removePasskey(getDb(), account.id, passkeyId);
  if (res.ok) revalidatePath('/account');
  return res;
}
