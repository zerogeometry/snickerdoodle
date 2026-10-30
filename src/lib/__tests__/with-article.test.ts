import { describe, expect, it } from 'vitest';
import { withArticle } from '@/lib/with-article';

describe('09-B12: "add …" labels read properly', () => {
  it.each([
    ['mug', 'a mug'],
    ['adult tee', 'an adult tee'],
    ['apron', 'an apron'],
    ['placemats', 'placemats'],
    ['coasters', 'coasters'],
    ['socks', 'socks'],
    ['playing cards', 'playing cards'],
    ['wrapping paper', 'wrapping paper'],
    ['christmas sack', 'a christmas sack'],
  ])('%s → %s', (label, expected) => {
    expect(withArticle(label)).toBe(expected);
  });
});
