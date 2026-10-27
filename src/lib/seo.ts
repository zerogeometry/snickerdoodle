import type { Metadata } from 'next';

/**
 * Search + social-share metadata for the PUBLIC pages only (marketing, trust, the shop front).
 * Private surfaces never use this — they stay noindex (src/lib/indexing.ts + the middleware).
 */
export const SITE_NAME = 'snickerdoodle';
export const OG_IMAGE = { url: '/brand/og-image.png', width: 1200, height: 630, alt: 'snickerdoodle — a child’s drawing made into a framed print and a heart cushion' };

/** The canonical origin, from APP_URL (never a hard-coded host). */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const raw = (env.APP_URL || env.AUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');
  try {
    return new URL(raw);
  } catch {
    return new URL('http://localhost:3000');
  }
}

/**
 * A public page's metadata: title, description, canonical URL, and matching Open Graph + Twitter
 * cards. (Next replaces — doesn't merge — a parent's openGraph, so every public page sets the lot.)
 */
export function publicMetadata({ title, description, path, absoluteTitle = false }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const shareTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_GB', url: path, title: shareTitle, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images: [OG_IMAGE.url] },
  };
}
