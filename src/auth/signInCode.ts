import { createHash, randomInt } from 'node:crypto';
import { verificationTokens } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { SIGN_IN_CODE_ALPHABET, SIGN_IN_CODE_LENGTH, SIGN_IN_CODE_MINUTES } from '@/lib/signInCode';

export { formatSignInCode, normalizeSignInCode, SIGN_IN_CODE_ALPHABET, SIGN_IN_CODE_LENGTH, SIGN_IN_CODE_MINUTES } from '@/lib/signInCode';

/**
 * The sign-in CODE that rides along with every magic link (founder, 12 Nov 2026).
 *
 * Why: Snickerdoodle Draw opens the website in the phone's sign-in sheet. The magic link in the email opens in a
 * DIFFERENT browser (the mail app's, or another device altogether), so the sign-in finished there and never got
 * back to the app. Typing the code from the email into the "check your email" card keeps the whole sign-in in the
 * sheet. It works the same for anyone signing in on the website.
 *
 * How: a second Auth.js verification token for the same email, hashed exactly the way Auth.js hashes its own
 * (sha256 of token + secret, hex), so Auth.js's own email callback checks it: single use, and only for the email it
 * was sent to. The code lasts 15 minutes (the link keeps its hour); using either the link or the code ends the
 * other (src/auth/adapter.ts). Guessing is capped per email and per device (src/app/api/auth/[...nextauth]/route.ts):
 * 31 symbols × 8 places is about 850 billion codes.
 */
/** A fresh code from the crypto RNG, e.g. "K7MP42QX". */
export function newSignInCode(): string {
  let code = '';
  for (let i = 0; i < SIGN_IN_CODE_LENGTH; i++) code += SIGN_IN_CODE_ALPHABET[randomInt(SIGN_IN_CODE_ALPHABET.length)];
  return code;
}

/** Auth.js's own token hash (@auth/core createHash(`${token}${secret}`)): sha256, hex. */
export function verificationTokenHash(token: string, secret: string): string {
  return createHash('sha256').update(`${token}${secret}`).digest('hex');
}

/** Store the code as a verification token for this (already lowercased) email, good for 15 minutes. */
export async function storeSignInCode(db: DbHandle, identifier: string, code: string, secret: string, now: Date = new Date()): Promise<void> {
  await db.insert(verificationTokens).values({
    identifier,
    token: verificationTokenHash(code, secret),
    expires: new Date(now.getTime() + SIGN_IN_CODE_MINUTES * 60_000),
  });
}
