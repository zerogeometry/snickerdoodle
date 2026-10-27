import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Self-hosted brand fonts, bundled via @fontsource (no build-time or runtime fetch
// to Google — GDPR-clean and works offline). Scrapbook direction (D12): "Bricolage
// Grotesque Variable" (display + UI) and Gaegu (the one handwritten moment, latin only).
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/gaegu/latin-700.css';
// The greetings-card message fonts — casual/friendly, offered in the "add a message" picker.
// Self-hosted via @fontsource too (no CDN). See src/lib/card-fonts.ts for the shared registry.
import '@fontsource-variable/caveat';
import '@fontsource/patrick-hand';
import '@fontsource/gochi-hand';
import '@fontsource/shadows-into-light';
import '@fontsource-variable/baloo-2';
import './globals.css';
import { Toaster } from '@/ui/components/Toaster';
import { CookieBanner } from '@/ui/components/CookieBanner';
import { TestSiteBanner } from '@/ui/components/TestSiteBanner';
import { ServiceWorkerRegister } from '@/ui/components/ServiceWorkerRegister';
import { OG_IMAGE, SITE_NAME, siteUrl } from '@/lib/seo';

const DESCRIPTION =
  "Turn your little one's drawings into beautiful things you'll treasure forever — framed prints, mugs, cushions, jigsaws, blankets and cards.";

export const metadata: Metadata = {
  // canonical + share URLs resolve against the configured origin (APP_URL), never a hard-coded host
  metadataBase: siteUrl(),
  applicationName: SITE_NAME,
  title: { default: 'snickerdoodle — keep the magic', template: '%s · snickerdoodle' },
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'snickerdoodle', statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Share cards for any page that doesn't set its own (public pages do, via publicMetadata()).
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_GB', title: 'snickerdoodle — keep the magic', description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: 'snickerdoodle — keep the magic', description: DESCRIPTION, images: [OG_IMAGE.url] },
};

export const viewport: Viewport = {
  themeColor: '#EBDDC6',
  // App-like on phones: draw under the notch/home indicator (safe-area padding in the shell).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="kraft min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-cta focus:px-4 focus:py-2 focus:text-cta-text"
        >
          Skip to content
        </a>
        <TestSiteBanner />
        {children}
        <Toaster />
        <CookieBanner />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
