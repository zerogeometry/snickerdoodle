'use client';

import { useEffect } from 'react';
import { canReloadOn, FRESH_CHECK_GAP_MS, isRealBuild, isStaleBuild } from '@/lib/freshBuild';

/**
 * Keeps an open tab on the live build (src/lib/freshBuild.ts): when the parent comes back to the tab (or the
 * phone restores it from its back/forward memory) and the site has been updated since the page loaded, the page
 * reloads onto the new build. `build` = the build that served this page (the root layout, per request).
 */
export function FreshBuild({ build }: { build: string }) {
  useEffect(() => {
    if (!isRealBuild(build)) return;
    let last = 0;
    let asking = false;
    const check = async (force = false) => {
      if (asking || (!force && Date.now() - last < FRESH_CHECK_GAP_MS)) return;
      asking = true;
      last = Date.now();
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const live = ((await res.json()) as { build?: string }).build;
        if (isStaleBuild(build, live) && canReloadOn(window.location.pathname)) window.location.reload();
      } catch {
        /* offline or mid-deploy — ask again next time */
      } finally {
        asking = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check(true); // restored from the back/forward memory, as it was
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, [build]);
  return null;
}
