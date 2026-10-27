'use client';

import { IconHeart } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { keepsakeForStudioAction, keepsakePickerAction } from '@/app/actions/keepsakePicker';
import { toast, useUpload } from '@/lib/store';
import type { PickerKeepsake } from '@/server/keepsakePicker';
import { Icon } from '@/ui/primitives/Icon';

/** How many keepsakes show before "show all". */
const FIRST = 8;

/**
 * "Create" from inside the app (founder, 27 Oct): under the upload screen, the family's keepsakes —
 * pick one to make it real again, or upload a new drawing above. Picking one makes it the drawing in
 * progress (the same as the drawing picker's "edit in studio"), and the usual collection follows.
 * Signed-out shoppers (or an empty box) see nothing extra. Authz-gated server side (the picker's own
 * loader: only keepsakes this viewer can see, short-lived signed links).
 */
export function StartFromKeepsake() {
  const [keepsakes, setKeepsakes] = useState<PickerKeepsake[] | null>(null);
  const [all, setAll] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    keepsakePickerAction()
      .then((r) => live && setKeepsakes(r.ok && r.signedIn ? r.keepsakes : []))
      .catch(() => live && setKeepsakes([]));
    return () => {
      live = false;
    };
  }, []);

  const pick = async (k: PickerKeepsake) => {
    if (opening) return;
    setOpening(k.id);
    try {
      const res = await keepsakeForStudioAction({ assetId: k.id });
      if (!res.ok) return void toast('couldn’t open that one — try again');
      const trim = res.trim;
      useUpload.getState().setUpload({
        dataUrl: res.dataUrl,
        name: 'drawing.jpg',
        key: `keepsake-${k.id}`,
        assetId: k.id,
        kept: true,
        fromKeepsake: true, // its first edit makes a NEW keepsake (src/lib/keepsakeFork.ts)
        aspect: res.aspect,
        ...(trim ? { trim, cutout: { ...trim, trim: true } } : {}),
      });
      window.scrollTo({ top: 0 });
    } finally {
      setOpening(null);
    }
  };

  if (!keepsakes?.length) return null;
  const shown = all ? keepsakes : keepsakes.slice(0, FIRST);
  return (
    <section aria-labelledby="from-keepsakes" className="pop-in mt-10 w-full max-w-3xl text-left" style={{ ['--i' as string]: 4 }}>
      <h2 id="from-keepsakes" className="flex items-center justify-center gap-2 text-center font-display text-2xl text-cocoa">
        <Icon icon={IconHeart} size={20} className="text-cinnamon" /> or start from a keepsake
      </h2>
      <p className="mt-1 text-center text-sm text-ink-soft">pick one from your keepsake box and watch it land on everything again.</p>
      <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {shown.map((k, i) => {
          const src = k.thumbUrl ?? k.imageUrl;
          return (
            <li key={k.id}>
              <button
                type="button"
                onClick={() => void pick(k)}
                disabled={!!opening}
                aria-label={`make ${k.childFirstName ? `${k.childFirstName}’s drawing` : 'this keepsake'} real`}
                className="polaroid press block w-full !p-1.5 text-left disabled:opacity-60"
                style={{ ['--tilt' as string]: i % 2 ? '1.4deg' : '-1.6deg' }}
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-paper-2">
                  {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
                </span>
                <span className="mt-1 block truncate text-[11px] font-bold text-ink-soft">
                  {opening === k.id ? 'opening…' : (k.childFirstName ?? `kept ${new Date(k.createdAtISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {keepsakes.length > FIRST && !all ? (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setAll(true)} className="min-h-11 px-3 text-sm font-bold text-cinnamon underline underline-offset-2">
            show all {keepsakes.length}
          </button>
        </div>
      ) : null}
    </section>
  );
}
