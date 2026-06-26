'use client';

import { IconArrowLeft, IconCamera, IconLock, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { ProductCard } from '@/ui/components/ProductCard';
import type { ProductKey } from '@/ui/components/ProductArt';
import { toast, useUpload } from '@/lib/store';
import { keepCreation } from '@/app/actions/keep';
import { startGuestUpload } from '@/app/actions/guestUpload';

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
  const [keeping, setKeeping] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUpload({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  // Place it on a real product: the bytes go to the server as a pre-account
  // ephemeral draft (EXIF-stripped, content-safety-checked, retention-scheduled),
  // and we open the real editor with the live DPI gate + magic edits. No account
  // wall — keeping/buying is the gentle next step.
  const place = async () => {
    if (!upload || placing || !termsAccepted) return;
    setPlacing(true);
    try {
      const blob = await fetch(upload.dataUrl).then((r) => r.blob());
      const fd = new FormData();
      fd.append('image', blob, upload.name || 'drawing.png');
      fd.append('termsAccepted', 'true');
      const res = await startGuestUpload(fd);
      if (res.blocked) {
        toast('we couldn’t use that image — try another');
        return;
      }
      if (!res.ok || !res.assetId) {
        toast('hmm, that didn’t work — try again');
        return;
      }
      router.push(`/studio/position?draft=${res.assetId}`);
    } finally {
      setPlacing(false);
    }
  };

  // Keep for real: the bytes go to the server, get EXIF-stripped, and are stored
  // privately in your family keepsake home. Guests are sent to log in first.
  const keep = async () => {
    if (!upload || keeping) return;
    setKeeping(true);
    try {
      const blob = await fetch(upload.dataUrl).then((r) => r.blob());
      const fd = new FormData();
      fd.append('image', blob, upload.name || 'drawing.png');
      const res = await keepCreation(fd);
      if (res.needsAuth) {
        toast('log in to keep this safely');
        router.push('/login');
        return;
      }
      if (!res.ok) {
        toast('hmm, that didn’t save — try again');
        return;
      }
      toast('kept to your keepsake box ✓');
      router.push('/home');
    } finally {
      setKeeping(false);
    }
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

              <TermsConsent checked={termsAccepted} onChange={setTermsAccepted} className="mt-6 hidden md:flex" />
              <div className="mt-4 hidden flex-wrap gap-3 md:flex">
                <Button size="lg" onClick={place} disabled={placing || !termsAccepted}>
                  {placing ? 'getting it ready…' : 'place it on a product →'}
                </Button>
                <Button href="/catalogue" variant="secondary" size="lg">
                  see the full range →
                </Button>
                <Button variant="ghost" size="lg" onClick={keep} disabled={keeping}>
                  {keeping ? 'keeping…' : 'keep this'}
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile: pinned actions */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
            <TermsConsent checked={termsAccepted} onChange={setTermsAccepted} className="mb-2.5 flex" />
            <Button size="lg" className="w-full" onClick={place} disabled={placing || !termsAccepted}>
              {placing ? 'getting it ready…' : 'place it on a product →'}
            </Button>
            <div className="mt-1.5 flex justify-center gap-4 text-sm">
              <Link href="/catalogue" className="font-bold text-cinnamon">
                see the full range →
              </Link>
              <button type="button" onClick={keep} disabled={keeping} className="font-bold text-cinnamon disabled:opacity-60">
                {keeping ? 'keeping…' : 'keep this'}
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

/** The terms reference + consent at the upload moment — the lawful basis for
 * processing the drawing (the detail lives in the linked terms). */
function TermsConsent({
  checked,
  onChange,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`items-start gap-2 text-[12px] leading-relaxed text-[#6F6358] ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-cta" />
      <span>
        I agree to the{' '}
        <Link href="/trust/terms" className="font-semibold text-cinnamon underline">
          terms
        </Link>{' '}
        &amp;{' '}
        <Link href="/trust/privacy" className="font-semibold text-cinnamon underline">
          privacy notice
        </Link>
        . we use your drawing to make your previews &amp; products — it&apos;s deleted within 30 days unless you keep it.
      </span>
    </label>
  );
}
