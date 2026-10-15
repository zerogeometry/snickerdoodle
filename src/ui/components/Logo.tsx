/** The snickerdoodle lockup (face + wordmark). Decorative inside a labelled home link. */
const RATIO = 533 / 168;

export function Logo({ height, className = '' }: { height: number; className?: string }) {
  return <img src="/brand/snickerdoodle-logo.webp" alt="" width={Math.round(height * RATIO)} height={height} decoding="async" className={`block shrink-0 ${className}`} style={{ height, width: 'auto' }} />;
}
