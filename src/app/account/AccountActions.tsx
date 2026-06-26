'use client';

import { IconDownload, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { Icon } from '@/ui/primitives/Icon';
import { toast } from '@/lib/store';

/** The "your data, your rules" controls (download / see / delete). Client-side
 * so they can confirm interactively; the real DSAR backend wires in behind them. */
export function AccountActions() {
  return (
    <div className="divide-y divide-[#F2EADB] overflow-hidden rounded-2xl border border-[#EADFC9] bg-white">
      <button
        type="button"
        onClick={() => toast("we'll email you a copy of everything")}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FBF8F1]"
      >
        <Icon icon={IconDownload} size={18} className="shrink-0 text-cinnamon" />
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-cocoa">Download your data</span>
          <span className="block text-[11px] text-[#9C8E7E]">Every keepsake and detail we hold — yours to keep.</span>
        </span>
      </button>
      <Link href="/home" className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FBF8F1]">
        <Icon icon={IconShieldCheck} size={18} className="shrink-0 text-green-save" />
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-cocoa">See what we hold</span>
          <span className="block text-[11px] text-[#9C8E7E]">Your keepsakes, your circle, your originals.</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => toast('a real person will confirm before anything is deleted')}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FCEEEA]"
      >
        <Icon icon={IconTrash} size={18} className="shrink-0 text-berry" />
        <span className="flex-1">
          <span className="block text-[13px] font-bold text-berry">Delete a keepsake or your account</span>
          <span className="block text-[11px] text-[#9C8E7E]">
            Really deleted — from our store, our processors and our backups.
          </span>
        </span>
      </button>
    </div>
  );
}
