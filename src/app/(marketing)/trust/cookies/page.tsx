import type { Metadata } from 'next';
import Link from 'next/link';
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
          If you say yes, we use privacy-friendly analytics to see which bits of the site work well. These stay off
          until you opt in, and you can turn them off again any time. We never use them to profile children or for
          advertising.
        </p>

        <h2>Managing your choices</h2>
        <p>
          You can change your cookie choices whenever you like from the cookie banner, or by clearing cookies in your
          browser. For the full picture of how we use data, see our <Link href="/trust/privacy">Privacy Notice</Link>.
        </p>
      </Prose>
    </div>
  );
}
