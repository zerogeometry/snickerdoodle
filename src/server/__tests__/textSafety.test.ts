import { describe, expect, it } from 'vitest';
import { containsAbusiveText, screenChildFirstName } from '@/server/textSafety';

describe('screenChildFirstName — child FIRST NAME ONLY, abuse-screened', () => {
  it('accepts a plain first name and trims it', () => {
    expect(screenChildFirstName('Mia')).toEqual({ ok: true, value: 'Mia' });
    expect(screenChildFirstName('  Olivia  ')).toEqual({ ok: true, value: 'Olivia' });
  });

  it('accepts accented names, hyphens and apostrophes', () => {
    expect(screenChildFirstName('Zoë')).toEqual({ ok: true, value: 'Zoë' });
    expect(screenChildFirstName('Mary-Jane')).toEqual({ ok: true, value: 'Mary-Jane' });
    expect(screenChildFirstName('O’Brien')).toEqual({ ok: true, value: 'O’Brien' });
  });

  it('treats empty / whitespace as no subject (allowed)', () => {
    expect(screenChildFirstName('')).toEqual({ ok: true, value: null });
    expect(screenChildFirstName('   ')).toEqual({ ok: true, value: null });
    expect(screenChildFirstName(undefined)).toEqual({ ok: true, value: null });
  });

  it('rejects a surname (any whitespace = more than a first name)', () => {
    expect(screenChildFirstName('Mia Smith')).toEqual({ ok: false, reason: 'surname' });
  });

  it('rejects over-long input', () => {
    expect(screenChildFirstName('A'.repeat(25))).toEqual({ ok: false, reason: 'length' });
  });

  it('rejects non-name characters (digits, punctuation, markup)', () => {
    expect(screenChildFirstName('Mia123')).toEqual({ ok: false, reason: 'invalid' });
    expect(screenChildFirstName('<script>')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects abusive language', () => {
    expect(screenChildFirstName('fuck').ok).toBe(false);
    expect(screenChildFirstName('shithead')).toEqual({ ok: false, reason: 'abuse' });
  });

  it('containsAbusiveText flags profanity case-insensitively without false-positives on real names', () => {
    expect(containsAbusiveText('totally FINE')).toBe(false);
    expect(containsAbusiveText('Cunningham')).toBe(false); // legit name — no abuse token inside
    expect(containsAbusiveText('a Shit message')).toBe(true);
  });
});
