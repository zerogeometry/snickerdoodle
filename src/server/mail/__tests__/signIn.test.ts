import { describe, expect, it } from 'vitest';
import { signInEmail } from '../signIn';

const url = 'https://snickerdoodle.co.uk/api/auth/callback/email?callbackUrl=%2Fhome&token=abc&email=a%40x.test';

describe('the sign-in email: a button and a code (founder, 12 Nov 2026)', () => {
  it('the HTML has a button to the link and the code; the long address is not printed as text', () => {
    const m = signInEmail({ to: 'a@x.test', url, code: 'K7MP42QX', inviter: null });
    expect(m.kind).toBe('magic-link');
    expect(m.html).toContain(`href="${url.replace(/&/g, '&amp;')}"`);
    expect(m.html).toContain('sign me in');
    expect(m.html).toContain('K7MP-42QX');
    const visible = m.html!.replace(/<[^>]+>/g, ' ');
    expect(visible).not.toContain('callback/email');
  });

  it('the plain-text part (mail apps without HTML) keeps the link and the code', () => {
    const m = signInEmail({ to: 'a@x.test', url, code: 'K7MP42QX', inviter: null });
    expect(m.text).toContain(url);
    expect(m.text).toContain('K7MP-42QX');
    expect(m.text).toContain('15 minutes');
  });

  it('an invite says whose family, and nothing from a name can break the HTML', () => {
    const m = signInEmail({ to: 'a@x.test', url, code: 'K7MP42QX', inviter: 'Sam' });
    expect(m.subject).toBe('your link to join Sam’s family on snickerdoodle');
    expect(m.onBehalfOf).toBe('Sam');
    expect(m.html).toContain('join the family');
    const odd = signInEmail({ to: 'a@x.test', url, code: 'K7MP42QX', inviter: '<b>Sam</b>' });
    expect(odd.html).not.toContain('<b>Sam</b>');
    expect(odd.html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
  });
});
