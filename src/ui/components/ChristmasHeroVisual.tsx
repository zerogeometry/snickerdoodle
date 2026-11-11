import Image from 'next/image';
import type { CSSProperties } from 'react';
import { CHRISTMAS_STICKER_SVG } from '@/lib/stickers/christmas-art';

/**
 * The homepage hero picture in the Christmas season (mockups/christmas, screen 1): a bundle of three taped
 * polaroids (founder, 11 Nov): the cards on the mantel and the presents under the tree fanned out behind, the
 * table set (the hero product) in front. Three of OUR Studio stickers are stuck on the page (the same vector
 * art families add in the Studio). The photos are brand-safe concept images of the real products. Stickers
 * render as <img> data URIs so their internal ids never clash; the wiggle is CSS-only and off under reduced
 * motion (globals.css).
 *
 * Each photo sits in a plain positioned box: `.tape` sets position:relative on the polaroid itself, which
 * would otherwise beat an `absolute` utility on the same element.
 */
const sticker = (key: keyof typeof CHRISTMAS_STICKER_SVG) => `data:image/svg+xml;utf8,${encodeURIComponent(CHRISTMAS_STICKER_SVG[key])}`;

const HOLLY_TAPE = 'repeating-linear-gradient(-45deg, rgb(200 64 42 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)';
const LEAF_TAPE = 'repeating-linear-gradient(-45deg, rgb(127 166 94 / 0.85) 0 7px, rgb(255 251 242 / 0.9) 7px 14px)';
const GOLD_TAPE = 'rgb(246 196 69 / 0.8)';

const PHOTOS: { src: string; alt: string; box: string; tilt: string; tape: string; tapeRot: string; priority?: boolean }[] = [
  // back left
  {
    src: '/christmas/hero-cardshanging.webp',
    alt: 'Children’s crayon Christmas cards hanging on a ribbon above the fireplace',
    box: 'left-0 top-[4%] w-[52%]',
    tilt: '-5deg',
    tape: GOLD_TAPE,
    tapeRot: '-4deg',
  },
  // back right
  {
    src: '/christmas/hero-treepresents.webp',
    alt: 'Presents under the tree, wrapped in paper printed with children’s drawings',
    box: 'right-0 top-[8%] w-[50%]',
    tilt: '5deg',
    tape: LEAF_TAPE,
    tapeRot: '6deg',
  },
  // front and centre: the hero product
  {
    src: '/christmas/hero-tableset.webp',
    alt: 'A Christmas table set with placemats, a coaster and an ornament, all printed with a child’s crayon nativity',
    box: 'bottom-0 left-[19%] w-[62%]',
    tilt: '-1.5deg',
    tape: HOLLY_TAPE,
    tapeRot: '-3deg',
    priority: true,
  },
];

export function ChristmasHeroVisual() {
  return (
    <div className="relative mx-auto aspect-[1/1.02] w-full max-w-[420px]">
      {PHOTOS.map((p, i) => (
        <div key={p.src} className={`absolute ${p.box}`}>
          <figure
            className="polaroid tape pop-in"
            style={{ '--tilt': p.tilt, '--tape': p.tape, '--tape-rot': p.tapeRot, '--i': i } as CSSProperties}
          >
            <Image src={p.src} alt={p.alt} width={900} height={900} className="h-auto w-full" priority={p.priority ?? i < 2} />
          </figure>
        </div>
      ))}
      {/* our own Studio stickers, stuck on the page */}
      <img src={sticker('reindeer')} alt="" aria-hidden className="wiggle pop-in absolute -left-3 bottom-[10%] w-[20%] -rotate-6" style={{ ['--i' as string]: 3 }} />
      <img src={sticker('gingerbread')} alt="" aria-hidden className="wiggle pop-in absolute -right-2 bottom-[16%] w-[17%] rotate-6" style={{ ['--i' as string]: 4 }} />
      <img src={sticker('star')} alt="" aria-hidden className="wiggle pop-in absolute -top-3 left-[44%] w-[16%] rotate-12" style={{ ['--i' as string]: 5 }} />
    </div>
  );
}
