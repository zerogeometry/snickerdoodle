import { brandFiles, brandSeason, LOGO_RATIO } from '@/lib/brand';

/** The snickerdoodle lockup (face + wordmark), from the shared brand-assets folder (scripts/brand/sync-brand-assets.mjs).
 * In the Christmas season the face wears its Santa hat, as in Snickerdoodle Draw. Decorative inside a labelled
 * home link. One 168px-tall webp covers the tallest header (56px) at 3×. */
export function Logo({ height, className = '' }: { height: number; className?: string }) {
  const season = brandSeason();
  return (
    <img
      src={brandFiles(season).logo}
      alt=""
      width={Math.round(height * LOGO_RATIO[season])}
      height={height}
      decoding="async"
      className={`block shrink-0 ${className}`}
      style={{ height, width: 'auto' }}
    />
  );
}
