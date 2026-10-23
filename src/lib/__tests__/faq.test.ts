import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAQ, FAQ_PRODUCT_NAMES, FAQ_UPDATED, plainAnswer } from '@/lib/faq';
import { AI_SEARCH_CRAWLERS, PRIVATE_PATHS, PUBLIC_PAGES } from '@/lib/seo';

vi.mock('server-only', () => ({}));

const items = FAQ.flatMap((s) => s.items);
const firstSentence = (a: string) => plainAnswer(a).split(/(?<=[.!?])\s/)[0]!;

describe('the FAQ — written to be quoted by search + answer engines, and true', () => {
  it('every answer opens with a self-contained sentence that names Snickerdoodle', () => {
    const missing = items.filter((it) => !firstSentence(it.a).includes('Snickerdoodle')).map((it) => it.id);
    expect(missing).toEqual([]);
  });

  it('questions are real questions, ids are unique anchors, answers are a useful length', () => {
    const ids = items.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of items) {
      expect(it.q.endsWith('?'), it.id).toBe(true);
      expect(it.id).toMatch(/^[a-z0-9-]+$/);
      const words = plainAnswer(it.a).split(/\s+/).length;
      expect(words, `${it.id}: ${words} words`).toBeGreaterThanOrEqual(15);
      expect(words, `${it.id}: ${words} words`).toBeLessThanOrEqual(90);
    }
  });

  it('every link goes to a public page that exists', () => {
    const publicPaths = new Set(PUBLIC_PAGES.map((p) => p.path));
    for (const it of items) for (const m of it.a.matchAll(/\]\((\/[^)]*)\)/g)) expect(publicPaths.has(m[1]!), `${it.id} → ${m[1]}`).toBe(true);
  });

  it('brand rules: "AI" appears only where the privacy promise talks about training', () => {
    for (const it of items) {
      if (it.id === 'ai-training') continue;
      expect(`${it.q} ${it.a}`, it.id).not.toMatch(/\bAI\b|artificial intelligence/i);
    }
  });

  it('plain answers drop link syntax but keep the words', () => {
    expect(plainAnswer('see [our story](/our-story).')).toBe('see our story.');
  });

  it('a dated, honest "last updated"', () => {
    expect(FAQ_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the FAQ price table covers the whole shop', () => {
  it('every product in the shop has a friendly name (so it can be listed with its price)', async () => {
    const { definedPriceList } = await import('@/server/catalogue');
    const shop = new Set(definedPriceList().filter((r) => r.visibleInShop && !r.paused).map((r) => r.productKey));
    const unnamed = [...shop].filter((k) => !FAQ_PRODUCT_NAMES[k]);
    expect(unnamed).toEqual([]);
  });
});

describe('robots + sitemap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('the test site is closed to every crawler and has no sitemap', async () => {
    vi.stubEnv('SITE_MODE', 'test');
    const robots = (await import('@/app/robots')).default();
    expect(robots.rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    expect((await import('@/app/sitemap')).default()).toEqual([]);
  });

  it('the real site: public pages open (AI search crawlers named), every private path closed, sitemap linked', async () => {
    vi.stubEnv('SITE_MODE', '');
    vi.stubEnv('APP_URL', 'https://snickerdoodle.co.uk');
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    for (const r of rules) {
      expect(r.allow).toBe('/');
      expect(r.disallow).toEqual(PRIVATE_PATHS);
    }
    expect(rules.some((r) => Array.isArray(r.userAgent) && AI_SEARCH_CRAWLERS.every((b) => (r.userAgent as string[]).includes(b)))).toBe(true);
    expect(robots.sitemap).toBe('https://snickerdoodle.co.uk/sitemap.xml');
    const urls = (await import('@/app/sitemap')).default().map((e) => e.url);
    expect(urls).toContain('https://snickerdoodle.co.uk/faq');
    // robots semantics: a rule is a path PREFIX ('/g/' closes gift links, not '/gifts')
    for (const u of urls) for (const p of PRIVATE_PATHS) expect(new URL(u).pathname.startsWith(p), `${u} vs ${p}`).toBe(false);
  });

  it('every path next.config.ts marks noindex is also closed in robots.txt', () => {
    const cfg = readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8');
    const list = /NOINDEX_PATHS\s*=\s*\[([^\]]+)\]/.exec(cfg)![1]!.match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    for (const p of list) expect(PRIVATE_PATHS.some((q) => q.replace(/\/$/, '') === p), p).toBe(true);
  });
});
