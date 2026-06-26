'use client';

import {
  IconDownload,
  IconLogout,
  IconMail,
  IconShieldCheck,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import Link from 'next/link';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { toast } from '@/lib/store';

export default function AccountPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Home" />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-cocoa">
          <Icon icon={IconUser} size={22} className="text-cinnamon" /> Your account
        </h1>

        {/* Profile */}
        <section className="mt-5 rounded-2xl border border-[#EADFC9] bg-white p-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cinnamon font-display text-base font-bold text-cta-text">
              S
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-cocoa">Sam Hartley</div>
              <div className="flex items-center gap-1.5 text-xs text-[#9C8E7E]">
                <Icon icon={IconMail} size={13} /> sam@example.com
              </div>
            </div>
          </div>
        </section>

        {/* Your data — see / download / delete (trust-critical; one-tap per CLAUDE.md) */}
        <section className="mt-4">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Your data, your rules</p>
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
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#9C8E7E]">
            <Icon icon={IconShieldCheck} size={14} className="mt-0.5 shrink-0 text-green-save" />
            Originals are sacred — your untouched upload is always recoverable, and deletable on demand.
          </p>
        </section>

        <Button
          variant="secondary"
          size="lg"
          className="mt-5 w-full"
          onClick={() => toast('logged out (demo)')}
        >
          <Icon icon={IconLogout} size={16} /> log out
        </Button>

        <p className="mt-4 text-center text-xs text-[#9C8772]">
          Questions about your data?{' '}
          <Link href="/trust/privacy" className="font-bold text-cinnamon">
            read our privacy promise
          </Link>
          .
        </p>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Home" />
    </div>
  );
}
