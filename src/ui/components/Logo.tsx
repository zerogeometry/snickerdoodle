/** The snickerdoodle lockup (face + wordmark — founder master, 5 Nov 2026; built by scripts/brand/build-brand-assets.mjs).
 * Decorative inside a labelled home link. One 168px-tall webp covers the tallest header (56px) at 3×. */
const RATIO = 453 / 168;

export function Logo({ height, className = '' }: { height: number; className?: string }) {
  return <img src="/brand/snickerdoodle-logo.webp" alt="" width={Math.round(height * RATIO)} height={height} decoding="async" className={`block shrink-0 ${className}`} style={{ height, width: 'auto' }} />;
}
