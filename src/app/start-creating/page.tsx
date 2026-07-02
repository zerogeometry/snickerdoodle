'use client';

import { IconCamera, IconCircleCheck, IconLock, IconPencil, IconSparkles, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { BasketButton } from '@/ui/components/BasketButton';
import { CameraCapture } from '@/ui/components/CameraCapture';
import { ImageStudio } from '@/ui/components/ImageStudio';
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { detectOpaqueBg, toast, useUpload } from '@/lib/store';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { removeBackgroundAction } from '@/app/actions/magic';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

export default function StartCreatingPage() {
  const upload = useUpload((s) => s.upload);
  const setUpload = useUpload((s) => s.setUpload);
  const setAssetId = useUpload((s) => s.setAssetId);
  const setOpaqueBg = useUpload((s) => s.setOpaqueBg);
  const setCutout = useUpload((s) => s.setCutout);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadCatalogue = () => {
    setLoadError(false);
    void loadCatalogueAction()
      .then(setProducts)
      .catch(() => setLoadError(true));
  };
  useEffect(loadCatalogue, []);

  /** Set the upload, then detect whether its background is opaque (drives the
   * "remove background" nudge — only shown when removing would actually do something). */
  const applyUpload = (dataUrl: string, name: string) => {
    setUpload({ dataUrl, name });
    void detectOpaqueBg(dataUrl, name).then(setOpaqueBg);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyUpload(String(reader.result), file.name);
    reader.readAsDataURL(file);
  };

  // Ingest the upload as an ephemeral draft (once), so magic edits + the order have
  // a real, content-safety-checked asset. Gated by the terms consent.
  const ensureAsset = async (): Promise<string | null> => {
    if (upload?.assetId) return upload.assetId;
    if (!upload) return null;
    try {
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
    } catch {
      toast('that didn’t upload — try again, or a smaller image');
      return null;
    }
  };

  // Fast-track: remove the background right here, without opening Customize.
  const removeBg = async () => {
    if (removingBg) return;
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

  const previewImg = upload?.cutout?.url ?? upload?.dataUrl ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl, name) => applyUpload(dataUrl, name)}
        onUploadInstead={() => fileRef.current?.click()}
      />
      <ImageStudio
        open={studioOpen}
        image={upload?.dataUrl ?? null}
        onClose={() => setStudioOpen(false)}
        onApply={(edited) => applyUpload(edited, upload?.name ?? 'drawing.png')}
      />

      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa" aria-label="Snickerdoodle home">
          snickerdoodle
        </Link>
        <span className="hidden text-xs text-[#A89B8C] sm:inline">
          <b className={upload ? '' : 'text-cinnamon'}>upload</b> · <b className={upload ? 'text-cinnamon' : ''}>your range</b> · checkout
        </span>
        <div className="flex items-center gap-1.5">
          <BasketButton />
          <Link href="/login" className="text-xs text-[#7A6A58] hover:text-cinnamon">log in</Link>
        </div>
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
          <div className="mt-6 max-w-sm rounded-xl border border-[#EADFC9] bg-[#FBF8F1] p-3 text-left text-xs leading-relaxed text-[#6F6358]">
            <p className="flex items-start gap-1.5 font-bold text-cocoa">
              <Icon icon={IconLock} size={14} className="mt-px shrink-0 text-green-save" />
              By uploading, you confirm it&apos;s your little one&apos;s own artwork that you&apos;re free to use.
            </p>
            <p className="mt-1.5">
              You also accept our{' '}
              <Link href="/trust/terms" className="font-bold text-cinnamon">terms</Link> &amp;{' '}
              <Link href="/trust/privacy" className="font-bold text-cinnamon">privacy notice</Link>. It stays yours — we use it
              to make your bits, then it&apos;s gone unless you keep it.
            </p>
          </div>
        </main>
      ) : (
        // ── Made-real state — fits one viewport; only the range scrolls ──
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-5 md:overflow-hidden">
          <div className="grid gap-8 md:grid-cols-5 md:items-start">
            {/* Left: the drawing, large, with change / remove background / terms — all equal width */}
            <div className="flex flex-col md:col-span-2">
              {/* The honey frame HUGS the drawing's own aspect ratio (inline-block sized by
                  the image) instead of a fixed full-width box with white slabs inside. */}
              <div className="flex w-full justify-center">
                <div className="inline-block overflow-hidden rounded-lg border-8 border-honey bg-[#FFFDF8] shadow-[0_4px_14px_rgba(46,39,35,.08)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewImg ?? ''} alt="your drawing" className="block h-auto max-h-[20rem] w-auto max-w-full" />
                </div>
              </div>
              <div className="mt-3 flex w-full flex-col gap-2">
                <Button variant="designOutline" size="lg" className="w-full" onClick={() => fileRef.current?.click()}>
                  change image
                </Button>
                <Button
                  variant="design"
                  size="lg"
                  className="w-full"
                  onClick={removeBg}
                  disabled={removingBg}
                  // Nudge (same wobble as start-creating) ONLY when removing would do something:
                  // the upload is detected as fully opaque and hasn't been bg-removed yet.
                  attention={!removingBg && !upload.cutout && upload.opaqueBg === true}
                >
                  <Icon icon={upload.cutout ? IconCircleCheck : IconSparkles} size={16} />
                  {removingBg ? 'removing…' : upload.cutout ? 'background removed' : 'remove background'}
                </Button>
                <Button variant="design" size="lg" className="w-full" onClick={() => setStudioOpen(true)}>
                  <Icon icon={IconPencil} size={16} /> edit in studio
                </Button>
              </div>
              <div className="mt-3 flex w-full items-start gap-2.5 rounded-xl bg-[#EAF1E4] p-3">
                <Icon icon={IconLock} size={16} className="mt-0.5 shrink-0 text-green-save" />
                <p className="text-[13px] leading-relaxed text-[#46402F]">
                  <b>This stays yours. Always.</b> We use it to make your bits, then it&apos;s gone — unless you keep it.
                </p>
              </div>
            </div>

            {/* Right: the personalised range — title fixed, range scrolls in its container */}
            <div className="md:col-span-3">
              <h1 className="font-display text-2xl font-semibold leading-tight md:text-3xl">Your masterpiece, made real.</h1>
              <div className="mt-4">
                {loadError ? (
                  <div className="rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-6 text-center">
                    <p className="text-sm text-[#6F6358]">we couldn’t load the range just now.</p>
                    <Button variant="secondary" size="lg" className="mt-3" onClick={loadCatalogue}>
                      try again
                    </Button>
                  </div>
                ) : products ? (
                  <FlowCatalogue products={products} mode="sections" compact scrollable />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-48 animate-pulse rounded-2xl border border-[#EADFC9] bg-[#FBF5E9]" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
