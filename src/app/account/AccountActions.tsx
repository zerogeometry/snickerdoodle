'use client';

import { IconDoorExit, IconDownload, IconShieldCheck, IconTrash, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { toast } from '@/lib/store';
import { closeMyAccountAction, deleteAllMyKeepsakesAction, exportMyDataAction } from '@/app/actions/data';

/** The "your data, your rules" controls — download / see / delete, wired to the real
 * data-rights actions (NN8). Delete is two-tap to confirm and really cascades. */
export function AccountActions() {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const close = () => {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    startTransition(async () => {
      const res = await closeMyAccountAction();
      setConfirmClose(false);
      if (!res.ok) {
        toast(res.reason === 'order-in-flight' ? 'we’re still making an order for you — you can close your account once it’s on its way' : 'couldn’t close it just now — try again');
        return;
      }
      toast('your account is closed — everything’s been deleted');
      window.location.assign('/');
    });
  };

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
      toast(res.deleted > 0 ? `deleted — ${res.deleted} keepsake${res.deleted === 1 ? '' : 's'} gone for good` : 'nothing to delete');
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
        <button type="button" onClick={close} disabled={pending} className="flex w-full items-center gap-3 text-left disabled:opacity-60">
          <Icon icon={IconDoorExit} size={18} className="shrink-0 text-berry" />
          <span className="flex-1">
            <span className="block text-[13px] font-bold text-berry">
              {confirmClose ? 'tap again — close my account for good' : 'Close your account'}
            </span>
            <span className="block text-[11px] text-ink-faint">
              {confirmClose
                ? 'your family, keepsakes and little ones are deleted, and everyone you invited loses access. we keep only the money side of past orders, with your details removed.'
                : 'Everything goes — your family, keepsakes, little ones and invites.'}
            </span>
          </span>
        </button>
        {confirmClose ? (
          <button type="button" onClick={() => setConfirmClose(false)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-bold text-ink-soft hover:text-cinnamon">
            <Icon icon={IconX} size={12} /> keep my account
          </button>
        ) : null}
      </div>
    </div>
  );
}
