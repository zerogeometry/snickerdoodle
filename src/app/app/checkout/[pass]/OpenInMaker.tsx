'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { useUpload } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { FlowHeader } from '@/ui/components/FlowHeader';

/** Put the keepsake in progress (as "start from a keepsake" does) and open the product's maker. */
export function OpenInMaker({ assetId, productKey }: { assetId: string; productKey: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    keepsakeForStudioAction({ assetId })
      .then((res) => {
        if (!live) return;
        if (!res.ok) return setFailed(true);
        useUpload.getState().setUpload({
          dataUrl: res.dataUrl,
          name: 'drawing.jpg',
          key: `keepsake-${assetId}`,
          assetId,
          kept: true,
          fromKeepsake: true, // its first edit makes a NEW keepsake (src/lib/keepsakeFork.ts)
          aspect: res.aspect,
          ...(res.trim ? { trim: res.trim, cutout: { ...res.trim, trim: true } } : {}),
        });
        router.replace(`/customize/${encodeURIComponent(productKey)}`);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [assetId, productKey, router]);

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        {failed ? (
          <section role="alert" className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
            <h1 className="font-display text-[26px] leading-tight text-cocoa">we couldn’t open that drawing</h1>
            <p className="mt-2 text-sm text-ink-soft">it’s safe in your keepsake box, and you can make it real from there.</p>
            <Button href="/home" size="lg" className="mt-5 w-full">
              open your keepsake box
            </Button>
          </section>
        ) : (
          // loading: a skeleton polaroid, never a spinner wall
          <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col items-center">
            <div className="polaroid h-64 w-52 animate-pulse bg-paper-2 motion-reduce:animate-none" />
            <p className="mt-4 font-display text-lg text-cocoa">getting your drawing ready…</p>
          </div>
        )}
      </main>
    </div>
  );
}
