'use client';

import { IconArrowLeft, IconChevronDown, IconPencil, IconShoppingBag } from '@tabler/icons-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { ProductMockup, type ProductKey } from '@/ui/components/ProductArt';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { gbp, toast, useBasket, usePlacements, useUpload } from '@/lib/store';
import { lineIdForSku } from '@/lib/catalogue-view';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

const DEFAULT_TF = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

/**
 * Customize a product: size + colour + placement only. Image-level edits (remove
 * background, the studio) live on the catalogue page and apply to every product —
 * here we just place the (already-edited) image on this product.
 */
export default function CustomizePage() {
  const router = useRouter();
  const params = useParams<{ productKey: string }>();
  const productKey = params.productKey;

  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const placements = usePlacements((s) => s.placements);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    void loadCatalogueAction().then(setProducts);
  }, []);

  const product = products?.find((p) => p.key === productKey) ?? null;

  useEffect(() => {
    if (!product) return;
    const def = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
    setSize(def.attributes.size ?? null);
    setColour(def.attributes.colour ?? null);
  }, [product]);

  // Colours actually available for the selected size — the matrix can be SPARSE (e.g.
  // an 11oz mug in 3 colours but 15oz in white only), so never offer an unavailable combo.
  const coloursForSize = useMemo(() => {
    if (!product) return [];
    const avail = product.variants
      .filter((v) => product.sizes.length === 0 || v.attributes.size === size)
      .map((v) => v.attributes.colour)
      .filter((c): c is string => Boolean(c));
    return [...new Set(avail)];
  }, [product, size]);

  // Keep the chosen colour valid for the chosen size (auto-correct on size change).
  useEffect(() => {
    if (!product || product.colours.length === 0) return;
    if (coloursForSize.length > 0 && (!colour || !coloursForSize.includes(colour))) {
      setColour(coloursForSize[0]!);
    }
  }, [product, coloursForSize, colour]);

  // Exact match for the chosen size+colour — NO silent fallback to the default, which
  // would order + charge the WRONG variant. null ⇒ the combination isn't available.
  const variant = useMemo(() => {
    if (!product) return null;
    return (
      product.variants.find(
        (v) => (product.sizes.length === 0 || v.attributes.size === size) && (product.colours.length === 0 || v.attributes.colour === colour),
      ) ?? null
    );
  }, [product, size, colour]);

  if (products && !product) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-[#6F6358]">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon">back to the range</Link>.
        </p>
      </Shell>
    );
  }
  if (!product) {
    return (
      <Shell>
        <div className="py-16 text-center text-sm text-[#9C8E7E]">loading…</div>
      </Shell>
    );
  }

  const previewImg = upload?.cutout?.url ?? upload?.dataUrl ?? null;
  const placement = (upload?.assetId && placements[`${upload.assetId}-${product.key}`]) || DEFAULT_TF;

  const editPlacement = () => {
    if (!upload?.assetId) {
      toast('upload a drawing first');
      return;
    }
    router.push(`/studio/position?draft=${upload.assetId}&return=${encodeURIComponent(`/customize/${product.key}`)}`);
  };

  const addToBasket = () => {
    if (!upload?.assetId) {
      toast('upload a drawing first');
      return;
    }
    if (!variant) {
      toast('that size + colour isn’t available — pick another');
      return;
    }
    const sub = [variant.attributes.size, variant.attributes.colour].filter(Boolean).join(' · ') || undefined;
    add({
      id: lineIdForSku(variant.sku),
      name: product.label,
      product: product.key as ProductKey,
      sku: variant.sku,
      variantId: variant.id,
      pricePence: variant.pricePence,
      sub,
      artwork: { assetId: upload.assetId, transform: placement, sourceObjectId: upload.cutout?.sourceObjectId },
    });
    toast('added to basket ✓');
    router.push('/start-creating');
  };

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-2 md:items-start">
        {/* Left: preview + angle thumbnails + edit placement */}
        <div>
          <div className="flex items-center justify-center rounded-3xl border border-[#EADFC9] bg-[#FBF5E9] p-4">
            <MockupPreview
              productKey={product.key as ProductKey}
              assetId={upload?.assetId ?? null}
              variantId={variant?.id ?? null}
              transform={placement}
              size="zoom"
              sourceObjectId={upload?.cutout?.sourceObjectId ?? null}
              image={previewImg}
              placement={placement}
              px={300}
              uid="customize"
            />
          </div>
          {/* angle thumbnails — real product photography lands here on the Prodigi sync */}
          <div className="mt-3 flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                title={i === 0 ? 'front' : 'more angles coming with product photography'}
                className={`flex h-14 w-14 items-center justify-center rounded-xl border bg-[#FBF5E9] ${i === 0 ? 'border-cinnamon' : 'border-[#EFE6D6] opacity-50'}`}
              >
                <ProductMockup product={product.key as ProductKey} image={previewImg} placement={placement} size={44} uid={`thumb-${i}`} />
              </div>
            ))}
          </div>
          <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={editPlacement}>
            <Icon icon={IconPencil} size={15} /> edit placement
          </Button>
        </div>

        {/* Right: options → description → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-3xl font-semibold text-cocoa">{product.label}</h1>
          {product.blurb ? <p className="mt-1 text-sm text-[#6F6358]">{product.blurb}</p> : null}
          <div className="mt-2 font-display text-2xl font-semibold text-cinnamon">{gbp(variant?.pricePence ?? product.fromPence)}</div>
          <p className="text-[11px] text-[#9C8E7E]">free tracked delivery</p>

          {product.sizes.length > 0 ? <Picker label="Size" options={product.sizes} value={size} onChange={setSize} /> : null}
          {product.colours.length > 0 ? <Picker label="Colour" options={coloursForSize} value={colour} onChange={setColour} swatch /> : null}

          {/* collapsible, scrollable-in-container description */}
          {product.description ? (
            <div className="mt-5 rounded-xl border border-[#EFE6D6] bg-white">
              <button
                type="button"
                onClick={() => setDescOpen((o) => !o)}
                aria-expanded={descOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-cocoa"
              >
                product details
                <Icon icon={IconChevronDown} size={16} className={`text-[#9C8E7E] transition-transform ${descOpen ? 'rotate-180' : ''}`} />
              </button>
              {descOpen ? (
                <div className="brand-scroll max-h-44 overflow-y-auto border-t border-[#EFE6D6] px-4 py-3 text-[13px] leading-relaxed text-[#6F6358]">
                  <p>{product.description}</p>
                  {Object.keys(product.specs).length > 0 ? (
                    <dl className="mt-3 space-y-1">
                      {Object.entries(product.specs).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="min-w-20 font-semibold capitalize text-[#8A7C6A]">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button size="lg" className="w-full sm:w-auto" onClick={addToBasket} disabled={!variant}>
              <Icon icon={IconShoppingBag} size={16} /> add to basket · {gbp(variant?.pricePence ?? product.fromPence)}
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
  swatch = false,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  swatch?: boolean;
}) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              value === o ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58] hover:border-honey'
            }`}
          >
            {swatch ? <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatchColour(o) }} /> : null}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function swatchColour(name: string): string {
  const map: Record<string, string> = {
    oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8',
    natural: '#E7D9BE', gold: '#D9B45B', blue: '#5B8AC0', 'caribbean blue': '#3FA9C9', 'cotton pink': '#E8A6B8',
  };
  return map[name] ?? '#E0C7A8';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/start-creating" aria-label="Back to your range">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-7">{children}</main>
    </div>
  );
}
