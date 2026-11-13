import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeFlakes, showsPageSnow, snowPaper } from '@/lib/snow';
import { PUBLIC_FILES } from '@/lib/siteMode';

describe('Christmas snow', () => {
  it('falls only in the Christmas season', () => {
    expect(showsPageSnow('/how-it-works', true)).toBe(true);
    expect(showsPageSnow('/how-it-works', false)).toBe(false);
    expect(showsPageSnow(null, true)).toBe(false);
  });

  it('covers the pages the founder named, and their sub-pages', () => {
    for (const p of ['/how-it-works', '/our-story', '/home', '/family', '/start-creating', '/catalogue', '/customize/mug', '/checkout', '/checkout/confirmation', '/orders'])
      expect(showsPageSnow(p, true), p).toBe(true);
  });

  it('leaves the rest alone: the homepage (its hero has its own), the studio, trust, sign-in, the app', () => {
    for (const p of ['/', '/studio', '/studio/abc', '/trust/privacy', '/login', '/draw', '/app/checkout/x', '/homes', '/orders-old'])
      expect(showsPageSnow(p, true), p).toBe(false);
  });

  it('paints the same paper as the page under it', () => {
    expect(snowPaper('/our-story')).toBe('kraft');
    expect(snowPaper('/catalogue')).toBe('oat');
  });

  it('is the same scatter every time (server and browser agree), at three depths, half on phones', () => {
    const a = makeFlakes();
    expect(makeFlakes()).toEqual(a);
    expect(a.length).toBeGreaterThan(60);
    expect(a.filter((f) => !f.lite).length).toBeGreaterThan(30);
    const big = a.filter((f) => f.size >= 26);
    const tiny = a.filter((f) => f.size <= 8);
    expect(big.length).toBeGreaterThan(5);
    expect(tiny.length).toBeGreaterThan(big.length * 2);
    // near (big) flakes fall faster than the far specks, as they look to
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(big.map((f) => f.fall))).toBeLessThan(avg(tiny.map((f) => f.fall)));
    for (const f of a) {
      expect(f.at).toBeGreaterThanOrEqual(0);
      expect(f.at).toBeLessThanOrEqual(f.fall);
    }
  });

  it('its pictures are real public files', () => {
    for (const f of ['/textures/snowflake.webp', '/textures/snow-dot.webp']) {
      expect(PUBLIC_FILES.has(f)).toBe(true);
      expect(existsSync(path.join(process.cwd(), 'public', f))).toBe(true);
    }
  });
});
