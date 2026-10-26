import { IconCards, IconCup, IconPhoto, IconHeart, IconPencil, IconPuzzle } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';

/**
 * The "between" moment: the drawing has landed, the range is being made. Instead of a wall of
 * grey tiles, the child's own drawing sits taped in a polaroid while a crayon scribbles and little
 * keepsakes pop out around it, with a line of playful copy that changes every couple of seconds.
 *
 * CSS only (transform/opacity, no JS timers) — see `.loader-*` in globals.css. The copy lines are
 * stacked in one grid cell and take turns fading in; under prefers-reduced-motion everything sits
 * still and only the first line shows. The changing line is
 * aria-hidden; screen readers hear one calm status ("making your collection…") instead of a ticker.
 */
// 7 lines — the .loader-line cycle in globals.css is timed for exactly this many.
const LINES = [
  'warming up the crayons…',
  'framing the wonky bits in gold…',
  'popping it on a mug…',
  'fluffing the cushions…',
  'cutting the jigsaw pieces (carefully)…',
  'sticking it on the fridge, briefly…',
  'keeping the magic…',
];

// Offsets are px from the polaroid's centre (it's ~150–170px wide), so the keepsakes land just
// outside its edges.
const ORBIT = [
  { icon: IconPhoto, x: '-108px', y: '-30px', tint: 'bg-honey', rot: '-8deg' },
  { icon: IconCup, x: '104px', y: '-52px', tint: 'bg-sky', rot: '7deg' },
  { icon: IconHeart, x: '108px', y: '50px', tint: 'bg-berry', rot: '-5deg' },
  { icon: IconPuzzle, x: '-102px', y: '64px', tint: 'bg-meadow', rot: '6deg' },
  { icon: IconCards, x: '-6px', y: '-118px', tint: 'bg-honey-band', rot: '-4deg' },
];

export function MakingRangeLoader({ drawing, className = '' }: { drawing?: string | null; className?: string }) {
  return (
    // Phones: it sits right under "your masterpiece, made real" (the hidden range beneath is tall, so
    // centring would push it far down the page). Wider screens: centred in the range's box.
    <div role="status" className={`flex flex-col items-center justify-start px-4 pb-10 pt-7 text-center md:justify-center md:py-10 ${className}`}>
      <div className="relative mx-auto mt-10 w-[44%] max-w-[170px]">
        {ORBIT.map((o, i) => (
          <span
            key={i}
            aria-hidden
            className={`loader-pop absolute left-1/2 top-1/2 flex size-11 items-center justify-center rounded-full text-cocoa shadow-[0_3px_0_rgb(43_33_24/0.18)] ${o.tint}`}
            style={{ ['--x' as string]: o.x, ['--y' as string]: o.y, ['--r' as string]: o.rot, ['--d' as string]: `${i * 0.55}s` }}
          >
            <Icon icon={o.icon} size={22} />
          </span>
        ))}
        <div className="polaroid tape loader-bob relative z-10" style={{ ['--tilt' as string]: '-3deg' }}>
          <div className="flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
            {drawing ? (
              <img src={drawing} alt="" className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
          <span aria-hidden className="loader-crayon absolute -bottom-3 -right-4 flex size-10 items-center justify-center rounded-full bg-cta text-cta-text shadow-[0_3px_0_rgb(43_33_24/0.25)]">
            <Icon icon={IconPencil} size={20} />
          </span>
        </div>
      </div>

      <p className="mt-12 font-display text-xl text-cocoa">making your collection</p>
      <p aria-hidden className="mt-1.5 grid text-[15px] text-ink-soft">
        {LINES.map((l, i) => (
          <span key={l} className="loader-line col-start-1 row-start-1" style={{ ['--k' as string]: i }}>
            {l}
          </span>
        ))}
      </p>
      <span className="sr-only">making your collection…</span>
    </div>
  );
}
