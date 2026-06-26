'use client';

import { IconArrowLeft, IconChevronDown, IconPencil, IconShoppingBag, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { ProductMockup, type ProductKey } from '@/ui/components/ProductArt';
import { gbp, toast, useBasket, usePlacements, useUpload } from '@/lib/store';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { removeBackgroundAction } from '@/app/actions/magic';
import type { CatalogueProduct } from '@/server/catalogue';

const DEFAULT_TF = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

export default function CustomizePage() {
  const router = useRouter();
  const params = useParams<{ productKey: string }>();
  const productKey = params.productKey;

  const upload = useUpload((s) => s.upload);
  const setStoreCutout = useUpload((s) => s.setCutout);
  const add = useBasket((s) => s.add);
  const placements = usePlacements((s) => s.placements);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [cutout, setCutout] = useState<{ url: string; sourceObjectId: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    void loadCatalogueAction().then(setProducts);
  }, []);

  const product = products?.find((p) => p.key === productKey) ?? null;

  // Initialise the selection from the default variant.
  useEffect(() => {
    if (!product) return;
    const def = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
    setSize(def.attributes.size ?? null);
    setColour(def.attributes.colour ?? null);
  }, [product]);

  const variant = useMemo(() => {
    if (!product) return null;
    return (
      product.variants.find(
        (v) => (product.sizes.length === 0 || v.attributes.size === size) && (product.colours.length === 0 || v.attributes.colour === colour),
      ) ??
      product.variants.find((v) => v.isDefault) ??
      product.variants[0]!
    );
  }, [product, size, colour]);

  if (products && !product) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-[#6F6358]">
          That product isn’t available. <Link href="/catalogue" className="font-bold text-cinnamon">back to the range</Link>.
        </p>
      </Shell>
    );
  }
  if (!product || !variant) {
    return (
      <Shell>
        <div className="py-16 text-center text-sm text-[#9C8E7E]">loading…</div>
      </Shell>
    );
  }

  const removeBg = async () => {
    if (removing) return;
    if (!upload?.assetId) {
      toast('upload a drawing first');
      return;
    }
    setRemoving(true);
    try {
      const res = await removeBackgroundAction({ assetId: upload.assetId });
      if (res.ok) {
        setCutout({ url: res.url, sourceObjectId: res.sourceObjectId });
        setStoreCutout({ url: res.url, sourceObjectId: res.sourceObjectId }); // carry it back to the grid
        toast('background removed ✨');
      } else if (res.reason === 'budget') toast('that’s all your magic edits for now');
      else toast('couldn’t do that — try again');
    } finally {
      setRemoving(false);
    }
  };

  const addToBasket = () => {
    if (!upload?.assetId) {
      toast('upload a drawing first');
      return;
    }
    const sub = [variant.attributes.size, variant.attributes.colour].filter(Boolean).join(' · ') || undefined;
    // Use the placement saved in the studio if they edited it, else the default.
    const transform = placements[`${upload.assetId}-${product.key}`] ?? DEFAULT_TF;
    add({
      id: `cat-${variant.sku}`,
      name: product.label,
      product: product.key as ProductKey,
      sku: variant.sku,
      variantId: variant.id,
      pricePence: variant.pricePence,
      sub,
      artwork: { assetId: upload.assetId, transform, sourceObjectId: cutout?.sourceObjectId ?? upload.cutout?.sourceObjectId },
    });
    toast('added to basket ✓');
    router.push('/catalogue');
  };

  const editInStudio = () => {
    if (!upload?.assetId) {
      toast('upload a drawing first');
      return;
    }
    router.push(`/studio/position?draft=${upload.assetId}&return=${encodeURIComponent(`/customize/${product.key}`)}`);
  };

  const previewImg = cutout?.url ?? upload?.cutout?.url ?? upload?.dataUrl ?? null;

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-2 md:items-start">
        {/* Big preview */}
        <div className="flex items-center justify-center rounded-3xl border border-[#EADFC9] bg-[#FBF5E9] p-4">
          <ProductMockup product={product.key as ProductKey} image={previewImg} size={300} uid="customize" />
        </div>

        {/* Options */}
        <div>
          <h1 className="font-display text-3xl font-semibold text-cocoa">{product.label}</h1>
          {product.blurb ? <p className="mt-1 text-sm text-[#6F6358]">{product.blurb}</p> : null}
          <div className="mt-2 font-display text-2xl font-semibold text-cinnamon">{gbp(variant.pricePence)}</div>

          {product.sizes.length > 0 ? (
            <Picker label="Size" options={product.sizes} value={size} onChange={setSize} />
          ) : null}
          {product.colours.length > 0 ? (
            <Picker label="Colour" options={product.colours} value={colour} onChange={setColour} swatch />
          ) : null}

          {/* Expandable description */}
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
                <div className="border-t border-[#EFE6D6] px-4 py-3 text-[13px] leading-relaxed text-[#6F6358]">
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

          {/* Actions */}
          <Button size="lg" className="mt-6 w-full" onClick={addToBasket}>
            <Icon icon={IconShoppingBag} size={16} /> add to basket · {gbp(variant.pricePence)}
          </Button>
          <div className="mt-2.5 flex gap-2.5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={editInStudio}>
              <Icon icon={IconPencil} size={15} /> edit in studio
            </Button>
            <Button variant="secondary" size="lg" className="flex-1" onClick={removeBg} disabled={removing}>
              <Icon icon={IconSparkles} size={15} className={cutout ? 'text-green-save' : 'text-cinnamon'} />
              {removing ? 'removing…' : cutout ? 'bg removed' : 'remove background'}
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
  const map: Record<string, string> = { oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8', natural: '#E7D9BE' };
  return map[name] ?? '#E0C7A8';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/catalogue" aria-label="Back to the range">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-7">{children}</main>
    </div>
  );
}
