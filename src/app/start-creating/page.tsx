'use client';

import { IconArrowLeft, IconCamera, IconLock, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { ProductCard } from '@/ui/components/ProductCard';
import type { ProductKey } from '@/ui/components/ProductArt';
import { toast, useKept, useUpload } from '@/lib/store';

const RANGE: { name: string; price: string; product: ProductKey; featured?: boolean }[] = [
  { name: 'framed print', price: '£22', product: 'framedPrint' },
  { name: 'mug', price: '£14', product: 'mug' },
  { name: 'kids tee', price: '£18', product: 'kidsTee' },
  { name: 'cushion', price: '£28', product: 'cushion' },
  { name: 'tote bag', price: '£16', product: 'toteBag' },
  { name: 'storybook ✦', price: '£24', product: 'storybook', featured: true },
];

export default function StartCreatingPage() {
  const upload = useUpload((s) => s.upload);
  const setUpload = useUpload((s) => s.setUpload);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUpload({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  const keep = () => {
    if (!upload) return;
    useKept.getState().add({
      id: `k-${Date.now()}`,
      name: 'Your drawing',
      image: upload.dataUrl,
      meta: 'just now',
      visibility: 'FAMILY',
    });
    toast('Kept to your keepsake box ✓');
    router.push('/home');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />

      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="Back to home" className="md:hidden">
            <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
          </Link>
          <Link href="/" className="hidden font-display text-xl font-semibold text-cocoa md:inline">
            snickerdoodle
          </Link>
        </div>
        <span className="text-xs text-[#A89B8C]">
          <b className={upload ? '' : 'text-cinnamon'}>upload</b> ·{' '}
          <b className={upload ? 'text-cinnamon' : ''}>your range</b> · save
        </span>
        <Link href="/login" className="text-xs text-[#7A6A58] hover:text-cinnamon">
          log in
        </Link>
      </header>

      {!upload ? (
        // ── Empty state: prompt to upload ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <PlaceholderDoodle size={150} />
          <h1 className="mt-6 font-display text-3xl font-semibold md:text-4xl">
            Upload your little one&apos;s drawing
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[#6F6358]">
            Snap it or pop it in, and watch it land on a whole family range in moments.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => fileRef.current?.click()}>
              <Icon icon={IconUpload} size={18} /> upload a drawing
            </Button>
            <Button variant="secondary" size="lg" onClick={() => camRef.current?.click()}>
              <Icon icon={IconCamera} size={18} /> use camera
            </Button>
          </div>
          <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-[#6F6358]">
            <Icon icon={IconLock} size={14} className="text-green-save" /> This stays yours. Always.
          </p>
        </main>
      ) : (
        // ── Made-real state ──
        <main id="main" className="flex-1 pb-28 md:pb-0">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[0.85fr_1.15fr] md:items-center md:py-14">
            <div>
              <p className="mb-2 text-xs font-semibold text-[#6F6358]">you uploaded</p>
              <div className="inline-block rounded-md border-8 border-honey bg-[#FFFDF8] p-2">
                <img src={upload.dataUrl} alt="your uploaded drawing" className="block max-h-56 w-auto rounded-sm" />
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 block text-xs font-semibold text-cinnamon hover:underline"
              >
                upload a different drawing
              </button>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#EAF1E4] p-3">
                <Icon icon={IconLock} size={16} className="mt-0.5 shrink-0 text-green-save" />
                <p className="text-[13px] leading-relaxed text-[#46402F]">
                  <b>This stays yours. Always.</b> We use it to make your bits, then it&apos;s gone — unless you keep it.
                </p>
              </div>
            </div>

            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
                Your masterpiece, made real.
              </h1>
              <p className="mt-2 text-sm text-[#6F6358]">The same drawing, ready on everything you love.</p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {RANGE.map((item) => (
                  <ProductCard
                    key={item.name}
                    name={item.name}
                    price={item.price}
                    product={item.product}
                    image={upload.dataUrl}
                    featured={item.featured}
                  />
                ))}
              </div>

              <div className="mt-7 hidden flex-wrap gap-3 md:flex">
                <Button href="/catalogue" size="lg">
                  see the full range →
                </Button>
                <Button href="/studio/new" variant="secondary" size="lg">
                  open in studio
                </Button>
                <Button variant="ghost" size="lg" onClick={keep}>
                  keep this
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile: pinned actions */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
            <Button href="/catalogue" size="lg" className="w-full">
              see the full range →
            </Button>
            <div className="mt-1.5 flex justify-center gap-4 text-sm">
              <Link href="/studio/new" className="font-bold text-cinnamon">
                open in studio
              </Link>
              <button type="button" onClick={keep} className="font-bold text-cinnamon">
                keep this
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
