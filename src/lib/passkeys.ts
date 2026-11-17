/**
 * "Sign in with Face ID" (passkeys, founder 17 Nov 2026) — the plain words, safe on the page and the server.
 *
 * A passkey is a key pair the person's own phone or computer makes for snickerdoodle.co.uk. Their face or fingerprint
 * only unlocks it ON the device; what reaches us is the public half and a signature. Nothing biometric, ever.
 */

/** What to call the unlock on this device, for the buttons ("sign in with Face ID"). From the browser's user agent. */
export function passkeyWord(userAgent: string | null | undefined, maxTouchPoints = 0): string {
  const ua = userAgent ?? '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'Face ID';
  // an iPad asks for the desktop site and says "Macintosh"; only the touch screen gives it away
  if (/macintosh|mac os x/i.test(ua)) return maxTouchPoints > 1 ? 'Face ID' : 'Touch ID';
  if (/android/i.test(ua)) return 'your fingerprint';
  if (/windows/i.test(ua)) return 'Windows Hello';
  return 'a passkey';
}

/** Password managers that keep passkeys, by the id their keys carry (AAGUID). Shown so a parent can tell two apart. */
const KEEPERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'icloud keychain',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'icloud keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'google password manager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'chrome on mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'windows hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'windows hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'windows hello',
  '53414d53-554e-4700-0000-000000000000': 'samsung pass',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'bitwarden',
};

/**
 * What the account page calls a passkey: the kind of device it was added on, plus the password manager keeping it
 * when the key says. Never a device id or model ("an iphone · icloud keychain").
 */
export function passkeyDeviceLabel(userAgent: string | null | undefined, aaguid?: string | null): string {
  const ua = userAgent ?? '';
  const device = /iphone|ipod/i.test(ua)
    ? 'an iphone'
    : /ipad/i.test(ua)
      ? 'an ipad'
      : /android/i.test(ua)
        ? 'an android phone or tablet'
        : /macintosh|mac os x/i.test(ua)
          ? 'a mac or ipad'
          : /cros/i.test(ua)
            ? 'a chromebook'
            : /windows/i.test(ua)
              ? 'a windows computer'
              : /linux/i.test(ua)
                ? 'a computer'
                : 'a phone or computer';
  const keeper = aaguid ? KEEPERS[aaguid.toLowerCase()] : undefined;
  return keeper ? `${device} · ${keeper}` : device;
}

/** This browser has used or added a passkey (this device only), so the login page offers Face ID first. */
export const PASSKEY_HERE_KEY = 'sd-passkey-here';
/** "not now" on the after-sign-in card, on this device. */
export const PASSKEY_NUDGE_DISMISSED_KEY = 'sd-passkey-nudge-off';

/** One passkey as the account page shows it (days as YYYY-MM-DD). */
export interface PasskeyRow {
  id: string;
  label: string;
  addedOn: string;
  lastUsedOn: string | null;
}

/** The answers the passkey server actions give the page. */
export type PasskeyProblem = 'signed-out' | 'sign-in-again' | 'busy' | 'unsupported' | 'expired' | 'unknown' | 'failed';
