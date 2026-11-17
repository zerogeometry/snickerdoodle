import { describe, expect, it } from 'vitest';
import { passkeyDeviceLabel, passkeyWord } from '@/lib/passkeys';
import { relyingParty, sessionCookieName } from '@/auth/passkeyConfig';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('passkey words', () => {
  it('names the unlock the way the device does', () => {
    expect(passkeyWord(UA.iphone)).toBe('Face ID');
    expect(passkeyWord(UA.ipadDesktop, 5)).toBe('Face ID'); // an iPad asking for the desktop site
    expect(passkeyWord(UA.ipadDesktop, 0)).toBe('Touch ID'); // a real Mac
    expect(passkeyWord(UA.android)).toBe('your fingerprint');
    expect(passkeyWord(UA.windows)).toBe('Windows Hello');
    expect(passkeyWord(UA.chromebook)).toBe('a passkey');
    expect(passkeyWord(null)).toBe('a passkey');
  });

  it('labels a passkey by the kind of device and its password manager — never a model or id', () => {
    expect(passkeyDeviceLabel(UA.iphone, 'FBFC3007-154E-4ECC-8C0B-6E020557D7BD')).toBe('an iphone · icloud keychain');
    expect(passkeyDeviceLabel(UA.android, 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4')).toBe('an android phone or tablet · google password manager');
    expect(passkeyDeviceLabel(UA.windows, '00000000-0000-0000-0000-000000000000')).toBe('a windows computer');
    expect(passkeyDeviceLabel(UA.chromebook)).toBe('a chromebook');
    expect(passkeyDeviceLabel(null)).toBe('a phone or computer');
    expect(passkeyDeviceLabel(UA.android)).not.toMatch(/pixel/i);
  });
});

describe('where passkeys belong', () => {
  it('the live site: snickerdoodle.co.uk, with or without www', () => {
    expect(relyingParty({ AUTH_URL: 'https://snickerdoodle.co.uk' }, null)).toEqual({
      rpID: 'snickerdoodle.co.uk',
      origins: ['https://snickerdoodle.co.uk', 'https://www.snickerdoodle.co.uk'],
    });
    expect(relyingParty({ AUTH_URL: 'https://www.snickerdoodle.co.uk' }, 'http://10.0.0.5:3000')?.rpID).toBe('snickerdoodle.co.uk');
  });

  it('this computer (localhost, plain http) for building and the e2e tests', () => {
    expect(relyingParty({ AUTH_URL: 'http://localhost:3100' }, null)).toEqual({ rpID: 'localhost', origins: ['http://localhost:3100'] });
    expect(relyingParty({}, 'http://localhost:3000')).toEqual({ rpID: 'localhost', origins: ['http://localhost:3000'] });
  });

  it('never over plain http anywhere else, and an explicit setting wins', () => {
    expect(relyingParty({ AUTH_URL: 'http://snickerdoodle.co.uk' }, null)).toBeNull();
    expect(relyingParty({}, null)).toBeNull();
    expect(relyingParty({ AUTH_URL: 'not a url' }, null)).toBeNull();
    expect(relyingParty({ PASSKEY_RP_ID: 'test.snickerdoodle.co.uk', PASSKEY_ORIGINS: 'https://test.snickerdoodle.co.uk' }, null)).toEqual({
      rpID: 'test.snickerdoodle.co.uk',
      origins: ['https://test.snickerdoodle.co.uk'],
    });
  });
});

describe('the sign-in cookie a passkey sets — the one Auth.js reads', () => {
  it('follows AUTH_URL when set, else the forwarded scheme', () => {
    expect(sessionCookieName({ AUTH_URL: 'https://snickerdoodle.co.uk' }, 'http')).toEqual({ name: '__Secure-authjs.session-token', secure: true });
    expect(sessionCookieName({ AUTH_URL: 'http://localhost:3100' }, 'https')).toEqual({ name: 'authjs.session-token', secure: false });
    expect(sessionCookieName({}, 'https')).toEqual({ name: '__Secure-authjs.session-token', secure: true });
    expect(sessionCookieName({}, 'https, http')).toEqual({ name: '__Secure-authjs.session-token', secure: true });
    expect(sessionCookieName({}, null)).toEqual({ name: 'authjs.session-token', secure: false });
  });
});
