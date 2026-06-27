'use client';

import { IconCamera, IconCircleCheck, IconLock, IconSparkles, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { CameraCapture } from '@/ui/components/CameraCapture';
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { toast, useUpload } from '@/lib/store';
import { keepCreation } from '@/app/actions/keep';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { removeBackgroundAction } from '@/app/actions/magic';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

export default function StartCreatingPage() {
  const upload = useUpload((s) => s.upload);
  const setUpload = useUpload((s) => s.setUpload);
  const setAssetId = useUpload((s) => s.setAssetId);
  const setCutout = useUpload((s) => s.setCutout);
  const termsAccepted = useUpload((s) => s.termsAccepted);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [keeping, setKeeping] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);

  useEffect(() => {
    void loadCatalogueAction().then(setProducts);
  }, []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUpload({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  // Ingest the upload as an ephemeral draft (once), so magic edits + the order have
  // a real, content-safety-checked asset. Gated by the terms consent.
  const ensureAsset = async (): Promise<string | null> => {
    if (upload?.assetId) return upload.assetId;
    if (!upload) return null;
    const blob = await fetch(upload.dataUrl).then((r) => r.blob());
    const fd = new FormData();
    fd.append('image', blob, upload.name || 'drawing.png');
    fd.append('termsAccepted', 'true');
    const res = await startGuestUpload(fd);
    if (res.ok && res.assetId) {
      setAssetId(res.assetId);
      return res.assetId;
    }
    toast(res.blocked ? 'we couldn’t use that image — try another' : 'hmm, that didn’t work — try again');
    return null;
  };

  // Fast-track: remove the background right here, without opening Customize.
  const removeBg = async () => {
    if (removingBg) return;
    if (!termsAccepted) {
      toast('tick the terms to continue');
      return;
    }
    setRemovingBg(true);
    try {
      const assetId = await ensureAsset();
      if (!assetId) return;
      const res = await removeBackgroundAction({ assetId });
      if (res.ok) {
        setCutout({ url: res.url, sourceObjectId: res.sourceObjectId });
        toast('background removed ✨');
      } else if (res.reason === 'budget') toast('that’s all your magic edits for now');
      else toast('couldn’t do that — try again');
    } finally {
      setRemovingBg(false);
    }
  };

  // Keep into the family keepsake home (needs an account; guests go to log in).
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
        router.push('/login?next=/start-creating');
        return;
      }
      if (!res.ok) {
        toast('hmm, that didn’t save — try again');
        return;
      }
      toast('Added to your Keepsake ✓');
      router.push('/home');
    } finally {
      setKeeping(false);
    }
  };

  const previewImg = upload?.cutout?.url ?? upload?.dataUrl ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl, name) => setUpload({ dataUrl, name })}
        onUploadInstead={() => fileRef.current?.click()}
      />

      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa" aria-label="Snickerdoodle home">
          snickerdoodle
        </Link>
        <span className="hidden text-xs text-[#A89B8C] sm:inline">
          <b className={upload ? '' : 'text-cinnamon'}>upload</b> · <b className={upload ? 'text-cinnamon' : ''}>your range</b> · checkout
        </span>
        <Link href="/login" className="text-xs text-[#7A6A58] hover:text-cinnamon">log in</Link>
      </header>

      {!upload ? (
        // ── Empty state ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <PlaceholderDoodle size={150} />
          <h1 className="mt-6 font-display text-3xl font-semibold md:text-4xl">Upload your little one&apos;s drawing</h1>
          <p className="mt-2 max-w-sm text-sm text-[#6F6358]">Snap it or pop it in, and watch it land on a whole family range in moments.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => fileRef.current?.click()}>
              <Icon icon={IconUpload} size={18} /> upload a drawing
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setCameraOpen(true)}>
              <Icon icon={IconCamera} size={18} /> use camera
            </Button>
          </div>
          <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-[#6F6358]">
            <Icon icon={IconLock} size={14} className="text-green-save" /> This stays yours. Always.
          </p>
        </main>
      ) : (
        // ── Made-real state ──
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <div className="grid gap-8 md:grid-cols-5 md:items-start">
            {/* Left: the drawing, large, with change + remove background underneath */}
            <div className="md:col-span-2 md:sticky md:top-6">
              <div className="inline-block rounded-lg border-8 border-honey bg-[#FFFDF8] p-2 shadow-[0_4px_14px_rgba(46,39,35,.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewImg ?? ''} alt="your drawing" className="block max-h-[20rem] w-auto rounded-sm" />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:max-w-[17rem]">
                <Button variant="secondary" size="lg" onClick={() => fileRef.current?.click()}>
                  change image
                </Button>
                <Button size="lg" onClick={removeBg} disabled={removingBg}>
                  <Icon icon={upload.cutout ? IconCircleCheck : IconSparkles} size={16} />
                  {removingBg ? 'removing…' : upload.cutout ? 'background removed' : 'remove background'}
                </Button>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#EAF1E4] p-3">
                <Icon icon={IconLock} size={16} className="mt-0.5 shrink-0 text-green-save" />
                <p className="text-[13px] leading-relaxed text-[#46402F]">
                  <b>This stays yours. Always.</b> We use it to make your bits, then it&apos;s gone — unless you keep it.
                </p>
              </div>
            </div>

            {/* Right: the personalised range */}
            <div className="md:col-span-3">
              <h1 className="font-display text-2xl font-semibold leading-tight md:text-3xl">Your masterpiece, made real.</h1>
              <div className="mt-4">
                {products ? (
                  <FlowCatalogue products={products} compact scrollable showCategories />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-48 animate-pulse rounded-2xl border border-[#EADFC9] bg-[#FBF5E9]" />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 text-center sm:text-left">
                <button type="button" onClick={keep} disabled={keeping} className="text-sm font-bold text-[#7A6A58] hover:text-cinnamon disabled:opacity-60">
                  {keeping ? 'keeping…' : 'keep this in my keepsake box'}
                </button>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
