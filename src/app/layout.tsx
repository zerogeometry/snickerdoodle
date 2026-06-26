import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Self-hosted brand fonts, bundled via @fontsource (no build-time or runtime fetch
// to Google — GDPR-clean and works offline). Families: "Fraunces Variable",
// "Mulish Variable", "Caveat Variable" — wired into the tokens in globals.css.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/mulish';
import '@fontsource-variable/caveat';
import './globals.css';
import { Toaster } from '@/ui/components/Toaster';

export const metadata: Metadata = {
  title: { default: 'snickerdoodle — keep the magic', template: '%s · snickerdoodle' },
  description:
    "Turn your little one's drawings into beautiful things you'll treasure forever — cards, prints, mugs, tees, and a storybook they're the hero of.",
};

export const viewport: Viewport = {
  themeColor: '#FBF5E9',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-cta focus:px-4 focus:py-2 focus:text-cta-text"
        >
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
