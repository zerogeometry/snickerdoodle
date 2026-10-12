/**
 * Loading state for a grid of polaroid tiles — the same taped-polaroid silhouette, gently
 * pulsing (opacity only; frozen under prefers-reduced-motion by globals.css), so the page never
 * shows a spinner wall or a blank void while the range loads.
 */
export function TileSkeletonGrid({
  count = 6,
  label = 'loading',
  className = 'grid grid-cols-2 gap-x-4 gap-y-7 pt-3 sm:grid-cols-3 md:grid-cols-4',
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="polaroid tape animate-pulse"
          style={{ ['--tilt' as string]: i % 2 ? '1.2deg' : '-1.4deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-line) 75%, transparent)' }}
        >
          <div className="aspect-square w-full bg-paper-2" />
          <div className="mt-2.5 h-3 w-2/3 rounded-full bg-paper-2" />
          <div className="mt-2 h-11 w-full rounded-pill bg-paper-2" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
