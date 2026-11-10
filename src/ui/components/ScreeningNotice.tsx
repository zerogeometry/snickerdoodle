'use client';

import { IconHandStop } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { screeningStatusAction } from '@/app/actions/screening';
import { useBasket, useUpload } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/** How often, and for how long, to ask whether the background check has finished. */
export const SCREENING_POLL = { firstMs: 2_000, everyMs: 3_000, giveUpMs: 4 * 60_000 } as const;

/** What each picture's check came back as, this visit (so a cleared one isn't asked about again). */
const known = new Map<string, 'ok' | 'held'>();

/**
 * The safety checks run in the background after an upload (D26), so the catalogue loads at full
 * speed. When they finish and the picture is held, this notice comes up wherever the shopper has got
 * to (founder, 10 Nov 2026), and stays until they tap "back to upload" (their call, time to read it).
 * Going back takes the picture off the page and out of the basket. It was never going to print:
 * checkout refuses anything not cleared.
 */
export function ScreeningNotice() {
  const router = useRouter();
  const assetId = useUpload((s) => s.upload?.assetId ?? null);
  const [heldId, setHeldId] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;
    if (known.get(assetId) === 'held') {
      setHeldId(assetId);
      return;
    }
    if (known.has(assetId)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const ask = async () => {
      if (stopped) return;
      const status = await screeningStatusAction(assetId).catch(() => 'checking' as const);
      if (stopped) return;
      if (status === 'held') {
        known.set(assetId, 'held');
        setHeldId(assetId);
        return;
      }
      if (status === 'ok') {
        known.set(assetId, 'ok');
        return;
      }
      if (status === null) return; // not theirs to ask about (or gone): nothing to say
      // still checking: ask again in a moment (checkout finishes the check itself if we give up)
      if (Date.now() - started < SCREENING_POLL.giveUpMs) timer = setTimeout(ask, SCREENING_POLL.everyMs);
    };
    timer = setTimeout(ask, SCREENING_POLL.firstMs);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [assetId]);

  const open = !!heldId && heldId === assetId;
  const backToUpload = () => {
    const id = heldId;
    setHeldId(null);
    if (id) {
      const basket = useBasket.getState();
      for (const item of basket.items) if (JSON.stringify(item).includes(id)) basket.remove(item.id);
    }
    useUpload.getState().resetUpload();
    router.push('/start-creating');
  };

  return (
    <Modal
      open={open}
      onClose={backToUpload}
      title="we’ve paused this picture"
      headerLeading={
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-cocoa bg-honey-band">
          <Icon icon={IconHandStop} size={22} className="text-cinnamon" />
        </span>
      }
      footer={
        <Button size="lg" className="w-full" onClick={backToUpload}>
          back to upload
        </Button>
      }
    >
      <div className="space-y-2.5 pb-2 text-[15px] leading-relaxed text-ink-soft">
        <p>
          our safety check spotted something in it that might not be right for a keepsake, like rude words or grown-up
          content.
        </p>
        <p>
          <b className="text-cocoa">it won’t be printed, shared or shown to your family</b> while it’s paused. if
          we’ve got it wrong, sorry. we’ll take a closer look.
        </p>
        <p>for now, pop in another picture.</p>
      </div>
    </Modal>
  );
}
