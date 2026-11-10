import type { MetadataRoute } from 'next';
import { brandFiles, brandSeason } from '@/lib/brand';

/**
 * Installable-app manifest (PWA): opens full-screen like a native app, kraft-coloured chrome.
 * Icons: the smiley face from the shared brand-assets folder (scripts/brand/sync-brand-assets.mjs); the maskable
 * one keeps the face inside Android's safe circle. In the Christmas season the face wears its Santa hat.
 */
export const dynamic = 'force-dynamic';

export default function manifest(): MetadataRoute.Manifest {
  const b = brandFiles(brandSeason());
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
      { src: b.favicon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: b.favicon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: b.maskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
