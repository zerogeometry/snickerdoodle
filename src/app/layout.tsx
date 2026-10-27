import type { Metadata, Viewport } from 'next';
import { siteOrigin } from '@/lib/seo';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
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
// …and the Christmas greeting fonts (offered in season; always printable). Latin only.
import '@fontsource/emilys-candy/latin-400.css';
import '@fontsource/berkshire-swash/latin-400.css';
import '@fontsource/henny-penny/latin-400.css';
import './globals.css';
import { seasonPreviewDate } from '@/lib/season';
import { Toaster } from '@/ui/components/Toaster';
import { CookieBanner } from '@/ui/components/CookieBanner';
import { TestSiteBanner } from '@/ui/components/TestSiteBanner';
import { UploadSession } from '@/ui/components/UploadSession';
import { ServiceWorkerRegister } from '@/ui/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  // the canonical public origin — canonical links, sitemaps and share cards resolve against it
  metadataBase: new URL(siteOrigin()),
  title: { default: 'snickerdoodle — keep the magic', template: '%s · snickerdoodle' },
  description:
    "Turn your little one's drawings into beautiful things you'll treasure forever — framed prints, mugs, cushions, jigsaws, blankets and cards.",
  openGraph: { siteName: 'Snickerdoodle', locale: 'en_GB', type: 'website' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'snickerdoodle', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#F8F5E9',
  // App-like on phones: draw under the notch/home indicator (safe-area padding in the shell).
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request: the proxy's script nonce (src/lib/csp.ts) is new each
  // time and Next stamps it on its scripts at render. A page prerendered at build time would
  // carry no nonce, and the CSP would (rightly) refuse to run it.
  await connection();
  return (
    <html lang="en" data-season-preview={seasonPreviewDate() ?? undefined}>
      <body className="kraft min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-cta focus:px-4 focus:py-2 focus:text-cta-text"
        >
          Skip to content
        </a>
        <UploadSession />
        <TestSiteBanner />
        {children}
        <Toaster />
        <CookieBanner />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
