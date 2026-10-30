'use client';

import { IconDoorExit, IconDownload, IconShieldCheck, IconTrash, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { toast } from '@/lib/store';
import { deleteAllMyKeepsakesAction, exportMyDataAction } from '@/app/actions/data';
import { CloseAccountModal } from '@/ui/modals/CloseAccountModal';

/** The "your data, your rules" controls — download / see / delete, wired to the real
 * data-rights actions (NN8). Delete is two-tap to confirm and really cascades. */
export function AccountActions() {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const download = () =>
    startTransition(async () => {
      const res = await exportMyDataAction(new Date().toISOString());
      if (!res.ok || !res.json) {
        toast('couldn’t build your download — try again');
        return;
      }
      const blob = new Blob([res.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'snickerdoodle-your-data.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('your data is downloading ✓');
    });

  const del = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteAllMyKeepsakesAction(new Date().toISOString());
      setConfirmDelete(false);
      if (!res.ok) {
        toast('couldn’t delete just now — try again');
        return;
      }
      const n = res.inOrders ?? 0;
      // a keepsake a paid order still needs stays until that order is made — say so, never silently
      const waiting = n > 0 ? `${n} ${n === 1 ? 'is' : 'are'} being made into an order — delete ${n === 1 ? 'it' : 'them'} once ${n === 1 ? 'it’s' : 'they’re'} on the way` : '';
      const gone = res.deleted > 0 ? `deleted — ${res.deleted} keepsake${res.deleted === 1 ? '' : 's'} gone for good` : '';
      toast([gone, waiting].filter(Boolean).join(' · ') || 'nothing to delete');
    });
  };

  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      <button
        type="button"
        onClick={download}
        disabled={pending}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-paper-2 disabled:opacity-60"
      >
        <Icon icon={IconDownload} size={18} className="shrink-0 text-cinnamon" />
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-cocoa">{pending ? 'preparing your download…' : 'Download your data'}</span>
          <span className="block text-[11px] text-ink-faint">Every keepsake and detail we hold — yours to keep.</span>
        </span>
      </button>

      <Link href="/home" className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-paper-2">
        <Icon icon={IconShieldCheck} size={18} className="shrink-0 text-green-save" />
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-cocoa">See what we hold</span>
          <span className="block text-[11px] text-ink-faint">Your keepsakes, your circle, your originals.</span>
        </span>
      </Link>

      <div className="px-4 py-3.5 hover:bg-berry-pale">
        <button type="button" onClick={del} disabled={pending} className="flex w-full items-center gap-3 text-left disabled:opacity-60">
          <Icon icon={IconTrash} size={18} className="shrink-0 text-berry" />
          <span className="flex-1">
            <span className="block text-[13px] font-bold text-berry">
              {confirmDelete ? 'tap again — delete everything for good' : 'Delete all your keepsakes'}
            </span>
            <span className="block text-[11px] text-ink-faint">
              {confirmDelete ? 'this can’t be undone.' : 'Really deleted — the files themselves, not just hidden.'}
            </span>
          </span>
        </button>
        {confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(false)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-ink-soft hover:text-cinnamon">
            <Icon icon={IconX} size={12} /> keep my keepsakes
          </button>
        ) : null}
      </div>

      <div className="px-4 py-3.5 hover:bg-berry-pale">
        <button type="button" onClick={() => setCloseOpen(true)} disabled={pending} className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60">
          <Icon icon={IconDoorExit} size={18} className="shrink-0 text-berry" />
          <span className="flex-1">
            <span className="block text-[13px] font-bold text-berry">Close your account</span>
            <span className="block text-[11px] text-ink-faint">See exactly what happens first — and hand your family to someone if you like.</span>
          </span>
        </button>
      </div>
      <CloseAccountModal open={closeOpen} onClose={() => setCloseOpen(false)} onDownload={download} />
    </div>
  );
}
