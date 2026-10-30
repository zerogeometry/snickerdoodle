import { describe, expect, it } from 'vitest';
import { withArticle } from '../articles';

describe('withArticle (09-B12: "add a …" labels read properly)', () => {
  it.each([
    ['mug', 'a mug'],
    ['adult tee', 'an adult tee'],
    ['apron', 'an apron'],
    ['ceramic christmas ornament', 'a ceramic christmas ornament'],
    ['placemats', 'placemats'],
    ['coasters', 'coasters'],
    ['socks', 'socks'],
    ['playing cards', 'playing cards'],
    ['wrapping paper', 'wrapping paper'],
    ['gift wrap', 'gift wrap'],
    ['washi tape', 'washi tape'],
    ['heart', 'a heart'],
    ['gold frame', 'a gold frame'],
  ])('%s → %s', (noun, want) => expect(withArticle(noun)).toBe(want));
});
