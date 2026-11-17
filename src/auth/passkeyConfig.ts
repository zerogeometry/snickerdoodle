/**
 * Where passkeys belong, and the sign-in cookie a passkey sign-in sets — pure rules, unit-tested.
 *
 * Relying party ("rpID"): the site a passkey is made for. On the live site that's snickerdoodle.co.uk (AUTH_URL is
 * https://snickerdoodle.co.uk; www. is the same site). A phone only ever offers a passkey back to the site it was made
 * for, so a look-alike site can never use one. PASSKEY_RP_ID / PASSKEY_ORIGINS override it (a test site).
 */
export interface RelyingParty {
  rpID: string;
  /** The page addresses a passkey may be used from (checked against what the browser signed). */
  origins: string[];
}

type Env = Record<string, string | undefined>;

export function relyingParty(env: Env, requestOrigin: string | null): RelyingParty | null {
  const explicit = env.PASSKEY_RP_ID?.trim();
  if (explicit) {
    const origins = env.PASSKEY_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [`https://${explicit}`, `https://www.${explicit}`];
    return { rpID: explicit, origins };
  }
  const base = env.AUTH_URL || env.NEXTAUTH_URL || env.APP_URL || requestOrigin;
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  const rpID = url.hostname.replace(/^www\./, '');
  // WebAuthn needs https, except on this computer while building and testing
  if (url.protocol !== 'https:' && rpID !== 'localhost') return null;
  const origins = url.protocol === 'https:' ? [`https://${rpID}`, `https://www.${rpID}`] : [url.origin];
  return { rpID, origins };
}

/**
 * The name of Auth.js's sign-in cookie, exactly as Auth.js chooses it: with AUTH_URL set, by its scheme; otherwise by
 * the request's (x-forwarded-proto, as trustHost reads it). A passkey sign-in must set the very cookie Auth.js reads.
 */
export function sessionCookieName(env: Env, forwardedProto: string | null): { name: string; secure: boolean } {
  const base = env.AUTH_URL ?? env.NEXTAUTH_URL;
  let secure: boolean;
  if (base) {
    try {
      secure = new URL(base).protocol === 'https:';
    } catch {
      secure = false;
    }
  } else {
    secure = (forwardedProto ?? '').split(',')[0]!.trim() === 'https';
  }
  return { name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token', secure };
}
