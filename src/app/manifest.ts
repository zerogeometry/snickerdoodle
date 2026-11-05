import type { MetadataRoute } from 'next';

/**
 * Installable-app manifest (PWA): opens full-screen like a native app, kraft-coloured chrome.
 * Icons: the founder's smiley face, cut from the high-res logo master (scripts/brand/build-brand-assets.mjs)
 * so the 512px install icons are crisp; the maskable one keeps the face inside Android's safe circle.
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
    icons: [
      { src: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/favicon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
