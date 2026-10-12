import type { MetadataRoute } from 'next';

/**
 * Installable-app manifest (PWA): opens full-screen like a native app, kraft-coloured chrome.
 * Icons: the founder's badge — only a 141px source exists today; a ≥1024px original is needed
 * for crisp 192/512 install icons (flagged).
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
    background_color: '#EBDDC6',
    theme_color: '#EBDDC6',
    icons: [{ src: '/brand/snickerdoodle-badge.png', sizes: '141x141', type: 'image/png', purpose: 'any' }],
  };
}
