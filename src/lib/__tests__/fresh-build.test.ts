import { describe, expect, it } from 'vitest';
import { canReloadOn, isRealBuild, isStaleBuild } from '@/lib/freshBuild';

describe('an open tab moves onto a newer build (founder, 5 Nov: the phone showed the old range)', () => {
  it('only a deploy’s build tag counts — never a dev server’s or an untagged image’s', () => {
    expect(isRealBuild('20261105-1647-b43a436')).toBe(true);
    for (const b of ['dev', 'unknown', '', null, undefined]) expect(isRealBuild(b)).toBe(false);
  });

  it('stale = this page was served by another real build than the live one', () => {
    expect(isStaleBuild('20261105-1647-b43a436', '20261105-1820-f686f56')).toBe(true);
    expect(isStaleBuild('20261105-1820-f686f56', '20261105-1820-f686f56')).toBe(false);
    // nothing to compare → never reload (dev, an untagged box, a health check that said nothing)
    expect(isStaleBuild('dev', '20261105-1820-f686f56')).toBe(false);
    expect(isStaleBuild('20261105-1647-b43a436', undefined)).toBe(false);
    expect(isStaleBuild('20261105-1647-b43a436', 'unknown')).toBe(false);
  });

  it('never reloads over unsaved work: the Studio and checkout are left for the next page', () => {
    for (const p of ['/start-creating', '/customize/socks', '/catalogue', '/home', '/']) expect(canReloadOn(p), p).toBe(true);
    for (const p of ['/studio', '/studio/position', '/checkout', '/checkout/confirmation']) expect(canReloadOn(p), p).toBe(false);
    expect(canReloadOn('/studios-not-ours')).toBe(true);
  });
});
