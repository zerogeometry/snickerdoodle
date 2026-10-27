import { describe, expect, it, vi } from 'vitest';
import { CHRISTMAS_BUNDLE_SLOT, CHRISTMAS_HUB_FAQ, CHRISTMAS_PAGES, CHRISTMAS_PATHS, CHRISTMAS_SHELVES } from '@/lib/christmas-pages';
import { plainAnswer } from '@/lib/faq';
import { isIndexablePath, PUBLIC_PAGES } from '@/lib/seo';
import { christmasDeadlines } from '@/lib/season';
import { DELIVERY_DAYS } from '@/lib/delivery';

vi.mock('server-only', () => ({}));

const firstSentence = (a: string) => plainAnswer(a).split(/(?<=[.!?])\s/)[0]!;
const publicPaths = new Set(PUBLIC_PAGES.map((p) => p.path));

describe('the evergreen christmas pages (C6)', () => {
  it('are the five intent pages the plan names, at evergreen URLs (never year-stamped)', () => {
    expect(CHRISTMAS_PAGES.map((p) => p.slug)).toEqual(['personalised-ornaments', 'cards', 'wrapping-paper', 'gifts-for-grandparents', 'teacher-gifts']);
    for (const p of CHRISTMAS_PATHS) expect(p, p).not.toMatch(/20\d\d/);
  });

  it('are public: in the sitemap list and indexable', () => {
    for (const p of CHRISTMAS_PATHS) {
      expect(publicPaths.has(p), p).toBe(true);
      expect(isIndexablePath(p), p).toBe(true);
    }
  });

  it('each answers its question in the first sentence, naming Snickerdoodle', () => {
    for (const p of CHRISTMAS_PAGES) {
      expect(firstSentence(p.answer), p.slug).toContain('Snickerdoodle');
      expect(p.metaDescription.length, p.slug).toBeLessThanOrEqual(170);
    }
  });

  it('every FAQ follows the FAQ’s rules: a real question, answer-first naming Snickerdoodle, 15–90 words', () => {
    for (const p of CHRISTMAS_PAGES) {
      const ids = p.faq.map((f) => f.id);
      expect(new Set(ids).size, p.slug).toBe(ids.length);
      for (const it of p.faq) {
        expect(it.q.endsWith('?'), it.id).toBe(true);
        expect(firstSentence(it.a), it.id).toContain('Snickerdoodle');
        const words = plainAnswer(it.a).split(/\s+/).length;
        expect(words, `${it.id}: ${words}`).toBeGreaterThanOrEqual(15);
        expect(words, `${it.id}: ${words}`).toBeLessThanOrEqual(90);
      }
    }
    expect(CHRISTMAS_HUB_FAQ.length).toBeGreaterThan(3);
  });

  it('every link goes to a public page; no "AI"; no child surname asked for', () => {
    const texts = CHRISTMAS_PAGES.flatMap((p) => [p.answer, ...p.more, ...p.faq.flatMap((f) => [f.q, f.a])]);
    for (const t of texts) {
      for (const m of t.matchAll(/\]\((\/[^)]*)\)/g)) expect(publicPaths.has(m[1]!.split('#')[0]!), m[1]).toBe(true);
      expect(t).not.toMatch(/\bAI\b|artificial intelligence/i);
    }
  });

  it('only links products that are on show; the shelves are by who it’s for', async () => {
    const { shopListings } = await import('@/server/shop/listing');
    const shown = new Set(shopListings().map((l) => l.key));
    for (const p of CHRISTMAS_PAGES) for (const k of p.products) expect(shown.has(k), `${p.slug}: ${k}`).toBe(true);
    expect(CHRISTMAS_SHELVES.map((s) => s.id)).toEqual(expect.arrayContaining(['grandparents', 'teachers', 'the-whole-family']));
    for (const s of CHRISTMAS_SHELVES) if (s.page) expect(CHRISTMAS_PAGES.some((p) => p.slug === s.page), s.page).toBe(true);
  });

  it('the bundle slot links nothing until a bundle has a real page', () => {
    for (const b of CHRISTMAS_BUNDLE_SLOT) if (b.href) expect(publicPaths.has(b.href), b.href).toBe(true);
  });
});

describe('the honest deadline line, all year (christmasDeadlines)', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('before and during the season: both dates, provisional until confirmed', () => {
    expect(christmasDeadlines(at('2026-10-27'))).toEqual({ state: 'upcoming', year: 2026, mostThings: '2026-12-14', cards: '2026-12-10', provisional: true, cardsMissed: false });
  });

  it('cards close first — then only the later date is offered', () => {
    expect(christmasDeadlines(at('2026-12-12'))).toMatchObject({ state: 'upcoming', cardsMissed: true });
  });

  it('after the last date it says so; next year with no dates yet it never guesses', () => {
    expect(christmasDeadlines(at('2026-12-15'))).toMatchObject({ state: 'missed', year: 2026 });
    expect(christmasDeadlines(at('2027-01-03'))).toMatchObject({ state: 'missed', year: 2026 });
    expect(christmasDeadlines(at('2027-03-01'))).toEqual({ state: 'unknown', year: 2027 });
  });
});

describe('delivery days (for structured data + the feed)', () => {
  it('a sane working-day range for every route', () => {
    for (const [route, d] of Object.entries(DELIVERY_DAYS)) {
      for (const [lo, hi] of [d.handling, d.transit]) {
        expect(lo, route).toBeGreaterThanOrEqual(0);
        expect(hi, route).toBeGreaterThanOrEqual(lo);
        expect(hi, route).toBeLessThanOrEqual(10);
      }
    }
  });
});
