'use client';

import { IconDeviceMobile, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { unlinkAppDeviceAction } from '@/app/actions/appLink';
import type { LinkedDevice } from '@/server/app/link';
import { toast } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Snickerdoodle Draw on the account page: the phones linked to this account (each one unlinkable
 * here, at once), or a quiet word about the app if none are. One card, no badges, no push.
 */
export function DrawAppCard({ devices }: { devices: LinkedDevice[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const unlink = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const res = await unlinkAppDeviceAction({ tokenId: id });
      toast(res.ok ? 'unlinked — the drawings on that phone stay put' : 'that one’s already unlinked');
    } catch {
      toast('couldn’t unlink just now — try again');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="draw-app-title" className="pop-in mt-4 rounded-2xl border-2 border-cocoa bg-paper p-4">
      <h2 id="draw-app-title" className="flex items-center gap-2 font-display text-lg text-cocoa">
        <Icon icon={IconPencil} size={18} className="text-cinnamon" /> snickerdoodle draw
      </h2>
      {devices.length === 0 ? (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">our little drawing app for 3–12s. link it, and the drawings you pick land straight in your keepsake box.</p>
          <Button href="/app/link" variant="secondary" size="sm" className="mt-3">
            link snickerdoodle draw
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">linked phones can send you the drawings you choose. they can’t see the rest of your keepsake box.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2">
                <Icon icon={IconDeviceMobile} size={20} className="shrink-0 text-cocoa" />
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-cocoa">
                  <b>{d.label}</b> · {d.familyName}
                  <span className="block text-[11px] text-ink-faint">
                    linked {day(d.linkedOn)} · last used {day(d.lastUsedOn)}
                  </span>
                </span>
                <Button variant="secondary" size="sm" disabled={busy === d.id} onClick={() => unlink(d.id)} aria-label={`unlink ${d.label}`}>
                  {busy === d.id ? 'unlinking…' : 'unlink'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
