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

describe('whole swear words only (founder, 11 Nov 2026, D28)', () => {
  it('catches swear words and slurs standing on their own, in any case, next to punctuation', () => {
    for (const bad of ['FUCK', 'what the fuck!', 'fucking hell', 'shit', 'bullshit', 'Shite', 'you cunt', 'WANKER', 'wankers', 'twat', 'dickhead', 'bitch', 'bastard', 'slut', 'whore', 'piss off', 'pissed', 'bollocks', 'arsehole', 'asshole', 'paedo', 'nonce', 'rape', 'mother-fucker', '"shit"', "fuckin'"]) {
      expect(containsAbusiveText(bad), bad).toBe(true);
    }
  });

  it('letters inside a longer word never count', () => {
    for (const fine of ['swanky', 'Scunthorpe United', 'grapes', 'drape', 'scrape', 'trapeze', 'parapet', 'class 3', 'classic', 'Dickens', 'Hitchcock', 'cocktail', 'Penistone', 'Shitake', 'Pissarro', 'Cunningham', 'encyclopaedia', 'announce', 'Bollinger', 'Arsenal', 'bassett']) {
      expect(containsAbusiveText(fine), fine).toBe(false);
    }
  });

  it('names and everyday words that double as rude words are never stopped', () => {
    for (const fine of ['Dick', 'Dick Whittington', 'love from Grandad Dick', 'Moby Dick', 'pussy cat', 'Puss in Boots', 'Fanny', 'Aunt Fanny', 'cock-a-doodle-doo', 'the cock crowed', 'a fag', 'door knob', 'willy wonka', 'blue tit', 'bum bag', 'Willy']) {
      expect(containsAbusiveText(fine), fine).toBe(false);
    }
  });

  it('a child named Dick or Fanny can be added', () => {
    expect(screenChildFirstName('Dick')).toEqual({ ok: true, value: 'Dick' });
    expect(screenChildFirstName('Fanny')).toEqual({ ok: true, value: 'Fanny' });
  });
});

describe('containsAbusiveDrawnText — printed words read from a picture: the same whole-word check', () => {
  it('ordinary writing that the old joined-up, look-alike matching turned into swear words now passes', () => {
    // each of these flagged a clean picture under the 9–10 Nov matching (gaps squashed, w/u/v and l/1/i folded)
    for (const fine of ['push it', 'wish it would snow', 'I wish it was Christmas', 'fish it out', 'Josh! Tom', 'she is hit by a snowball', 'hot water bottle', 'eat watermelon', 'cat watching TV', 'Pop is so cool', 'Pip is super', 'who remembers', 'grass hole', 'lion on cereal', 'I love you Anka', 'Ivanka', 'situation', 'punctuation', 'WAN KER']) {
      expect(containsAbusiveDrawnText([fine]), fine).toBe(false);
    }
  });

  it('wobbly children’s lettering and misreads pass (real reads of sample drawings)', () => {
    for (const fine of ['fREASVRE', 'V ME IN', 'CH ISTmA5', 'suPERPIE', 'S WUD', 'MERY', 'qoK0H0', 'my DOG', 'SPARKLE', 'MERRY CHRISTMAS', 'love you nana', 'Olivia age 6', 'TO MUMMY', 'Max 4', 'sh1t', 'fvck', 'f u c k', 'VANKER']) {
      expect(containsAbusiveDrawnText([fine]), fine).toBe(false);
    }
  });

  it('a swear word printed as a word of its own is still caught (a slogan, a sign)', () => {
    expect(containsAbusiveDrawnText(['NO', 'FUCKS', 'GIVEN'])).toBe(true);
    expect(containsAbusiveDrawnText(['Happy Birthday', 'you old bastard'])).toBe(true);
    expect(containsAbusiveDrawnText(['WANKER'])).toBe(true);
  });

  it('lines are never glued to each other', () => {
    expect(containsAbusiveDrawnText(['Wan', 'Ker'])).toBe(false);
    expect(containsAbusiveDrawnText(['sh', 'it'])).toBe(false);
  });
});
