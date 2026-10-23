import { EXAMPLES, type Example } from '@/lib/examples';

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];

/**
 * The keepsake wall as a CAROUSEL (founder, 23 Oct): three rows of taped polaroids sliding slowly
 * leftwards — four across on desktop, a couple and a peek on phones. Every third example goes to a
 * row, and each row is laid twice end to end so the loop never shows a gap: the rows always look
 * full. CSS only (transform), pauses while a row is hovered or focused; with reduced motion the rows
 * stand still and scroll by hand instead.
 */
export function ExampleCarousel({ items = EXAMPLES, rows = 3, className = '' }: { items?: Example[]; rows?: number; className?: string }) {
  const lines = Array.from({ length: rows }, (_, r) => items.filter((_, i) => i % rows === r));
  return (
    <div className={`flex flex-col gap-4 ${className}`} role="region" aria-label="keepsakes made from children’s drawings">
      {lines.map((line, r) => (
        <div key={r} className="marquee-row -mx-2 overflow-hidden px-2 py-4 [container-type:inline-size] [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]">
          <ul className="marquee-track flex w-max" style={{ ['--marquee-dur' as string]: `${64 + r * 10}s`, animationDelay: `${-r * 11}s` }}>
            {[...line, ...line].map((e, i) => {
              const copy = i >= line.length; // the second lap: there for the loop, not read twice
              const k = i % line.length;
              return (
                <li key={`${e.slug}-${i}`} aria-hidden={copy || undefined} className="w-[calc(100cqw/2.3)] shrink-0 pr-4 md:w-[calc(100cqw/4)] md:pr-5">
                  <div
                    className="polaroid tape lift"
                    style={{
                      ['--tilt' as string]: (k + r) % 3 === 0 ? '-2.5deg' : (k + r) % 3 === 1 ? '1.8deg' : '-1deg',
                      ['--tape' as string]: TAPES[(k + r) % TAPES.length],
                      ['--tape-rot' as string]: (k + r) % 2 ? '4deg' : '-3deg',
                    }}
                  >
                    <div className={`flex aspect-square items-center justify-center overflow-hidden ${e.cutout ? 'bg-paper-2 p-3' : ''}`}>
                      <img src={e.src} alt={copy ? '' : e.alt} width={e.width} height={e.height} loading="lazy" decoding="async" className={e.cutout ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'} />
                    </div>
                    <p className="mt-2 text-[13px] leading-tight">
                      <span className="block truncate font-extrabold text-cocoa">{e.caption}</span>
                      <span className="block text-[12px] text-ink-faint">{e.product}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
