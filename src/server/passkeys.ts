import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from 'simplewebauthn-server';
import { decodeClientDataJSON, isoBase64URL, isoUint8Array } from 'simplewebauthn-server/helpers';
import { accounts, auditRecords, passkeyChallenges, passkeys, sessions } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import type { RelyingParty } from '@/auth/passkeyConfig';
import { SESSION_MAX_AGE_S } from '@/auth/sessionPolicy';
import { passkeyDeviceLabel, type PasskeyRow } from '@/lib/passkeys';
import { isFreshSignIn } from '@/lib/freshSignIn';

/**
 * "Sign in with Face ID" — passkeys next to the email sign-in (founder, 17 Nov 2026), on @simplewebauthn directly.
 *
 * Why not Auth.js's own passkey provider: it's experimental, it wants an OAuth-style linked-accounts table our adapter
 * deliberately doesn't have (src/auth/adapter.ts), and signed out it would MAKE an account from a typed email with no
 * email check. Here a passkey can only be ADDED by someone already signed in by email, and a passkey sign-in makes the
 * same database session Auth.js makes (a `sessions` row + its cookie), so everything that reads or ends sessions —
 * sign-out, member removal, account closure, the A-63 fresh-sign-in check — works unchanged.
 *
 * Trust: we keep only the PUBLIC key, its id, a counter and a plain device label. The face or fingerprint never leaves
 * the person's device (WebAuthn doesn't send it), so nothing biometric is ever stored. The device must check it's
 * them (userVerification 'required'), every time.
 */

const CHALLENGE_TTL_MS = 5 * 60_000;
type Purpose = 'add' | 'sign-in';

export type PasskeyFail = { ok: false; reason: 'expired' | 'unknown' | 'failed' | 'sign-in-again' };

export type { PasskeyRow };

/** 32 random bytes — handed to @simplewebauthn as bytes (a string it would re-encode), kept as the base64url the
 * browser signs and sends back. */
async function newChallenge(db: DbHandle, purpose: Purpose, accountId: string | null, now: Date): Promise<Uint8Array<ArrayBuffer>> {
  // tidy: anything older than its five minutes can go (indexed on expires)
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expires, now));
  const bytes = new Uint8Array(new ArrayBuffer(32));
  bytes.set(randomBytes(32));
  await db.insert(passkeyChallenges).values({ challenge: isoBase64URL.fromBuffer(bytes), purpose, accountId, expires: new Date(now.getTime() + CHALLENGE_TTL_MS) });
  return bytes;
}

/** Used once: deleted as it's checked. Only for its purpose, its five minutes, and (adding) the same person. */
async function spendChallenge(db: DbHandle, challenge: string, purpose: Purpose, accountId: string | null, now: Date): Promise<boolean> {
  const rows = await db
    .delete(passkeyChallenges)
    .where(
      and(
        eq(passkeyChallenges.challenge, challenge),
        eq(passkeyChallenges.purpose, purpose),
        gt(passkeyChallenges.expires, now),
        ...(accountId ? [eq(passkeyChallenges.accountId, accountId)] : []),
      ),
    )
    .returning({ c: passkeyChallenges.challenge });
  return rows.length === 1;
}

/** The challenge the browser says it signed (still checked against the signature by @simplewebauthn). */
function signedChallenge(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== 'string') return null;
  try {
    const c = decodeClientDataJSON(clientDataJSON).challenge;
    return typeof c === 'string' && c.length > 0 && c.length <= 200 ? c : null;
  } catch {
    return null;
  }
}

const transportsOf = (t: unknown): AuthenticatorTransportFuture[] | undefined =>
  Array.isArray(t) ? (t.filter((x) => typeof x === 'string').slice(0, 8) as AuthenticatorTransportFuture[]) : undefined;

// ── adding one (signed in) ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Adding one needs a sign-in in this browser in the last 15 minutes (A-63's rule, src/lib/freshSignIn.ts) — the card
 * after an email sign-in always is. Otherwise a little one on a family tablet that stays signed in could add one with
 * the tablet's own PIN, then use it as a "fresh" sign-in to turn on what the Draw app sends.
 */
export const mayAddPasskey = (signedInAt: Date | null, now = new Date()) => isFreshSignIn(signedInAt, now);

/** Step 1 of "use Face ID": what the device needs to make a passkey for this account. */
export async function startAddPasskey(
  db: DbHandle,
  account: { id: string; email: string; name: string | null },
  rp: RelyingParty,
  signedInAt: Date | null,
  now = new Date(),
): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; reason: 'sign-in-again' }> {
  if (!mayAddPasskey(signedInAt, now)) return { ok: false, reason: 'sign-in-again' };
  const existing = await db.select({ id: passkeys.credentialId, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.accountId, account.id));
  const challenge = await newChallenge(db, 'add', account.id, now);
  const options = await generateRegistrationOptions({
    rpName: 'snickerdoodle',
    rpID: rp.rpID,
    // the account's own id (not their email) is what the passkey carries back
    userID: isoUint8Array.fromUTF8String(account.id),
    // what their phone's password list shows: their own email, on their own device
    userName: account.email,
    userDisplayName: account.name ?? account.email,
    challenge,
    attestationType: 'none',
    // the same device twice would be two rows for one key
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  });
  return { ok: true, options };
}

/** Step 2: check what the device made, keep its public key, log it. */
export async function finishAddPasskey(
  db: DbHandle,
  account: { id: string },
  rp: RelyingParty,
  response: RegistrationResponseJSON,
  userAgent: string | null,
  signedInAt: Date | null,
  now = new Date(),
): Promise<{ ok: true; passkey: PasskeyRow } | PasskeyFail> {
  if (!mayAddPasskey(signedInAt, now)) return { ok: false, reason: 'sign-in-again' };
  const challenge = signedChallenge(response?.response?.clientDataJSON);
  if (!challenge || !(await spendChallenge(db, challenge, 'add', account.id, now))) return { ok: false, reason: 'expired' };
  let info;
  try {
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
    if (!v.verified) return { ok: false, reason: 'failed' };
    info = v.registrationInfo;
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const deviceLabel = passkeyDeviceLabel(userAgent, info.aaguid);
  const [row] = await db
    .insert(passkeys)
    .values({
      accountId: account.id,
      credentialId: info.credential.id,
      publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
      counter: info.credential.counter,
      transports: transportsOf(info.credential.transports ?? response.response.transports) ?? null,
      deviceLabel,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, reason: 'failed' }; // that key is already on an account
  await db.insert(auditRecords).values({
    actorAccountId: account.id,
    actorType: 'MEMBER',
    event: 'PASSKEY_ADDED',
    targetType: 'passkey',
    targetId: row.id,
    metadata: { device: deviceLabel },
  });
  return { ok: true, passkey: toRow(row) };
}

// ── signing in with one (signed out) ──────────────────────────────────────────────────────────────────────────────

/** Step 1 of "sign in with Face ID": a one-time challenge for whichever passkey the device offers. */
export async function startPasskeySignIn(db: DbHandle, rp: RelyingParty, now = new Date()): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const challenge = await newChallenge(db, 'sign-in', null, now);
  // no allow-list: the device offers the snickerdoodle passkeys it holds, so there's no email to type
  return generateAuthenticationOptions({ rpID: rp.rpID, challenge, userVerification: 'required' });
}

/**
 * Step 2: check the signature against the stored public key, then start a sign-in exactly as the email link does —
 * a `sessions` row (made now, so it counts as a fresh sign-in for A-63) whose token goes in Auth.js's cookie.
 * `browserChallenge` is the challenge this browser was given (its own cookie): a signature for any other is refused.
 */
export async function finishPasskeySignIn(
  db: DbHandle,
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  browserChallenge: string | null,
  now = new Date(),
): Promise<{ ok: true; accountId: string; sessionToken: string; expires: Date } | PasskeyFail> {
  const challenge = signedChallenge(response?.response?.clientDataJSON);
  if (!challenge || challenge !== browserChallenge || !(await spendChallenge(db, challenge, 'sign-in', null, now))) return { ok: false, reason: 'expired' };
  if (typeof response.id !== 'string' || response.id.length > 1400) return { ok: false, reason: 'unknown' };
  const [found] = await db
    .select({ key: passkeys, email: accounts.email, verified: accounts.emailVerifiedAt })
    .from(passkeys)
    .innerJoin(accounts, eq(passkeys.accountId, accounts.id))
    .where(eq(passkeys.credentialId, response.id));
  // removed on the account page (or with a removal / closed account), or never ours
  if (!found) return { ok: false, reason: 'unknown' };
  // a closed account can never sign in again (its passkeys are deleted with it; belt and braces)
  if (!found.verified || found.email.endsWith('@closed.invalid')) return { ok: false, reason: 'unknown' };
  // the passkey says whose it is; it must be the account it was added to
  if (response.response.userHandle) {
    let handle: string | null = null;
    try {
      handle = isoUint8Array.toUTF8String(isoBase64URL.toBuffer(response.response.userHandle));
    } catch {
      handle = null;
    }
    if (handle !== found.key.accountId) return { ok: false, reason: 'failed' };
  }
  let newCounter: number;
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: found.key.credentialId,
        publicKey: isoBase64URL.toBuffer(found.key.publicKey),
        counter: found.key.counter,
        transports: transportsOf(found.key.transports),
      },
    });
    if (!v.verified) return { ok: false, reason: 'failed' };
    newCounter = v.authenticationInfo.newCounter;
  } catch {
    return { ok: false, reason: 'failed' };
  }
  await db.update(passkeys).set({ counter: newCounter, lastUsedAt: now }).where(eq(passkeys.id, found.key.id));
  const sessionToken = randomUUID(); // as Auth.js makes them
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_S * 1000);
  await db.insert(sessions).values({ sessionToken, userId: found.key.accountId, expires, createdAt: now, signInMethod: 'passkey' });
  return { ok: true, accountId: found.key.accountId, sessionToken, expires };
}

// ── the account page ──────────────────────────────────────────────────────────────────────────────────────────────

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
function toRow(p: typeof passkeys.$inferSelect): PasskeyRow {
  return { id: p.id, label: p.deviceLabel, addedOn: isoDay(p.createdAt), lastUsedOn: p.lastUsedAt ? isoDay(p.lastUsedAt) : null };
}

/** This account's passkeys, newest first. Only ever the signed-in person's own. */
export async function listPasskeys(db: DbHandle, accountId: string): Promise<PasskeyRow[]> {
  const rows = await db.select().from(passkeys).where(eq(passkeys.accountId, accountId)).orderBy(desc(passkeys.createdAt));
  return rows.map(toRow);
}

/** "remove": this device's Face ID stops opening snickerdoodle, at once. Only the account's own passkey. */
export async function removePasskey(db: DbHandle, accountId: string, passkeyId: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(passkeyId)) return { ok: false };
  const gone = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.accountId, accountId)))
    .returning({ id: passkeys.id, label: passkeys.deviceLabel });
  if (!gone[0]) return { ok: false };
  await db.insert(auditRecords).values({
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'PASSKEY_REMOVED',
    targetType: 'passkey',
    targetId: gone[0].id,
    metadata: { device: gone[0].label, reason: 'removed-by-them' },
  });
  return { ok: true };
}

export type PasskeyRemovalReason = 'member-removed' | 'account-closed';

/**
 * Every passkey of an account goes, now — next to where its sessions are deleted (member removal, account closure),
 * so nobody signs back in with Face ID once they've been signed out everywhere. Each one logged.
 */
export async function deleteAllPasskeys(
  db: DbHandle,
  accountId: string,
  reason: PasskeyRemovalReason,
  actor: { accountId: string | null; actorType: 'MEMBER' | 'SYSTEM' | 'ADMIN'; familyId?: string | null },
): Promise<number> {
  await db.delete(passkeyChallenges).where(eq(passkeyChallenges.accountId, accountId));
  const gone = await db.delete(passkeys).where(eq(passkeys.accountId, accountId)).returning({ id: passkeys.id, label: passkeys.deviceLabel });
  if (gone.length) {
    await db.insert(auditRecords).values(
      gone.map((p) => ({
        familyId: actor.familyId ?? null,
        actorAccountId: actor.accountId,
        actorType: actor.actorType,
        event: 'PASSKEY_REMOVED' as const,
        targetType: 'passkey',
        targetId: p.id,
        metadata: { device: p.label, reason, account: accountId },
      })),
    );
  }
  return gone.length;
}
