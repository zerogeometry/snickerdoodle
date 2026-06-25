import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Caveat, Fraunces, Mulish } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font (no runtime call to Google — GDPR-clean,
// no FOUT). Axes match the mockups: Fraunces 500/600 + italic, Mulish 400–800, Caveat 600.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});
const mulish = Mulish({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-mulish',
  display: 'swap',
});
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-caveat',
  display: 'swap',
});

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
    <html lang="en" className={`${fraunces.variable} ${mulish.variable} ${caveat.variable}`}>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-cta focus:px-4 focus:py-2 focus:text-cta-text"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
