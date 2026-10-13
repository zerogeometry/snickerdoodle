'use client';

import { IconHeart, IconLock } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { setKeepChoiceAction } from '@/app/actions/keepChoice';

/**
 * After a purchase: "keep these in your keepsake box?" The drawings were only filed for the
 * order — nothing is kept unless the parent says so. Yes → kept, theirs until they delete it.
 * No (or no answer) → held only while the order needs it, then deleted — said plainly.
 */
export function KeepChoiceCard({ orderRef, creations }: { orderRef: string; creations: { assetId: string; imageUrl: string | null }[] }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | 'kept' | 'not-kept'>(null);
  const [error, setError] = useState(false);
  const many = creations.length > 1;
  const them = many ? 'them' : 'it';

  const choose = (keep: boolean) =>
    startTransition(async () => {
      setError(false);
      const res = await setKeepChoiceAction(orderRef, keep);
      if (!res.ok) return setError(true);
      setDone(keep ? 'kept' : 'not-kept');
    });

  if (done) {
    return (
      <div role="status" className="pop-in mt-8 w-full max-w-md rounded-[18px] border-2 border-cocoa/15 bg-paper p-4 text-sm text-cocoa">
        {done === 'kept'
          ? `kept ✓ — ${many ? 'they’re' : 'it’s'} in your keepsake box, ready whenever you want to make something new.`
          : `no problem — we’ll only hold ${them} while we make and send your order, plus 30 days in case anything needs reprinting. then ${many ? 'they’re' : 'it’s'} deleted for good.`}
      </div>
    );
  }

  return (
    <section aria-labelledby="keep-choice" className="pop-in tape mt-8 w-full max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-5 text-left shadow-[0_4px_0_var(--color-cocoa)]">
      <h2 id="keep-choice" className="font-display text-xl text-cocoa">
        keep {many ? 'these' : 'this'} in your keepsake box?
      </h2>
      <ul className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
        {creations.map((c, i) => (
          <li key={c.assetId} className="polaroid w-[84px] shrink-0" style={{ ['--tilt' as string]: i % 2 ? '2deg' : '-2deg', padding: '5px 5px 7px' }}>
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
              {c.imageUrl ? <img src={c.imageUrl} alt="your drawing" className="h-full w-full object-contain" /> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
        we&apos;ll hold onto {them} so you can make something else later — private to your family, and you can delete {them} any time.
      </p>
      {error ? (
        <p role="alert" className="mt-2 border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
          that didn&apos;t save — try again
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={() => choose(true)} disabled={pending}>
          <Icon icon={IconHeart} size={16} /> yes, keep {them}
        </Button>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => choose(false)} disabled={pending}>
          no thanks — just for this order
        </Button>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Icon icon={IconLock} size={12} className="mt-px shrink-0 text-green-save" />
        either way, we keep {them} while we make and send your order, and for 30 days after it&apos;s sent in case
        anything arrives damaged and needs reprinting. if you don&apos;t keep {them}, {many ? 'they’re' : 'it’s'} deleted for good after that.
      </p>
    </section>
  );
}
