import type { Metadata } from 'next';
import Link from 'next/link';
import { CookieSettingsButton } from '@/ui/components/CookieSettingsButton';
import { Prose } from '@/ui/components/Prose';

export const metadata: Metadata = {
  title: 'cookies',
  description: 'How Snickerdoodle uses cookies — non-essential ones are off by default.',
};

export default function CookiesPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Cookies</h1>
      </div>

      <Prose className="mt-8">
        <p>
          We use a small number of cookies to keep Snickerdoodle secure and working, and — only with your agreement — to
          understand how it&apos;s used so we can make it better. <strong>Non-essential cookies are off by default.</strong>
        </p>

        <h2>Essential cookies (always on)</h2>
        <p>
          These keep you signed in, keep your basket working, and protect the site from abuse. The site can&apos;t work
          without them, so they don&apos;t need your consent.
        </p>

        <h2>Analytics cookies (only with your agreement)</h2>
        <p>
          Right now we don&apos;t run any analytics at all, so &ldquo;accept all&rdquo; and &ldquo;essential
          only&rdquo; set exactly the same cookies today. If we ever add privacy-friendly analytics to see which bits of
          the site work well, they&apos;ll stay off unless you said yes, and you&apos;ll be able to turn them off again
          any time. We&apos;ll never use them to profile children or for advertising.
        </p>

        <h2>Managing your choices</h2>
        <p>
          The first time you visit, we ask: <strong>accept all</strong> or <strong>essential only</strong>. The two
          buttons are the same size and look the same, because the choice is genuinely yours. Until you pick, only
          essential cookies are used.
        </p>
        <p>
          Changed your mind? Tap <strong>cookie settings</strong> at the foot of our pages (or{' '}
          <CookieSettingsButton className="font-semibold text-cinnamon underline">change your choice here</CookieSettingsButton>)
          and the same choice comes back. You can also clear cookies in your browser at any time. For the full picture
          of how we use data, see our <Link href="/trust/privacy">Privacy Notice</Link>.
        </p>
      </Prose>
    </div>
  );
}
