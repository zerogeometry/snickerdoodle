import { describe, expect, it } from 'vitest';
import { appUrl, resendMailer, resolveMailer, senderFor } from '../index';
import { familyInviteEmail } from '../familyInvite';

describe('mail port', () => {
  it('defaults to the console adapter outside production', () => {
    expect(() => resolveMailer({ NODE_ENV: 'development' })).not.toThrow();
  });
  it('production with no provider is a hard error, never a silent drop', () => {
    expect(() => resolveMailer({ NODE_ENV: 'production' })).toThrow(/MAIL_PROVIDER/);
  });
  it('an unknown provider is a hard error', () => {
    expect(() => resolveMailer({ MAIL_PROVIDER: 'carrier-pigeon', NODE_ENV: 'development' })).toThrow(/no adapter/);
  });
  it('appUrl builds absolute links from APP_URL (no hard-coded host)', () => {
    expect(appUrl('/join/abc', { APP_URL: 'https://snickerdoodle.co.uk/' })).toBe('https://snickerdoodle.co.uk/join/abc');
    expect(appUrl('g/x', { APP_URL: 'http://localhost:3007' })).toBe('http://localhost:3007/g/x');
  });
  it('extra headers (List-Unsubscribe on the reminders) reach Resend', async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const headers = { 'List-Unsubscribe': '<https://x.test/off>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    await resendMailer('key', 'hello@x.test', fakeFetch).send({ kind: 'reminder', to: 'a@x.test', subject: 's', text: 't', headers });
    expect(body.headers).toEqual(headers);
  });
});

describe('the invite says who it is from (junk-folder fixes, 10 Nov 2026)', () => {
  it('the sender reads "Sam via snickerdoodle" — our address, their first name only', () => {
    const from = 'snickerdoodle <hello@snickerdoodle.co.uk>';
    expect(senderFor(from, 'Sam Hartley')).toBe('"Sam via snickerdoodle" <hello@snickerdoodle.co.uk>');
    expect(senderFor('hello@snickerdoodle.co.uk', 'Sam')).toBe('"Sam via snickerdoodle" <hello@snickerdoodle.co.uk>');
    // nothing odd from an account ever reaches the header: no name, or a name that isn't letters, ⇒ the plain sender
    for (const odd of [null, '', '  ', '"Evil" <x@y>', '<script>', 'x@y.z']) expect(senderFor(from, odd)).toBe(from);
    // a sneaky second line can't add a header: only the first word, letters only, is ever used
    expect(senderFor(from, 'Sam\r\nBcc: x@y')).toBe('"Sam via snickerdoodle" <hello@snickerdoodle.co.uk>');
  });

  it('Resend gets the on-behalf sender', async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await resendMailer('key', 'snickerdoodle <hello@x.test>', fakeFetch).send({ kind: 'family-invite', to: 'a@x.test', subject: 's', text: 't', onBehalfOf: 'Sam' });
    expect(body.from).toBe('"Sam via snickerdoodle" <hello@x.test>');
  });

  it('the invite names the inviter, says a sign-in email follows, links only to our own site, and signs off', () => {
    const m = familyInviteEmail({ to: 'Nan@Example.com', token: 'tok_abc123', inviterName: 'Sam Hartley', inviteeName: 'Nan' });
    expect(m.to).toBe('nan@example.com');
    expect(m.onBehalfOf).toBe('Sam');
    expect(m.subject).toBe('Sam invited you to their family keepsake box');
    expect(m.text).toMatch(/^Hi Nan,/);
    expect(m.text).toContain('one-tap sign-in link');
    expect(m.text).toContain('on behalf of Sam’s family');
    expect(m.text).not.toContain('Hartley'); // no surnames in emails
    const links = m.text.match(/https?:\/\/\S+/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/\/join\/tok_abc123$/);
    // no inviter name: neutral wording, plain sender
    const n = familyInviteEmail({ to: 'a@b.c', token: 't', inviterName: null });
    expect(n.onBehalfOf).toBeNull();
    expect(n.text).toMatch(/^Hi there,/);
  });
});
