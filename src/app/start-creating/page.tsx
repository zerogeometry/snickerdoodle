'use client';

import { IconCamera, IconCircleCheck, IconLock, IconPencil, IconRefresh, IconUpload } from '@tabler/icons-react';
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
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { AccountNav } from '@/ui/components/AccountNav';
import { MakingRangeLoader } from '@/ui/components/MakingRangeLoader';
import { detectAspect, detectOpaqueBg, normalizeUpload, toast, useUpload } from '@/lib/store';
import { takePendingKeep } from '@/lib/pending-keep';
import { finishPendingKeepsAction } from '@/app/actions/keep';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';
import { DesignFromScratch } from '@/ui/components/DesignFromScratch';

export default function StartCreatingPage() {
  const upload = useUpload((s) => s.upload);
  const setUpload = useUpload((s) => s.setUpload);
  const setOpaqueBg = useUpload((s) => s.setOpaqueBg);
  const setAspect = useUpload((s) => s.setAspect);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
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

  // Hold the "making your range" loader over the catalogue until EVERY tile's real photo is ready
  // to show (tiles compose in the background underneath), so the range is revealed whole — never a
  // grid still filling in. A generous safety timeout lifts it regardless.
  const [rangeReady, setRangeReady] = useState(false);
  const [rangeSettled, setRangeSettled] = useState(false);
  const drawingKey = upload?.dataUrl ?? null;
  // Back from signing in after a guest's "+ keepsake": put their drawing back on screen (same
  // browser) and finish the keep (server-side — works on any device the link was opened on).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('resume') !== 'keep') return;
    void (async () => {
      const saved = await takePendingKeep();
      if (saved && !useUpload.getState().upload) setUpload(saved);
      const res = await finishPendingKeepsAction();
      const now = useUpload.getState().upload;
      if (res.ok && now?.assetId && res.kept.includes(now.assetId)) setUpload({ ...now, kept: true });
      if (res.kept.length) toast('kept in your keepsake box ♥');
      else if (!res.ok) toast('sign in to keep your drawing');
      router.replace('/start-creating');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new drawing: the loader comes back and waits for the new range.
  const shownAtRef = useRef(0);
  useEffect(() => {
    if (!drawingKey) return;
    setRangeReady(false);
    setRangeSettled(false);
    shownAtRef.current = Date.now();
    const safety = setTimeout(() => setRangeReady(true), 45_000); // never strand the shopper
    return () => clearTimeout(safety);
  }, [drawingKey]);
  // Every photo is ready: give the tiles a beat to swap them in, and let the loader play at least
  // its little moment so the reveal lands as a reveal, not a flicker.
  useEffect(() => {
    if (!rangeSettled || rangeReady) return;
    const MIN_LOADER_MS = 1200;
    const SWAP_MS = 450; // a tile's instant preview → photo cross-fade
    const t = setTimeout(() => setRangeReady(true), Math.max(SWAP_MS, MIN_LOADER_MS - (Date.now() - shownAtRef.current)));
    return () => clearTimeout(t);
  }, [rangeSettled, rangeReady]);

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
      <FlowHeader
        wide={!!upload}
        middle={
          <span className="text-xs text-ink-soft">
            <b className={upload ? '' : 'text-cinnamon'}>upload</b> · <b className={upload ? 'text-cinnamon' : ''}>your range</b> · checkout
          </span>
        }
        right={
          <>
            <BasketButton />
            <AccountNav compact />
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
            <DesignFromScratch variant="ghost" size="md" className="w-full md:w-auto" label="or design from scratch" />
          </div>
          <p className="pop-in mt-6 max-w-sm text-xs leading-relaxed text-ink-soft" style={{ ['--i' as string]: 3 }}>
            <b className="text-cocoa">tip:</b> snap it in daylight, filling the frame — and pick the original photo, not one sent
            by message (those get shrunk, and big prints love detail).
          </p>
          <div className="pop-in mt-4 max-w-sm rounded-[18px] border-2 border-cocoa/15 bg-paper p-3.5 text-left text-xs leading-relaxed text-ink-soft" style={{ ['--i' as string]: 3 }}>
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
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-6 py-5 md:overflow-hidden 2xl:max-w-[1600px]">
          {/* Desktop: both columns share the row height (set by the range on the right), and the
              drawing grows into the left column's spare height — so the two sides end level. */}
          <div className="grid gap-8 md:grid-cols-5 md:items-stretch">
            {/* Left: the drawing, large, with change / remove background / terms — all equal width */}
            <div className="flex flex-col md:col-span-2">
              {/* The honey frame HUGS the drawing's own aspect ratio (inline-block sized by
                  the image) instead of a fixed full-width box with white slabs inside. */}
              <div className="art-stage flex w-full justify-center pt-3">
                {/* A taped polaroid that HUGS the drawing's own aspect (sized by the image). On
                    desktop, once the aspect is known, .art-fit sizes it to fill the stage. */}
                <div
                  className={`pop-in polaroid tape inline-block max-w-full ${upload.aspect ? 'art-fit' : ''}`}
                  style={{ ['--tilt' as string]: '-1.5deg', ...(upload.aspect ? { ['--art-aspect' as string]: upload.aspect } : {}) }}
                >
                  <div className="overflow-hidden bg-paper-2">
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
                  onClick={() => router.push('/studio')}
                  // Nudge (same wobble as start-creating) when the photo still has its paper/background.
                  attention={!upload.cutout && upload.opaqueBg === true}
                >
                  <Icon icon={upload.cutout ? IconCircleCheck : IconPencil} size={16} />
                  {upload.cutout ? 'edited · back to studio' : 'edit in studio'}
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
                ) : (
                  <div className="relative">
                    {/* The range composes underneath (invisible but laid out, so lazy tiles still
                        start) while the loader plays on top; then it fades in. */}
                    {products ? (
                      <div inert={!rangeReady} className={`transition-opacity duration-500 ${rangeReady ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                        <FlowCatalogue products={products} mode="sections" compact scrollable onRangeReady={() => setRangeSettled(true)} />
                      </div>
                    ) : (
                      <div className="h-[55vh] md:h-[calc(100dvh-23rem)] md:max-h-[34rem]" />
                    )}
                    {!rangeReady || !products ? (
                      <MakingRangeLoader drawing={previewImg} className="absolute inset-0" />
                    ) : null}
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
