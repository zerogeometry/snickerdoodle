import { IconCards, IconCup, IconHeart, IconPencil, IconPhoto, IconPuzzle } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';

/**
 * The customize page's "making it" moment: laid over the product preview while a new photo is
 * being made (a colour, size or placement change), so the shopper sees work under way instead of a
 * preview that looks stuck. It is a smaller version of the create page's MakingRangeLoader (the
 * same popping keepsakes, scribbling crayon and changing copy line), on a paper wash that lets the
 * previous photo show through. The preview removes it once the new photo has painted.
 *
 * CSS only (the `.loader-*` classes in globals.css). It fades in after a short delay so an
 * instant swap never flickers it, and under reduced motion it sits still. Screen readers hear
 * one calm status line instead of the ticker.
 */
// 7 lines: the .loader-line cycle in globals.css is timed for exactly this many.
const LINES = [
  'mixing the colours…',
  'lining it all up…',
  'framing the wonky bits in gold…',
  'checking the edges…',
  'warming up the crayons…',
  'nearly there…',
  'keeping the magic…',
];

// px from the centre: the keepsakes pop out around the crayon.
const ORBIT = [
  { icon: IconPhoto, x: '-58px', y: '-22px', tint: 'bg-honey', rot: '-8deg' },
  { icon: IconCup, x: '56px', y: '-34px', tint: 'bg-sky', rot: '7deg' },
  { icon: IconHeart, x: '58px', y: '30px', tint: 'bg-berry', rot: '-5deg' },
  { icon: IconPuzzle, x: '-54px', y: '38px', tint: 'bg-meadow', rot: '6deg' },
  { icon: IconCards, x: '0px', y: '-62px', tint: 'bg-honey-band', rot: '-4deg' },
];

export function PreviewLoader() {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-paper/70 text-center motion-safe:animate-[fade_.25s_ease-out_.18s_backwards]"
    >
      <div className="relative size-24">
        {ORBIT.map((o, i) => (
          <span
            key={i}
            aria-hidden
            className={`loader-pop absolute left-1/2 top-1/2 flex size-9 items-center justify-center rounded-full text-cocoa shadow-[0_3px_0_rgb(43_33_24/0.18)] ${o.tint}`}
            style={{ ['--x' as string]: o.x, ['--y' as string]: o.y, ['--r' as string]: o.rot, ['--d' as string]: `${i * 0.55}s` }}
          >
            <Icon icon={o.icon} size={18} />
          </span>
        ))}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -ml-6 -mt-6 flex size-12 items-center justify-center rounded-full border-2 border-cocoa bg-cta text-cta-text shadow-[0_3px_0_var(--color-cocoa)]"
        >
          <span className="loader-crayon flex">
            <Icon icon={IconPencil} size={22} />
          </span>
        </span>
      </div>
      <p aria-hidden className="mt-3 grid rounded-full border-2 border-cocoa bg-paper px-3.5 py-1 text-sm text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
        {LINES.map((l, i) => (
          <span key={l} className="loader-line col-start-1 row-start-1" style={{ ['--k' as string]: i }}>
            {l}
          </span>
        ))}
      </p>
      <span className="sr-only">updating your preview…</span>
    </div>
  );
}
