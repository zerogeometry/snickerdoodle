/*
 * snickerdoodle service worker — minimal and PRIVACY-SAFE by construction.
 *
 * It caches ONLY: the build's own static assets (/_next/static/… — hashed JS/CSS/fonts, the same
 * for every visitor), the brand icons + manifest, and one branded offline page. It NEVER caches
 * a page someone navigated to, an API response, a server action, a signed storage URL (another
 * origin — never intercepted), a gift/join link, or any image of a child: those are private and
 * short-lived, and a phone's cache is no place for them. Navigations are always network-first
 * with nothing stored; only when the network is gone does the offline page stand in.
 *
 * Registered only in production (src/ui/components/ServiceWorkerRegister.tsx).
 */
const VERSION = 'v1';
const CACHE = `sd-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const SHELL = [OFFLINE_URL, '/manifest.webmanifest', '/brand/icon-192.png', '/brand/icon-512.png', '/brand/snickerdoodle-logo.webp'];

/** Same-origin build assets that are identical for everyone (content-hashed, immutable). */
const isBuildAsset = (url) => url.pathname.startsWith('/_next/static/');
/** Public brand files (icons, logo, manifest) — never user content. */
const isBrandFile = (url) => url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest';

const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The offline page, plus the hashed CSS/JS/fonts it needs, so it renders in brand style.
      const res = await fetch(OFFLINE_URL, { cache: 'no-store', credentials: 'omit' });
      if (cacheable(res)) {
        const html = await res.clone().text();
        await cache.put(OFFLINE_URL, res);
        const assets = [...new Set([...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
        await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
      }
      await Promise.all(SHELL.slice(1).map((a) => cache.add(a).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // server actions, uploads, forms: straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // signed storage URLs, Stripe… never touched

  if (req.mode === 'navigate') {
    // Network only — pages (home, family, gift links…) are never stored. Offline → the offline page.
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }

  if (isBuildAsset(url)) {
    // cache-first: hashed file names never change content
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (cacheable(res)) cache.put(req, res.clone()).catch(() => undefined);
        return res;
      })(),
    );
    return;
  }

  if (isBrandFile(url)) {
    // stale-while-revalidate
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (cacheable(res)) cache.put(req, res.clone()).catch(() => undefined);
            return res;
          })
          .catch(() => hit || Response.error());
        if (!hit) return fresh;
        event.waitUntil(fresh.then(() => undefined));
        return hit;
      })(),
    );
  }
  // everything else (API, RSC payloads, /_next/image, uploads, examples…): not intercepted
});
