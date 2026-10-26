import Image from 'next/image';
import { CHRISTMAS_STICKER_SVG } from '@/lib/stickers/christmas-art';

/**
 * The homepage hero picture in the Christmas season (mockups/christmas, screen 1): taped polaroids
 * of the bauble + a present wrapped in the same drawing, with three of OUR Studio stickers stuck on
 * the page (the same vector art families add in the Studio). Placeholder photos are brand-safe concept
 * images matched to the real products (see /christmas). Stickers render as <img> data URIs so their
 * internal ids never clash; the wiggle is CSS-only and off under reduced motion (globals.css).
 */
const sticker = (key: keyof typeof CHRISTMAS_STICKER_SVG) => `data:image/svg+xml;utf8,${encodeURIComponent(CHRISTMAS_STICKER_SVG[key])}`;

const HOLLY_TAPE = 'repeating-linear-gradient(-45deg, rgb(200 64 42 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)';
const LEAF_TAPE = 'repeating-linear-gradient(-45deg, rgb(127 166 94 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)';

export function ChristmasHeroVisual() {
  return (
    <div className="relative mx-auto aspect-[1/1.02] w-full max-w-[420px]">
      <figure className="polaroid tape pop-in absolute left-0 top-[4%] w-[86%]" style={{ ['--tilt' as string]: '-3deg', ['--tape' as string]: HOLLY_TAPE }}>
        <Image
          src="/christmas/ball-and-present.webp"
          alt="A bauble printed with a child’s crayon Christmas tree, beside a present wrapped in the same drawing on repeat"
          width={1200}
          height={800}
          className="h-auto w-full"
          priority
        />
      </figure>
      <figure className="polaroid tape pop-in absolute bottom-0 right-0 w-[44%]" style={{ ['--tilt' as string]: '5deg', ['--tape' as string]: LEAF_TAPE, ['--i' as string]: 1 }}>
        <Image src="/christmas/bauble.webp" alt="A ceramic bauble printed with a child’s crayon snowman, on the tree" width={896} height={1152} className="h-auto w-full" />
        <figcaption className="mt-1 text-center font-hand text-sm text-ink-soft">this year’s bauble</figcaption>
      </figure>
      {/* our own Studio stickers, stuck on the page */}
      <img src={sticker('reindeer')} alt="" aria-hidden className="wiggle pop-in absolute -left-3 bottom-[18%] w-[26%] -rotate-6" style={{ ['--i' as string]: 2 }} />
      <img src={sticker('gingerbread')} alt="" aria-hidden className="wiggle pop-in absolute left-[30%] bottom-[2%] w-[20%] rotate-6" style={{ ['--i' as string]: 3 }} />
      <img src={sticker('star')} alt="" aria-hidden className="wiggle pop-in absolute -right-2 top-0 w-[20%] rotate-12" style={{ ['--i' as string]: 4 }} />
    </div>
  );
}
