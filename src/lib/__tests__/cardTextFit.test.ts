import { describe, expect, it } from 'vitest';
import { fitCardFontSize, wrapLineCount } from '@/lib/cardTextFit';

// The preview uses a 40×60 cqw padded page box with base = 0.085×50×scale cqw; the print renderer
// uses the same fractions in px. These tests pin the two behaviours the founder asked for:
//  1. consistency — short text on every field renders at the SAME base size;
//  2. no clipping — long text shrinks below base to fit its box.
const BOX_W = 40;
const BOX_H = 60;
const base = 0.085 * 50; // = 4.25 cqw at scale 1

// The founder's screenshot verse (~110 chars) — the field that was clipping at the old oversized base.
const VERSE = "love you for all your days, Your Mum will care in so many ways, This is the family you'll cherish for life";

describe('fitCardFontSize — consistent base, shrink-to-fit', () => {
  it('short text stays exactly at the base size (so every panel matches)', () => {
    expect(fitCardFontSize(['Dear Sonny'], BOX_W, BOX_H, base)).toBe(base);
    expect(fitCardFontSize(['Happy Birthday!'], BOX_W, BOX_H, base)).toBe(base);
  });

  it("the screenshot verse now FITS at the base (no shrink, no clip) — the exact bug", () => {
    expect(fitCardFontSize([VERSE], BOX_W, BOX_H, base)).toBe(base);
  });

  it('the left note and the right block both render at the base for short content ⇒ CONSISTENT', () => {
    const left = fitCardFontSize([VERSE], BOX_W, BOX_H, base);
    const right = fitCardFontSize(['Dear Sonny', 'Happy Birthday!', 'with all our love, Mummy & Daddy'], BOX_W, BOX_H, base, { gapLines: 1 });
    expect(left).toBe(base);
    expect(right).toBe(base);
    expect(left).toBe(right); // no field is arbitrarily bigger than another
  });

  it('a very long field shrinks BELOW the base to fit (never clips)', () => {
    const longNote = 'a'.repeat(600); // far beyond the 200-char note cap — must shrink hard
    const fitted = fitCardFontSize([longNote], BOX_W, BOX_H, base);
    expect(fitted).toBeLessThan(base);
    expect(fitted).toBeGreaterThan(0);
  });

  it('is monotonic — more text never renders LARGER', () => {
    const short = fitCardFontSize(['one line'], BOX_W, BOX_H, base);
    const medium = fitCardFontSize(['x'.repeat(200)], BOX_W, BOX_H, base);
    const long = fitCardFontSize(['x'.repeat(500)], BOX_W, BOX_H, base);
    expect(medium).toBeLessThanOrEqual(short);
    expect(long).toBeLessThanOrEqual(medium);
  });

  it('the fitted size actually fits the box height, counted with REAL word-wrap (clip-safe)', () => {
    const longNote = 'word '.repeat(120); // ~600 chars of real words
    const fs = fitCardFontSize([longNote], BOX_W, BOX_H, base);
    const cpl = (BOX_W / (0.5 * fs)) * 0.94;
    expect(wrapLineCount(longNote, cpl) * 1.3 * fs).toBeLessThanOrEqual(BOX_H + 1e-6);
  });

  it('a LONG-WORD verse (the grandparent case) shrinks to fit — the perfect-packing clip bug is gone', () => {
    // Long words can't be split across lines, so ceil(chars/cpl) under-counted and left it at base
    // (which then clipped in print). Real greedy wrap forces one long word per line ⇒ it must shrink.
    const note = 'celebrating '.repeat(14).trim(); // 167 chars, all 11-letter words (within the 200 cap)
    const fs = fitCardFontSize([note], BOX_W, BOX_H, base);
    expect(fs).toBeLessThan(base); // it DID shrink (would have clipped at base before the fix)
    const cpl = (BOX_W / (0.5 * fs)) * 0.94;
    expect(wrapLineCount(note, cpl) * 1.3 * fs).toBeLessThanOrEqual(BOX_H + 1e-6); // and now fits
  });

  it('wrapLineCount uses greedy word-wrap: long words break, short words pack', () => {
    expect(wrapLineCount('', 10)).toBe(1);
    expect(wrapLineCount('hello world', 20)).toBe(1); // both fit on one line
    expect(wrapLineCount('hello world', 7)).toBe(2); // "hello" then "world"
    expect(wrapLineCount('a b c', 1)).toBe(3); // each single char its own line
    expect(wrapLineCount('supercalifragilistic', 5)).toBe(4); // one 20-char word breaks into ⌈20/5⌉
    expect(wrapLineCount('line one\nline two', 20)).toBe(2); // explicit newline = 2 rows
  });

  it('empty / whitespace segments return the base (nothing to shrink)', () => {
    expect(fitCardFontSize([''], BOX_W, BOX_H, base)).toBe(base);
    expect(fitCardFontSize(['   ', ''], BOX_W, BOX_H, base)).toBe(base);
  });

  it('PREVIEW (cqw) and PRINT (px) agree — the fit is scale-invariant', () => {
    // Scale the whole system (box + base) by λ and the fitted size scales by exactly λ — so the same
    // fraction-of-panel comes out whether we compute in cqw (preview) or px (print).
    const long = 'x'.repeat(450);
    const cqwFit = fitCardFontSize([long], BOX_W, BOX_H, base);
    const lambda = 36.7; // arbitrary px-per-cqw
    const pxFit = fitCardFontSize([long], BOX_W * lambda, BOX_H * lambda, base * lambda);
    expect(pxFit).toBeCloseTo(cqwFit * lambda, 4);
  });
});
