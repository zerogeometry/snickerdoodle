import type { CSSProperties } from 'react';
import { exampleBySlug } from '@/lib/examples';

/**
 * One real example keepsake (src/lib/examples), taped in as a polaroid — for marketing and
 * empty-state moments ("here's what little drawings become"). Cut-outs sit on paper-2 with their
 * own shadow; the cream photo (cutout: false) fills the frame. Always the example's own alt +
 * intrinsic size; lazy unless `eager` (above the fold).
 */
export function ExamplePolaroid({
  slug,
  tilt = '-2deg',
  tape = 'honey',
  caption = true,
  eager = false,
  className = '',
  style,
}: {
  slug: string;
  tilt?: string;
  /** Tape colour token name (honey, sky, berry, leaf…). */
  tape?: string;
  caption?: boolean;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const e = exampleBySlug(slug);
  return (
    <figure
      className={`polaroid tape ${className}`}
      style={{ ['--tilt' as string]: tilt, ['--tape' as string]: `color-mix(in srgb, var(--color-${tape}) 80%, transparent)`, ...style }}
    >
      <div className={`flex aspect-square items-center justify-center overflow-hidden ${e.cutout ? 'bg-paper-2 p-2.5' : ''}`}>
        <img
          src={e.src}
          alt={e.alt}
          width={e.width}
          height={e.height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={e.cutout ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'}
        />
      </div>
      {caption ? (
        <figcaption className="mt-1.5 text-center text-[12px] font-extrabold leading-tight text-cocoa">{e.caption}</figcaption>
      ) : null}
    </figure>
  );
}
