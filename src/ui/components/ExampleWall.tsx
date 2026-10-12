import { EXAMPLES, type Example } from '@/lib/examples';

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];

/**
 * A scrapbook wall of real keepsakes: each one taped in as a polaroid with a small resting tilt
 * that straightens + lifts on hover (.lift), arriving with a staggered pop. Lazy-loaded images
 * with fixed aspect ratios (no layout shift). Pass `limit` for a shorter strip.
 */
export function ExampleWall({ items = EXAMPLES, limit, className = '' }: { items?: Example[]; limit?: number; className?: string }) {
  const list = typeof limit === 'number' ? items.slice(0, limit) : items;
  return (
    <ul className={`grid grid-cols-2 gap-x-5 gap-y-9 pt-3 sm:grid-cols-3 lg:grid-cols-4 ${className}`}>
      {list.map((e, i) => (
        <li
          key={e.slug}
          className="polaroid tape lift pop-in"
          style={{
            ['--tilt' as string]: i % 3 === 0 ? '-2.5deg' : i % 3 === 1 ? '1.8deg' : '-1deg',
            ['--tape' as string]: TAPES[i % TAPES.length],
            ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg',
            ['--i' as string]: i,
          }}
        >
          <div className={`flex aspect-square items-center justify-center overflow-hidden ${e.cutout ? 'bg-paper-2 p-3' : ''}`}>
            <img src={e.src} alt={e.alt} width={e.width} height={e.height} loading="lazy" decoding="async" className={e.cutout ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'} />
          </div>
          <p className="mt-2 text-[13px] leading-tight">
            <span className="block font-extrabold text-cocoa">{e.caption}</span>
            <span className="block text-[12px] text-ink-faint">{e.product}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
