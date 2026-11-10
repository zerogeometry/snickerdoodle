import { describe, expect, it } from 'vitest';
import { drawBrandFiles } from '@/lib/brand';
import { DRAW_SCREENSHOTS, DRAW_STORE_BADGES, DRAW_VIDEO, showsDrawBubble, storeHref } from '@/lib/drawApp';
import { DRAW_FAQ, FAQ, plainAnswer } from '@/lib/faq';
import { llmsTxt } from '@/lib/llmsTxt';
import { PUBLIC_PAGES } from '@/lib/seo';
import { PUBLIC_FILES } from '@/lib/siteMode';

describe('storeHref', () => {
  const none = { appStore: null, googlePlay: null };

  it('is null until a link is set ("coming soon")', () => {
    expect(storeHref('appStore', none)).toBeNull();
    expect(storeHref('googlePlay', none)).toBeNull();
  });

  it('passes a real store link through', () => {
    const links = { appStore: 'https://apps.apple.com/gb/app/snickerdoodle-draw/id123', googlePlay: 'https://play.google.com/store/apps/details?id=uk.co.snickerdoodle.draw' };
    expect(storeHref('appStore', links)).toBe(links.appStore);
    expect(storeHref('googlePlay', links)).toBe(links.googlePlay);
  });

  it('refuses a link to the wrong place, plain http, or a typo', () => {
    expect(storeHref('appStore', { ...none, appStore: 'https://play.google.com/store/apps/details?id=x' })).toBeNull();
    expect(storeHref('appStore', { ...none, appStore: 'http://apps.apple.com/app/id1' })).toBeNull();
    expect(storeHref('googlePlay', { ...none, googlePlay: 'https://play.google.com.evil.example/x' })).toBeNull();
    expect(storeHref('googlePlay', { ...none, googlePlay: 'play.google.com/store' })).toBeNull();
  });
});

describe('showsDrawBubble', () => {
  it('shows on the browsing pages and the Keepsake Home', () => {
    for (const p of ['/', '/how-it-works', '/gifts', '/our-story', '/faq', '/help', '/home', '/family', '/gifts/']) {
      expect(showsDrawBubble(p)).toBe(true);
    }
  });

  it('never on the app page itself or a task screen', () => {
    for (const p of ['/draw', '/checkout', '/studio', '/studio/position', '/start-creating', '/customize/mug', '/login', '/account', '/orders', '/join/abc', '/g/abc', '/app/connect', '/products/mugs', '/trust/privacy', null]) {
      expect(showsDrawBubble(p)).toBe(false);
    }
  });
});

describe('the /draw questions — the FAQ’s rules, and honest about the stores', () => {
  const firstSentence = (a: string) => plainAnswer(a).split(/(?<=[.!?])\s/)[0]!;
  const all = [...DRAW_FAQ, ...FAQ.flatMap((s) => s.items)];

  it('ten at most, each opening with a self-contained sentence that names Snickerdoodle Draw', () => {
    expect(DRAW_FAQ.length).toBeLessThanOrEqual(10);
    expect(DRAW_FAQ.filter((it) => !firstSentence(it.a).includes('Snickerdoodle Draw')).map((it) => it.id)).toEqual([]);
  });

  it('real questions, a useful length, unique anchors (also against the main FAQ), links to public pages, no "AI"', () => {
    const ids = all.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
    const publicPaths = new Set(PUBLIC_PAGES.map((p) => p.path));
    for (const it of DRAW_FAQ) {
      expect(it.q.endsWith('?'), it.id).toBe(true);
      const words = plainAnswer(it.a).split(/\s+/).length;
      expect(words, `${it.id}: ${words} words`).toBeGreaterThanOrEqual(15);
      expect(words, `${it.id}: ${words} words`).toBeLessThanOrEqual(90);
      for (const m of it.a.matchAll(/\]\((\/[^)]*)\)/g)) expect(publicPaths.has(m[1]!.split('#')[0]!), `${it.id} → ${m[1]}`).toBe(true);
      expect(`${it.q} ${it.a}`, it.id).not.toMatch(/\bAI\b|artificial intelligence/i);
    }
  });

  it('never claims the app can be downloaded while no store link is set', () => {
    if (storeHref('appStore') || storeHref('googlePlay')) return;
    for (const it of all.filter((i) => /App Store|Google Play/.test(i.a))) expect(it.a, it.id).toMatch(/coming soon to the App Store/);
  });
});

describe('/llms.txt — the site in plain words for answer engines', () => {
  const txt = llmsTxt('https://snickerdoodle.co.uk');

  it('carries every question and answer from /faq and /draw, with a source link to each', () => {
    for (const it of FAQ.flatMap((s) => s.items)) {
      expect(txt).toContain(`### ${it.q}\n${plainAnswer(it.a)}`);
      expect(txt).toContain(`https://snickerdoodle.co.uk/faq#${it.id}`);
    }
    for (const it of DRAW_FAQ) expect(txt).toContain(`https://snickerdoodle.co.uk/draw#${it.id}`);
  });

  it('says who we are, links only public pages, and has no leftover link syntax', () => {
    expect(txt).toMatch(/^# Snickerdoodle\n\n> /);
    expect(txt).toContain('16671398');
    const publicPaths = new Set(PUBLIC_PAGES.map((p) => p.path));
    for (const m of txt.matchAll(/\]\(https:\/\/snickerdoodle\.co\.uk([^)]*)\)/g)) expect(publicPaths.has(m[1] || '/'), m[1]).toBe(true);
    expect(txt).not.toMatch(/\]\(\//);
  });
});

describe('Draw files on the site', () => {
  it('every picture the /draw page uses is a real public file', () => {
    const brand = (['everyday', 'christmas'] as const).flatMap((s) => Object.values(drawBrandFiles(s)));
    const film = DRAW_VIDEO.src ? [DRAW_VIDEO.src] : [];
    const badges = Object.values(DRAW_STORE_BADGES).filter((b): b is string => b !== null);
    for (const f of [...DRAW_SCREENSHOTS.map((s) => s.src), DRAW_VIDEO.poster, ...film, ...badges, ...brand]) {
      expect(PUBLIC_FILES.has(f)).toBe(true);
    }
  });
});
