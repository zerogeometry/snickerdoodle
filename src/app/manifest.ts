import type { MetadataRoute } from 'next';

/**
 * Installable-app manifest (PWA): opens full-screen like a native app, kraft-coloured chrome.
 * Icons: the founder's smiley-face favicon — only a 100px source exists today; a ≥1024px original
 * is needed for crisp 192/512 install icons (flagged).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'snickerdoodle — keep the magic',
    short_name: 'snickerdoodle',
    description: "Turn your little one's drawings into keepsakes, kept in your family's private home.",
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8F5E9',
    theme_color: '#F8F5E9',
    icons: [{ src: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }],
  };
}
