import { describe, expect, it } from 'vitest';
import { WAITLIST_CONSENT_WORDING, normaliseWaitlistEmail } from '@/lib/waitlist';
import { confirmationEmail, hashWaitlistToken, newWaitlistToken, parseWaitlistToken } from '@/server/waitlist';
import { createRateLimiter } from '@/server/rateLimit';
import { unsubscribeHeaders } from '@/server/mail';

describe('waitlist — email validation', () => {
  it('trims and lowercases', () => {
    expect(normaliseWaitlistEmail('  Grandma.Jo@Example.CO.UK ')).toBe('grandma.jo@example.co.uk');
  });

  it('rejects things that are not an email address', () => {
    for (const bad of ['', 'nope', 'a@b', 'a@b.c', '@example.com', 'jo@', 'jo @example.com', 'jo@exa mple.com', 'jo@@example.com', 'jo@example..com', '.jo@example.com', 'jo.@example.com', '<jo@example.com>', `${'x'.repeat(65)}@example.com`, `jo@${'x'.repeat(250)}.com`, 42, null, undefined, {}]) {
      expect(normaliseWaitlistEmail(bad), String(bad)).toBeNull();
    }
  });

  it('accepts ordinary addresses, plus-tags included', () => {
    for (const ok of ['jo@example.com', 'jo+snicker@example.co.uk', 'a.b-c_d@sub.example.org']) expect(normaliseWaitlistEmail(ok), ok).toBe(ok);
  });

  it('the consent wording is specific about what they get and how to stop it', () => {
    expect(WAITLIST_CONSENT_WORDING).toMatch(/email/i);
    expect(WAITLIST_CONSENT_WORDING).toMatch(/unsubscribe/i);
    expect(WAITLIST_CONSENT_WORDING).not.toMatch(/terms/i); // never bundled with the terms
  });
});

describe('waitlist — tokens', () => {
  it('are unguessable, URL-safe and unique', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = newWaitlistToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(parseWaitlistToken(t)).toBe(t);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it('only the hash is stored, and it is stable + one-way', () => {
    const t = newWaitlistToken();
    expect(hashWaitlistToken(t)).toBe(hashWaitlistToken(t));
    expect(hashWaitlistToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashWaitlistToken(t)).not.toContain(t);
  });

  it('malformed tokens never reach the database', () => {
    for (const bad of ['', 'short', `${'a'.repeat(43)}'`, 'a'.repeat(44), "x' OR 1=1 --", 7, null, ['a'.repeat(43)]]) expect(parseWaitlistToken(bad)).toBeNull();
  });
});

describe('waitlist — the confirmation email', () => {
  const env = { APP_URL: 'https://snickerdoodle.co.uk' };
  const confirm = newWaitlistToken();
  const unsub = newWaitlistToken();
  const m = confirmationEmail('jo@example.com', confirm, unsub, env);

  it('carries the confirm link and a one-tap unsubscribe link (in the body AND the headers)', () => {
    expect(m.text).toContain(`https://snickerdoodle.co.uk/waitlist/confirm?t=${confirm}`);
    expect(m.text).toContain(`https://snickerdoodle.co.uk/api/waitlist/unsubscribe?t=${unsub}`);
    expect(m.unsubscribeUrl).toBe(`https://snickerdoodle.co.uk/api/waitlist/unsubscribe?t=${unsub}`);
    expect(unsubscribeHeaders(m)).toEqual({
      'List-Unsubscribe': `<https://snickerdoodle.co.uk/api/waitlist/unsubscribe?t=${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('messages without an unsubscribe URL get no list headers', () => {
    expect(unsubscribeHeaders({})).toEqual({});
  });
});

describe('rate limiter', () => {
  it('allows up to the limit per window, then resets', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.take('ip', 0)).toBe(true);
    expect(rl.take('ip', 10)).toBe(true);
    expect(rl.take('ip', 20)).toBe(false);
    expect(rl.take('other', 20)).toBe(true);
    expect(rl.take('ip', 1001)).toBe(true);
  });

  it('never grows without bound', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (let i = 0; i < 10; i++) expect(rl.take(`k${i}`, 0)).toBe(true);
  });
});
