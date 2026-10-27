import type { MetadataRoute } from 'next';

/**
 * Installable-app manifest (PWA): opens full-screen like a native app, kraft-coloured chrome.
 * Icons come from `node scripts/make-icons.mjs` — today derived from the 1440px lockup (the face is
 * only ~480px there). Regenerate them with the founder's hi-res logo (SVG or ≥1024px) when it
 * arrives: `node scripts/make-icons.mjs <logo.svg>` (flagged, D12).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'snickerdoodle — keep the magic',
    short_name: 'snickerdoodle',
    description: "Turn your little one's drawings into keepsakes, kept in your family's private home.",
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en-GB',
    categories: ['lifestyle', 'shopping', 'photo'],
    background_color: '#F8F5E9',
    theme_color: '#F8F5E9',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
