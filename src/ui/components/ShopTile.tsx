import { IconArrowRight } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { createPathFor } from '@/lib/shop-products';
import type { ShopListing } from '@/server/shop/listing';
import { Icon } from '../primitives/Icon';
import { ChristmasPromise } from './ChristmasPromise';
import { ProductArt } from './ProductArt';

const gbp = (p: number) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;

/** Washi tape, from the tokens (no raw colours): honey · sky · berry · leaf. */
const TAPES = ['honey', 'sky', 'berry', 'leaf'].map((t) => `color-mix(in srgb, var(--color-${t}) 80%, transparent)`);

/**
 * A product as a taped polaroid on the public pages (the /christmas shelves, the intent pages):
 * the brand-safe photo (or the drawn product art while there's no photo), the name, a line, the
 * catalogue price, the honest "arrives by christmas" line in season, and two ways on — the product's
 * own page, or straight into making it (upload → "make the <product>" → customise).
 */
export function ShopTile({ listing: l, line, index = 0, headingLevel = 'h3' }: { listing: ShopListing; line?: string; index?: number; headingLevel?: 'h2' | 'h3' | 'h4' }) {
  const H = headingLevel;
  return (
    <div className="flex h-full flex-col">
      <Link
        href={l.path}
        className="polaroid tape lift block"
        style={{ ['--tilt' as string]: index % 2 ? '1.5deg' : '-1.5deg', ['--tape' as string]: TAPES[index % TAPES.length], ['--tape-rot' as string]: index % 2 ? '4deg' : '-3deg' }}
      >
        <span className="relative flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
          {l.image ? (
            <Image src={l.image.src} alt={l.image.alt} fill sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw" className="object-cover" />
          ) : (
            <ProductArt product={l.key} size={110} />
          )}
        </span>
        <span className="block px-1 pt-2">
          <H className="text-[15px] font-extrabold leading-tight text-cocoa">{l.name}</H>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{line ?? l.blurb}</span>
          <span className="mt-1.5 block text-[14px] font-extrabold text-cocoa">
            {l.offers.length > 1 ? 'from ' : ''}
            {gbp(l.fromPence)}
          </span>
        </span>
      </Link>
      <div className="mt-2 flex flex-1 flex-col justify-end gap-2">
        <ChristmasPromise productKey={l.key} />
        <Link
          href={createPathFor(l.key)}
          className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-pill border-2 border-cocoa bg-paper px-3 text-[13px] font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] hover:bg-honey-band"
          aria-label={`make the ${l.name}`}
        >
          make yours <Icon icon={IconArrowRight} size={15} />
        </Link>
      </div>
    </div>
  );
}
