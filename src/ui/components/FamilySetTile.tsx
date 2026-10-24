'use client';

import { useEffect, useRef, useState } from 'react';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { mockupKey, prefetchMockups, whenMockupsSettled, type MockupRequest } from '@/lib/mockupPrefetch';
import { gbp, usePlacements, type PlacementTransform, type Upload } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';

const pick = (p: CatalogueProduct, size: string) => p.variants.find((v) => v.attributes.size === size && v.attributes.colour === 'white') ?? p.variants[0]!;
const teeTransform = (p: CatalogueProduct, upload: Upload, placements: Record<string, PlacementTransform | undefined>): PlacementTransform =>
  (upload?.assetId && placements[`${upload.assetId}-${p.key}`]) || defaultTransformFor(p.key);

/**
 * The family set's pictures (one grown-up tee, one kids tee — each shown twice), as the range
 * prefetch asks for them: FlowCatalogue slots these into the range's order where the tile sits, so
 * they're drawn with the rest. Empty until the drawing is stored, or when the tees aren't on sale.
 */
export function familySetRequests(products: CatalogueProduct[], upload: Upload, placements: Record<string, PlacementTransform | undefined>): MockupRequest[] {
  const adult = products.find((p) => p.key === 'adultTee');
  const kids = products.find((p) => p.key === 'kidsTee');
  if (!adult || !kids || !upload?.assetId) return [];
  const sourceObjectId = upload.cutout?.sourceObjectId;
  return [
    { assetId: upload.assetId, sourceObjectId, variantId: pick(adult, 'M').id, transform: teeTransform(adult, upload, placements), size: 'thumb' },
    { assetId: upload.assetId, sourceObjectId, variantId: pick(kids, '7-8 years').id, transform: teeTransform(kids, upload, placements), size: 'thumb' },
  ];
}

/**
 * The family set as a catalogue tile: the shopper's OWN drawing on two grown-up tees at the back
 * and two kids tees in front — four real mockups (the tee photos are see-through around the
 * garment, so they overlap like a little family photo). Priced "from" one adult + one child; the
 * 5% saving starts at three pieces (decided server-side at checkout). Opens the set builder.
 */
export function FamilySetTile({
  products,
  upload,
  index = 0,
  lazy = true,
  label = 'build your set',
  onOpen,
}: {
  products: CatalogueProduct[];
  upload: Upload;
  index?: number;
  lazy?: boolean;
  label?: string;
  onOpen: () => void;
}) {
  const adult = products.find((p) => p.key === 'adultTee');
  const kids = products.find((p) => p.key === 'kidsTee');
  const placements = usePlacements((s) => s.placements);

  // Shown as ONE piece (founder, 23 Oct: "fully rendered as one piece when I scroll to it"): the tees
  // stay hidden until every one of their pictures is ready, then appear together.
  const reqs = familySetRequests(products, upload, placements);
  const reqKey = reqs.length ? JSON.stringify(reqs.map(mockupKey)) : '';
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!reqKey) return;
    const keys = JSON.parse(reqKey) as string[];
    // normally already asked for with the range; this is the safety net (after the range has queued)
    const t = setTimeout(() => prefetchMockups(familySetRequests(products, upload, placements)), 0);
    const stop = whenMockupsSettled(keys, () => setReady(reqKey));
    return () => {
      clearTimeout(t);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reqKey is the requests by value
  }, [reqKey]);
  // …and then until all four tees have actually PAINTED (arrived ≠ on screen); a few seconds at most
  const layerRef = useRef<HTMLDivElement>(null);
  const [painted, setPainted] = useState<string | null>(null);
  useEffect(() => {
    if (!reqKey || ready !== reqKey || painted === reqKey) return;
    const giveUpAt = Date.now() + 8000;
    let raf = 0;
    const check = () => {
      const imgs = [...(layerRef.current?.querySelectorAll('img') ?? [])];
      if ((imgs.length === 4 && imgs.every((i) => i.complete && i.naturalWidth > 0)) || Date.now() > giveUpAt) setPainted(reqKey);
      else raf = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(raf);
  }, [reqKey, ready, painted]);
  const shown = !!reqKey && painted === reqKey;

  if (!adult || !kids) return null;

  const adultV = pick(adult, 'M');
  const kidsV = pick(kids, '7-8 years');
  const cheapest = (p: CatalogueProduct) => Math.min(...p.variants.map((v) => v.pricePence));
  const fromPence = cheapest(adult) + cheapest(kids);
  const tf = (p: CatalogueProduct) => teeTransform(p, upload, placements);

  const tee = (p: CatalogueProduct, variantId: string, cls: string, style: React.CSSProperties) => (
    <div aria-hidden className={`absolute aspect-square ${cls}`} style={{ filter: 'drop-shadow(0 3px 4px rgb(43 33 24 / 0.16))', ...style }}>
      <MockupPreview
        productKey={p.key as never}
        assetId={upload?.assetId}
        variantId={variantId}
        transform={tf(p)}
        size="thumb"
        sourceObjectId={upload?.cutout?.sourceObjectId}
        px={128}
        lazy={lazy && !reqKey}
        placeholder={false}
      />
    </div>
  );

  const TAPES = ['honey', 'sky', 'berry', 'leaf'].map((t) => `color-mix(in srgb, var(--color-${t}) 80%, transparent)`);
  return (
    <div
      className="polaroid tape lift group relative flex h-full flex-col @container"
      style={{
        ['--tilt' as string]: index % 3 === 0 ? '-1.4deg' : index % 3 === 1 ? '1.1deg' : '-0.5deg',
        ['--tape' as string]: TAPES[index % TAPES.length],
        ['--tape-rot' as string]: index % 2 ? '4deg' : '-3deg',
      }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-paper-2">
        {/* one calm block until the whole picture is ready — never a tee at a time */}
        {!shown ? <div aria-hidden className="absolute inset-0 bg-line motion-safe:animate-pulse" /> : null}
        {/* the picture is the image (the tap-anywhere button below sits beside it, not inside it) */}
        <div ref={layerRef} role="img" aria-label="your drawing on two grown-up tees and two kids tees — a matching family set" className={`absolute inset-0 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}>
        {/* grown-ups at the back… */}
        {tee(adult, adultV.id, 'left-[-4%] top-[0%] w-[64%]', { transform: 'rotate(-6deg)', zIndex: 1 })}
        {tee(adult, adultV.id, 'right-[-4%] top-[0%] w-[64%]', { transform: 'rotate(6deg)', zIndex: 0 })}
        {/* …little ones in front */}
        {tee(kids, kidsV.id, 'bottom-[8%] left-[12%] w-[46%]', { transform: 'rotate(-3deg)', zIndex: 2 })}
        {tee(kids, kidsV.id, 'bottom-[8%] right-[12%] w-[46%]', { transform: 'rotate(4deg)', zIndex: 3 })}
        </div>
        <button type="button" tabIndex={-1} onClick={onOpen} aria-label="build a family set" className="absolute inset-0 z-10 cursor-pointer" />
      </div>

      <div className="flex flex-1 flex-col gap-2 px-1 pb-0.5 pt-2.5">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-1">
          <span className="whitespace-nowrap text-base font-extrabold text-cocoa sm:text-sm">family set</span>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-soft sm:text-xs">from {gbp(fromPence)}</span>
        </div>
        <span className="-mt-1.5 text-[11px] leading-snug text-ink-soft">matching tees, one colour · 3+ save 5%</span>
        <div className="mt-auto">
          <button type="button" onClick={onOpen} className="press inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-pill border-2 border-cocoa bg-paper px-3 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] hover:bg-honey-band active:shadow-none">
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
