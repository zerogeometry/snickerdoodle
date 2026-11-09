import { describe, expect, it } from 'vitest';
import { containsAbusiveDrawnText, containsAbusiveText, screenChildFirstName } from '@/server/textSafety';

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

  it('D25 additions catch more profanity, still not ordinary words', () => {
    for (const bad of ['BOLLOCKS', 'you arsehole', 'asshole', 'paedo', 'nonce']) expect(containsAbusiveText(bad)).toBe(true);
    for (const fine of ['encyclopaedia', 'announce', 'pronounce', 'paediatric nurse', 'Arsenal', 'Bollinger']) expect(containsAbusiveText(fine)).toBe(false);
  });
});

describe('containsAbusiveDrawnText — words READ from a picture (loose on purpose: a match only sends it to review)', () => {
  it('the founder’s live test reads, 9 Nov 2026: a gap inside the word, and W read as V', () => {
    expect(containsAbusiveDrawnText(['WAN KER'])).toBe(true);
    expect(containsAbusiveDrawnText(['-', 'W', 'VANKER'])).toBe(true);
    expect(containsAbusiveDrawnText(['W VANKER'])).toBe(true);
    expect(containsAbusiveDrawnText(['WANKER', 'ER'])).toBe(true);
  });

  it('spaced-out letters and look-alike swaps', () => {
    for (const bad of ['f u c k', 'F-U-C-K', 'fvck', 'sh1t', 'SH!T', 'b1tch', 'c u n t', 'bo11ocks', 'tvvat']) expect(containsAbusiveDrawnText([bad]), bad).toBe(true);
  });

  it('kind words and ordinary drawings pass', () => {
    for (const fine of ['love you nana', 'Happy Christmas', 'Olivia age 6', 'thank you', 'witch', 'bigger', 'vanilla ice cream', 'Wanda', 'banker', 'grapes', 'drape', 'Mississippi', 'Grandma xx', 'TO MUMMY', 'Max 4']) {
      expect(containsAbusiveDrawnText([fine]), fine).toBe(false);
    }
  });

  it('lines are never glued to each other', () => {
    expect(containsAbusiveDrawnText(['Wan', 'Ker'])).toBe(false); // two separate lines — not one word
  });

  it('"rape" counts only as a word of its own in drawings (kids draw grapes)', () => {
    expect(containsAbusiveDrawnText(['rape'])).toBe(true);
    expect(containsAbusiveDrawnText(['grapes and pears'])).toBe(false);
  });
});

