'use client';

import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration, WebAuthnError } from 'simplewebauthn-browser';
import { passkeyAddFinishAction, passkeyAddOptionsAction, passkeySignInFinishAction, passkeySignInOptionsAction } from '@/app/actions/passkey';
import { PASSKEY_HERE_KEY, passkeyWord, type PasskeyProblem, type PasskeyRow } from '@/lib/passkeys';

/**
 * The page side of "sign in with Face ID": asks this phone or computer to make or use a passkey, and hands what it
 * says to the server (src/app/actions/passkey.ts), which decides everything. The face or fingerprint is checked by
 * the device itself and never reaches this page, let alone us.
 */

/** Why it didn't happen, as the page words it. 'cancelled' = they closed the Face ID sheet (never an error). */
export type PasskeyOutcome = PasskeyProblem | 'cancelled' | 'already-here';

/** Whether this browser can do passkeys at all (any kind: this device, or a phone nearby). */
export function canUsePasskeys(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Whether THIS device can unlock one with its own face / fingerprint / PIN — the after-sign-in card asks only then. */
export async function hasDeviceUnlock(): Promise<boolean> {
  if (!canUsePasskeys()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** "Face ID", "Touch ID", "your fingerprint", "Windows Hello" or "a passkey", for this device. */
export function deviceWord(): string {
  if (typeof navigator === 'undefined') return 'Face ID';
  return passkeyWord(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function markPasskeyHere() {
  try {
    localStorage.setItem(PASSKEY_HERE_KEY, '1');
  } catch {
    // private mode: the login page just shows the email form first
  }
}

export function passkeyHere(): boolean {
  try {
    return localStorage.getItem(PASSKEY_HERE_KEY) === '1';
  } catch {
    return false;
  }
}

function outcomeOf(e: unknown): PasskeyOutcome {
  if (e instanceof WebAuthnError && e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'already-here';
  const name = e instanceof Error ? e.name : '';
  // closed the sheet, looked away, or it timed out — the browser won't say which, on purpose
  if (name === 'NotAllowedError' || name === 'AbortError' || (e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED')) return 'cancelled';
  if (name === 'InvalidStateError') return 'already-here';
  return 'failed';
}

/** "use Face ID": make a passkey on this device for the signed-in account. */
export async function addPasskeyHere(): Promise<{ ok: true; passkey: PasskeyRow } | { ok: false; reason: PasskeyOutcome }> {
  if (!canUsePasskeys()) return { ok: false, reason: 'unsupported' };
  const start = await passkeyAddOptionsAction().catch(() => ({ ok: false as const, reason: 'failed' as const }));
  if (!start.ok) return start;
  let response;
  try {
    response = await startRegistration({ optionsJSON: start.options });
  } catch (e) {
    const reason = outcomeOf(e);
    if (reason === 'already-here') markPasskeyHere();
    return { ok: false, reason };
  }
  const done = await passkeyAddFinishAction(response).catch(() => ({ ok: false as const, reason: 'failed' as const }));
  if (done.ok) markPasskeyHere();
  return done;
}

/** "sign in with Face ID": whichever snickerdoodle passkey the device offers. Signed in (cookie set) when ok. */
export async function signInWithPasskey(keepId: string | null): Promise<{ ok: true } | { ok: false; reason: PasskeyOutcome }> {
  if (!canUsePasskeys()) return { ok: false, reason: 'unsupported' };
  const start = await passkeySignInOptionsAction().catch(() => ({ ok: false as const, reason: 'failed' as const }));
  if (!start.ok) return start;
  let response;
  try {
    response = await startAuthentication({ optionsJSON: start.options });
  } catch (e) {
    return { ok: false, reason: outcomeOf(e) };
  }
  const done = await passkeySignInFinishAction(response, keepId).catch(() => ({ ok: false as const, reason: 'failed' as const }));
  if (done.ok) markPasskeyHere();
  else if (done.reason === 'unknown') tellDeviceItsGone(start.options.rpId, response.id);
  return done;
}

/** A passkey we no longer know (removed on the account page): ask the device to tidy it away, where it can. */
function tellDeviceItsGone(rpId: string | undefined, credentialId: string) {
  const pkc = (globalThis as { PublicKeyCredential?: { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> } }).PublicKeyCredential;
  if (rpId && pkc?.signalUnknownCredential) pkc.signalUnknownCredential({ rpId, credentialId }).catch(() => {});
}
