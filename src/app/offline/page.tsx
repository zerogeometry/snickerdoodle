import { IconCloudOff } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Logo } from '@/ui/components/Logo';
import { Icon } from '@/ui/primitives/Icon';
import { TrustLine } from '@/ui/primitives/TrustLine';
import { RetryButton } from './RetryButton';

export const metadata: Metadata = { title: 'you’re offline', robots: { index: false, follow: false } };

/**
 * The one page the service worker keeps (public/sw.js): shown when there's no connection. It holds
 * nothing personal — no keepsakes, no family, no names — so it is safe to sit in a phone's cache.
 */
export default function OfflinePage() {
  return (
    <main id="main" className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Logo height={46} />
      <div className="tape pop-in mt-10 w-full max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)]">
        <div className="sticker wiggle mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-sky">
          <Icon icon={IconCloudOff} size={30} className="text-cocoa" />
        </div>
        <h1 className="mt-5 font-display text-3xl text-cocoa">you&apos;re offline for a moment</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          We can&apos;t reach the internet just now. Your keepsakes are safe and sound — they&apos;ll be right here
          once you&apos;re back online.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <RetryButton />
          <TrustLine>your keepsakes stay in your family&apos;s private home</TrustLine>
        </div>
      </div>
    </main>
  );
}
