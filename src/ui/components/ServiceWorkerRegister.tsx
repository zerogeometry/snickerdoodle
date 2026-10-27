'use client';

import { useEffect } from 'react';

/**
 * Registers the privacy-safe service worker (public/sw.js) — production only, so `next dev` never
 * serves stale chunks. It caches build assets + one offline page, nothing personal.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
