import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_FILES, gateCookieValid, gateToken, isGateExempt, localPath, sameSitePath } from '@/lib/siteMode';

/**
 * BREAK-IN SWEEP (tester 07, 2026-10-29) — the shared-password lock on the test site / private live site.
 * Live evidence (a local `next start` with SITE_MODE=test): reports/test-sweep-2026-10-29/07-break-in.md.
 */
const env = { SITE_MODE: 'test', TEST_SITE_PASSWORD: 'a-long-test-password', AUTH_SECRET: 'local-secret-for-this-test' };

describe('break-in: site password gate', () => {
  it('a forged or stale gate cookie is refused; only HMAC(secret, password) opens it', async () => {
    for (const c of [undefined, '', '1', 'true', '0'.repeat(64), (await gateToken(env)).toUpperCase()]) {
      expect(await gateCookieValid(c, env), String(c)).toBe(false);
    }
    expect(await gateCookieValid(await gateToken(env), env)).toBe(true);
    // a password change locks every old cookie out
    expect(await gateCookieValid(await gateToken(env), { ...env, TEST_SITE_PASSWORD: 'a-new-long-password' })).toBe(false);
  });

  it('after the password, it only ever sends you somewhere on this site', () => {
    for (const raw of ['//evil.example', '/\\evil.example', 'https://evil.example/x', 'javascript:alert(1)', '\\\\evil.example']) {
      expect(sameSitePath(raw, 'https://test.snickerdoodle.co.uk/api/test-gate'), raw).not.toMatch(/evil|javascript/);
    }
    expect(sameSitePath('/home?x=1', 'https://test.snickerdoodle.co.uk/api/test-gate')).toBe('/home?x=1');
  });

  it('API routes are never exempt just for their name, and the jobs/webhooks exemptions are exact prefixes', () => {
    expect(isGateExempt('/api/mockup/still.png')).toBe(false);
    expect(isGateExempt('/api/profile-image/x.png')).toBe(false);
    expect(isGateExempt('/api/webhooksX')).toBe(false);
  });

  it('07-B9: a PAGE path that merely ends in an image/font extension is NOT exempt from the password', () => {
    for (const p of ['/customize/mug.png', '/g/abc.png', '/join/x.webp', '/studio/position.png', '/home.svg']) {
      expect(isGateExempt(p), p).toBe(false);
    }
    // a page under a folder that ALSO holds public files (/christmas/delivery-dates) stays locked
    expect(isGateExempt('/christmas/delivery-dates')).toBe(false);
    expect(isGateExempt('/christmas/delivery-dates.webp')).toBe(false);
    expect(isGateExempt('/brand/not-a-real-file.png')).toBe(false);
  });

  it('07-B9: every real file in public/ is let through, and the list holds nothing else', () => {
    const root = path.join(process.cwd(), 'public');
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const onDisk = walk(root).map((f) => '/' + path.relative(root, f).split(path.sep).join('/')).sort();
    // a mismatch means public/ changed: update PUBLIC_FILES in src/lib/siteMode.ts to match
    expect([...PUBLIC_FILES].sort()).toEqual(onDisk);
    for (const f of onDisk) expect(isGateExempt(f), f).toBe(true);
  });
});

describe('07-B10: ?return= / ?next= only ever lead to a page on this site', () => {
  it('refuses anything a browser would read as another site', () => {
    for (const raw of ['/\\evil.example/phish', '//evil.example', '/\t/evil.example', '\\\\evil.example','https://evil.example/x', 'javascript:alert(1)', 'evil.example', '', null, undefined]) {
      expect(localPath(raw), String(raw)).toBeUndefined();
    }
  });
  it('keeps a real path, its query and its hash', () => {
    expect(localPath('/customize/mug?resume=1#top')).toBe('/customize/mug?resume=1#top');
    expect(localPath('/start-creating')).toBe('/start-creating');
  });
});
