'use client';

import { IconCamera, IconCircleCheck, IconLock, IconPencil, IconRefresh, IconSparkles, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { ExamplePolaroid } from '@/ui/components/ExamplePolaroid';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { BasketButton } from '@/ui/components/BasketButton';
import { CameraCapture } from '@/ui/components/CameraCapture';
import { ImageStudio } from '@/ui/components/ImageStudio';
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { TileSkeletonGrid } from '@/ui/components/TileSkeleton';
import { detectAspect, detectOpaqueBg, normalizeUpload, toast, useUpload } from '@/lib/store';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { removeBackgroundAction } from '@/app/actions/magic';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

export default function StartCreatingPage() {
  const upload = useUpload((s) => s.upload);
  const setUpload = useUpload((s) => s.setUpload);
  const setAssetId = useUpload((s) => s.setAssetId);
  const setOpaqueBg = useUpload((s) => s.setOpaqueBg);
  const setAspect = useUpload((s) => s.setAspect);
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
    // ?all=1 = the DEV curation view (every product, hidden included) — the server
    // action refuses includeHidden in production, so the param is inert there.
    const includeHidden = new URLSearchParams(window.location.search).get('all') === '1';
    void loadCatalogueAction(includeHidden ? { includeHidden } : undefined)
      .then(setProducts)
      .catch(() => setLoadError(true));
  };
  useEffect(loadCatalogue, []);

  /** Set the upload, then detect whether its background is opaque (drives the
   * "remove background" nudge — only shown when removing would actually do something). */
  const applyUpload = (dataUrl: string, name: string) => {
    // Normalise oversized uploads BEFORE they reach the store/ingest (a big phone photo
    // or AI render would otherwise 413 the ingest server action and silently break every
    // mockup). Best-effort: falls back to the original on any hiccup.
    void normalizeUpload(dataUrl, name).then(({ dataUrl: d, name: n }) => {
      setUpload({ dataUrl: d, name: n });
      void detectOpaqueBg(d, n).then(setOpaqueBg);
      // Aspect drives the catalogue tiles' auto-orientation (wide → landscape frame/jigsaw).
      void detectAspect(d).then((a) => { if (a) setAspect(a); });
    });
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
      else if (res.reason === 'nochange') toast('we couldn’t find a clean background to remove on this one');
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

      <FlowHeader
        middle={
          <span className="text-xs text-ink-soft">
            <b className={upload ? '' : 'text-cinnamon'}>upload</b> · <b className={upload ? 'text-cinnamon' : ''}>your range</b> · checkout
          </span>
        }
        right={
          <>
            <BasketButton />
            <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-xs font-bold text-ink-soft hover:text-cinnamon">
              log in
            </Link>
          </>
        }
      />

      {!upload ? (
        // ── Empty state ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 pb-40 pt-10 text-center md:pb-12">
          {/* A drawing, and what a little drawing becomes — a real example keepsake beside it. */}
          <div className="flex items-end justify-center">
            <div className="pop-in polaroid tape relative z-10" style={{ ['--tilt' as string]: '-4deg', ['--pop-rot' as string]: '-6deg' }}>
              <PlaceholderDoodle size={112} />
            </div>
            <div className="pop-in -ml-3 w-[150px] md:w-[170px]" style={{ ['--i' as string]: 1, ['--pop-rot' as string]: '5deg' }}>
              <ExamplePolaroid slug="tractor-cushion" tilt="3deg" tape="sky" eager />
            </div>
          </div>
          <CaveatNote className="pop-in mt-3 -rotate-2 text-xl" >
            here&apos;s what little drawings become
          </CaveatNote>
          <h1 className="pop-in mt-4 font-display text-[32px] leading-[1.05] md:text-5xl" style={{ ['--i' as string]: 1 }}>
            Upload your little one&apos;s drawing
          </h1>
          <p className="pop-in mt-3 max-w-sm text-[15px] text-ink-soft" style={{ ['--i' as string]: 2 }}>
            Snap it or pop it in, and watch it land on a whole family range in moments.
          </p>
          {/* Primary actions: a thumb-zone dock on phones (like the landing's), inline on desktop. */}
          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2.5 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-7 md:flex-row md:justify-center md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none">
            <Button size="lg" className="w-full md:w-auto" attention onClick={() => fileRef.current?.click()}>
              <Icon icon={IconUpload} size={18} /> upload a drawing
            </Button>
            <Button variant="secondary" size="lg" className="w-full md:w-auto" onClick={() => setCameraOpen(true)}>
              <Icon icon={IconCamera} size={18} /> use camera
            </Button>
          </div>
          <div className="pop-in mt-7 max-w-sm rounded-[18px] border-2 border-cocoa/15 bg-paper p-3.5 text-left text-xs leading-relaxed text-ink-soft" style={{ ['--i' as string]: 3 }}>
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
        // ── Made-real state — fits one viewport; only the range + basket scroll ──
        // Wider than before to seat the new basket sidebar beside the range (founder layout).
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-6 py-5 md:overflow-hidden">
          <div className="grid gap-8 md:grid-cols-5 md:items-start">
            {/* Left: the drawing, large, with change / remove background / terms — all equal width */}
            <div className="flex flex-col md:col-span-2">
              {/* The honey frame HUGS the drawing's own aspect ratio (inline-block sized by
                  the image) instead of a fixed full-width box with white slabs inside. */}
              <div className="flex w-full justify-center pt-3">
                {/* A taped polaroid that HUGS the drawing's own aspect (sized by the image). */}
                <div className="pop-in polaroid tape inline-block max-w-full" style={{ ['--tilt' as string]: '-1.5deg' }}>
                  <div className="overflow-hidden bg-paper-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewImg ?? ''} alt="your drawing" className="block h-auto max-h-[18rem] w-auto max-w-full md:max-h-[20rem]" />
                  </div>
                </div>
              </div>
              <div className="mt-5 flex w-full flex-col gap-2.5">
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
              <div className="mt-4 flex w-full items-start gap-2.5 rounded-[14px] border-2 border-leaf bg-leaf-pale p-3">
                <Icon icon={IconLock} size={16} className="mt-0.5 shrink-0 text-green-save" />
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  <b>This stays yours. Always.</b> We use it to make your bits, then it&apos;s gone — unless you keep it.
                </p>
              </div>
            </div>

            {/* Right: the personalised range — title fixed, range scrolls in its container */}
            <div className="md:col-span-3">
              <h1 className="font-display text-[28px] leading-tight md:text-4xl">Your masterpiece, made real.</h1>
              <div className="mt-4">
                {loadError ? (
                  <div role="alert" className="pop-in rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-6 text-center">
                    <Icon icon={IconRefresh} size={28} className="mx-auto text-cinnamon" />
                    <p className="mt-2 text-sm text-ink-soft">we couldn’t load the range just now.</p>
                    <Button variant="secondary" size="lg" className="mt-3" onClick={loadCatalogue}>
                      try again
                    </Button>
                  </div>
                ) : products ? (
                  <FlowCatalogue products={products} mode="sections" compact scrollable />
                ) : (
                  <TileSkeletonGrid count={4} label="loading your range" className="grid grid-cols-2 gap-x-4 gap-y-7 pt-3 md:grid-cols-3" />
                )}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
