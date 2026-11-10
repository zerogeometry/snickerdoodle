import { describe, expect, it } from 'vitest';
import { drawBrandFiles } from '@/lib/brand';
import { DRAW_SCREENSHOTS, DRAW_STORE_BADGES, DRAW_VIDEO, showsDrawBubble, storeHref } from '@/lib/drawApp';
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
