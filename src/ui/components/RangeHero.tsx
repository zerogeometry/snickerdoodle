/**
 * The hero: ONE child's painting, taped in as a polaroid, with the keepsakes it became fanned
 * around it — the whole promise ("one drawing → a family range") in a glance. The products pop in
 * one after another (so the painting visibly "becomes" the range), then float gently. CSS only,
 * transform/opacity; under prefers-reduced-motion everything simply sits still.
 *
 * Files: /public/examples/range/{drawing,framed-print,heart-cushion,jigsaw,card,blanket}.webp
 * (cut-outs via scripts/cutout-examples.mjs; the drawing is a plain square photo).
 */
const PRODUCTS: { src: string; alt: string; box: string; rot: string; i: number; float: string }[] = [
  { src: '/examples/range/framed-print.webp', alt: 'the painting in a wooden frame', box: 'left-[-2%] top-[1%] w-[44%]', rot: '-5deg', i: 1, float: '-10px' },
  { src: '/examples/range/heart-cushion.webp', alt: 'the painting on a heart-shaped cushion', box: 'right-[-1%] top-[3%] w-[38%]', rot: '6deg', i: 2, float: '-14px' },
  { src: '/examples/range/jigsaw.webp', alt: 'the painting as a jigsaw puzzle', box: 'left-[0%] bottom-[2%] w-[44%]', rot: '4deg', i: 3, float: '-8px' },
  { src: '/examples/range/blanket.webp', alt: 'the painting on a fleece blanket', box: 'right-[0%] bottom-[0%] w-[44%]', rot: '-4deg', i: 4, float: '-12px' },
  { src: '/examples/range/card.webp', alt: 'the painting on a greetings card with an envelope', box: 'right-[-4%] top-[38%] w-[34%]', rot: '3deg', i: 5, float: '-9px' },
];

export function RangeHero({ className = '' }: { className?: string }) {
  return (
    <figure className={`relative aspect-square w-full ${className}`} aria-label="One child's painting of their family, made into a framed print, a heart cushion, a jigsaw, a card and a blanket">
      {PRODUCTS.map((p) => (
        <div key={p.src} className={`pop-in absolute ${p.box}`} style={{ ['--i' as string]: p.i + 2, ['--pop-rot' as string]: p.rot }}>
          <div
            className="doodle static"
            style={{ position: 'static', ['--float-dist' as string]: p.float, ['--float-rot' as string]: p.rot, ['--float-spin' as string]: '1.5deg', ['--float-dur' as string]: `${7 + p.i}s`, ['--float-delay' as string]: `${p.i * 0.4}s` }}
          >
            <img src={p.src} alt={p.alt} loading="eager" decoding="async" className="w-full drop-shadow-[0_10px_14px_rgba(43,33,24,.18)]" />
          </div>
        </div>
      ))}
      {/* the original painting, taped on top — the star of the show */}
      <div className="polaroid tape pop-in absolute left-[27%] top-[24%] z-10 w-[48%]" style={{ ['--tilt' as string]: '-3deg', ['--i' as string]: 0, ['--pop-rot' as string]: '-8deg' }}>
        <img src="/examples/range/drawing.webp" alt="A child's painting of their family holding hands outside a yellow house, with the dog" width={600} height={600} fetchPriority="high" decoding="async" className="aspect-square w-full object-cover" />
        <figcaption className="mt-1.5 text-center text-[13px] font-extrabold text-cocoa">one painting…</figcaption>
      </div>
      {/* …and the payoff, arriving last, after the products have popped in */}
      <span
        aria-hidden
        className="pop-in absolute bottom-[-3%] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-pill bg-cobalt px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_var(--color-cobalt-deep)]"
        style={{ rotate: '3deg', ['--i' as string]: 9, ['--pop-rot' as string]: '8deg' }}
      >
        …a whole range ✦
      </span>
    </figure>
  );
}
