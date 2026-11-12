/**
 * The sign-in code's shape (src/auth/signInCode.ts has the why). Pure and browser-safe: the sign-in card uses it to
 * tidy what's typed; the server makes and stores the codes.
 */
export const SIGN_IN_CODE_MINUTES = 15;
export const SIGN_IN_CODE_LENGTH = 8;
/** No 0/O, 1/I/L: nothing that reads two ways on a phone screen. */
export const SIGN_IN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** How the email shows it: two easy halves, "K7MP-42QX". */
export function formatSignInCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What someone typed, as the code: capitals, with spaces and dashes dropped. Not a code at all → null. */
export function normalizeSignInCode(typed: string): string | null {
  const code = typed.toUpperCase().replace(/[\s\-–—_.]/g, '');
  if (code.length !== SIGN_IN_CODE_LENGTH) return null;
  for (const ch of code) if (!SIGN_IN_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
