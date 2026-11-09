import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { allowedRedirectUris, callbackUrl, connectPath, deviceLabelFrom, parseConnectRequest } from '@/server/app/link';
import { hashSecret, newSecret, pkceMatches, s256 } from '@/server/app/secrets';
import { appUploadsOpen, validMadeOn } from '@/server/app/api';
import { drawAndroidStatements, drawAppleAssociation } from '@/server/app/wellKnown';
import { isGateExempt } from '@/lib/siteMode';

/**
 * Snickerdoodle Draw linking — the parts that need no database: the /app/connect request check (an
 * unknown return address is NEVER redirected to; only S256), PKCE, and the small helpers.
 */
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'; // RFC 7636 appendix B
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const env = { APP_URL: 'https://snickerdoodle.co.uk' };
const good = {
  response_type: 'code',
  client_id: 'snickerdoodle-draw',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state: 'abc123_-',
  redirect_uri: 'https://snickerdoodle.co.uk/app/callback',
};

describe('PKCE (S256)', () => {
  it('matches the RFC 7636 example', () => {
    expect(s256(verifier)).toBe(challenge);
    expect(pkceMatches(verifier, challenge)).toBe(true);
  });
  it('refuses a wrong, short or malformed verifier', () => {
    expect(pkceMatches(`${verifier.slice(0, -1)}x`, challenge)).toBe(false);
    expect(pkceMatches('too-short', challenge)).toBe(false);
    expect(pkceMatches(`${verifier} `, challenge)).toBe(false);
    expect(pkceMatches(verifier, 'not-a-challenge')).toBe(false);
  });
  it('secrets are 256-bit, prefixed, and stored only as their SHA-256', () => {
    const a = newSecret('sdd_');
    expect(a).toMatch(/^sdd_[A-Za-z0-9_-]{43}$/);
    expect(newSecret('sdd_')).not.toBe(a);
    expect(hashSecret(a)).toBe(createHash('sha256').update(a).digest('hex'));
    expect(hashSecret(a)).not.toContain(a);
  });
});

describe('the /app/connect request', () => {
  it('accepts the app’s request (android https callback and the iOS custom scheme)', () => {
    expect(parseConnectRequest(good, env)).toEqual({ ok: true, req: { codeChallenge: challenge, state: 'abc123_-', redirectUri: good.redirect_uri } });
    expect(parseConnectRequest({ ...good, redirect_uri: 'snickerdoodle-draw://auth/callback' }, env).ok).toBe(true);
  });
  it.each([
    ['another app', { client_id: 'someone-else' }, 'client'],
    ['an unknown return address', { redirect_uri: 'https://evil.example/app/callback' }, 'redirect'],
    ['a look-alike return address', { redirect_uri: 'https://snickerdoodle.co.uk/app/callback/../x' }, 'redirect'],
    ['a prefix of the return address', { redirect_uri: 'https://snickerdoodle.co.uk/app/callback?x=1' }, 'redirect'],
    ['a different scheme path', { redirect_uri: 'snickerdoodle-draw://evil' }, 'redirect'],
    ['plain PKCE', { code_challenge_method: 'plain' }, 'method'],
    ['no PKCE method', { code_challenge_method: undefined }, 'method'],
    ['a bad challenge', { code_challenge: 'short' }, 'challenge'],
    ['no state', { state: undefined }, 'state'],
    ['a state with spaces', { state: 'a b' }, 'state'],
    ['token response type', { response_type: 'token' }, 'response-type'],
  ])('refuses %s', (_name, patch, reason) => {
    expect(parseConnectRequest({ ...good, ...patch }, env)).toEqual({ ok: false, reason });
  });
  it('refuses a repeated parameter (no guessing which one counts)', () => {
    expect(parseConnectRequest({ ...good, redirect_uri: [good.redirect_uri, 'https://evil.example'] }, env).ok).toBe(false);
  });
  it('the allow-list is exact addresses only, including the site’s own (for local dev)', () => {
    expect([...allowedRedirectUris({ APP_URL: 'http://localhost:3000' })]).toEqual(['https://snickerdoodle.co.uk/app/callback', 'snickerdoodle-draw://auth/callback', 'http://localhost:3000/app/callback']);
  });
  it('sign-in round trip keeps the checked values; the callback carries the code (or the refusal) and the state', () => {
    const parsed = parseConnectRequest(good, env);
    if (!parsed.ok) throw new Error('expected ok');
    const back = new URL(connectPath(parsed.req), 'https://snickerdoodle.co.uk');
    expect(parseConnectRequest(Object.fromEntries(back.searchParams), env)).toEqual(parsed);
    expect(callbackUrl(parsed.req, { code: 'sdc_x' })).toBe('https://snickerdoodle.co.uk/app/callback?code=sdc_x&state=abc123_-');
    expect(callbackUrl({ ...parsed.req, redirectUri: 'snickerdoodle-draw://auth/callback' }, { error: 'access_denied' })).toBe('snickerdoodle-draw://auth/callback?error=access_denied&state=abc123_-');
  });
});

describe('helpers', () => {
  it('names a phone plainly, never by model or id', () => {
    expect(deviceLabelFrom('okhttp/4.12.0')).toBe('an android phone or tablet');
    expect(deviceLabelFrom('SnickerdoodleDraw/12 CFNetwork/1498 Darwin/24.0.0')).toBe('an iphone or ipad');
    expect(deviceLabelFrom(null)).toBe('a phone or tablet');
  });
  it('a made-on day must be real, from 2000, and not after tomorrow', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(validMadeOn('2026-11-09', now)).toBe('2026-11-09');
    expect(validMadeOn('2026-11-10', now)).toBe('2026-11-10'); // a phone a time zone ahead
    expect(validMadeOn('2026-11-12', now)).toBeNull();
    expect(validMadeOn('2026-02-30', now)).toBeNull();
    expect(validMadeOn('1999-12-31', now)).toBeNull();
    expect(validMadeOn('9 Nov', now)).toBeNull();
    expect(validMadeOn(20261109, now)).toBeNull();
  });
  it('drawings from the app are OFF unless DRAW_APP_UPLOADS=on (the Children’s Code sign-off)', () => {
    expect(appUploadsOpen({})).toBe(false);
    expect(appUploadsOpen({ DRAW_APP_UPLOADS: 'true' })).toBe(false);
    expect(appUploadsOpen({ DRAW_APP_UPLOADS: 'on' })).toBe(true);
  });
  it('the app-link files stay empty until their settings are filled in, and only accept well-formed values', () => {
    expect(drawAndroidStatements({})).toEqual([]);
    expect(drawAndroidStatements({ DRAW_ANDROID_CERT_SHA256: 'nonsense' })).toEqual([]);
    const fp = Array.from({ length: 32 }, () => 'ab').join(':');
    expect(drawAndroidStatements({ DRAW_ANDROID_CERT_SHA256: fp })[0]!.target).toEqual({ namespace: 'android_app', package_name: 'com.launchmode.snickerdoodle.draw', sha256_cert_fingerprints: [fp.toUpperCase()] });
    expect(drawAppleAssociation({})).toBeNull();
    expect(drawAppleAssociation({ DRAW_APPLE_TEAM_ID: 'ABCDE12345' })?.applinks.details[0]!.appIDs).toEqual(['ABCDE12345.com.launchmode.snickerdoodle.draw']);
  });
  it('the test-site lock lets the app’s calls and the app-link files through — and nothing else new', () => {
    expect(isGateExempt('/api/app/v1/me')).toBe(true);
    expect(isGateExempt('/.well-known/assetlinks.json')).toBe(true);
    expect(isGateExempt('/.well-known/apple-app-site-association')).toBe(true);
    expect(isGateExempt('/app/connect')).toBe(false); // the grown-up's browser types the test password
    expect(isGateExempt('/api/app/v2/me')).toBe(false);
    expect(isGateExempt('/.well-known/other')).toBe(false);
  });
});
