import { EXAMPLES, exampleBySlug } from '@/lib/examples';

const HERO = ['tractor-cushion', 'family-mug', 'zebra-framed-print', 'rainbow-heart-cushion', 'puppy-card'].map(exampleBySlug);

/**
 * The hero: real keepsakes (made from children's drawings) crossfading in turn, floating on the
 * page with their own shadows. Pure CSS (the existing .morph-frame keyframes, 2.6s per frame,
 * 5 frames), compositor-only, and frozen on the first keepsake under prefers-reduced-motion.
 */
export function ExampleMorph({ className = '' }: { className?: string }) {
  return (
    <div className={`hero-bob relative aspect-square w-full ${className}`} role="img" aria-label="Keepsakes made from children’s drawings: a tractor cushion, a family mug, a zebra in a gold frame, a rainbow heart cushion and a puppy card">
      {HERO.map((e, i) => (
        <div key={e.slug} className="morph-frame" style={{ ['--morph-i' as string]: i }} aria-hidden>
          <img
            src={e.src}
            alt=""
            width={e.width}
            height={e.height}
            decoding="async"
            fetchPriority={i === 0 ? 'high' : 'low'}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ))}
    </div>
  );
}

export { EXAMPLES };
