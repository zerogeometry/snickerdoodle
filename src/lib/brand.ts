import { isChristmasSeason, seasonClock } from './season';

/**
 * The brand files for the season (public/brand, copied from the shared brand-assets folder by
 * scripts/brand/sync-brand-assets.mjs). In the Christmas season (1 Nov → 6 Jan) the face wears its Santa
 * hat: header logo, favicons, install icons and the share card all switch together, as in Snickerdoodle Draw.
 */
export type BrandSeason = 'everyday' | 'christmas';

export function brandSeason(now: Date = new Date()): BrandSeason {
  return isChristmasSeason(seasonClock(now)) ? 'christmas' : 'everyday';
}

/** Width ÷ height of each header lockup (the hat makes the christmas one taller). */
export const LOGO_RATIO: Record<BrandSeason, number> = { everyday: 2.6965, christmas: 2.4943 };

export function brandFiles(season: BrandSeason) {
  const f = (name: string) => `/brand/${season === 'christmas' ? name.replace(/(\.\w+)$/, '-christmas$1') : name}`;
  return {
    logo: f('snickerdoodle-logo.webp'),
    logoPng: f('snickerlogo.png'),
    favicon32: f('favicon-32.png'),
    favicon192: f('favicon-192.png'),
    favicon512: f('favicon-512.png'),
    apple: f('favicon-180.png'),
    maskable: f('favicon-maskable-512.png'),
    ico: season === 'christmas' ? '/brand/favicon-christmas.ico' : '/favicon.ico',
    og: f('og-default.png'),
  };
}

/** Width ÷ height of the Snickerdoodle Draw lockup (trimmed; the hat makes the christmas one taller). */
export const DRAW_LOGO_RATIO: Record<BrandSeason, number> = { everyday: 2.3129, christmas: 2.1625 };

/** Snickerdoodle Draw's brand files for the season (same brand-assets source and sync script as the site's). */
export function drawBrandFiles(season: BrandSeason) {
  const f = (name: string) => `/brand/${season === 'christmas' ? name.replace(/(\.\w+)$/, '-christmas$1') : name}`;
  return {
    logo: f('draw-logo.webp'),
    icon: f('draw-icon.webp'),
    og: f('draw-og.png'),
  };
}
