'use client';

import { IconMenu2, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

const LINKS = [
  { href: '/how-it-works', label: 'how it works' },
  { href: '/gifts', label: 'gifts' },
  { href: '/our-story', label: 'our story' },
];

/** The mobile marketing menu — a hamburger that opens an accessible drawer. */
export function MarketingMobileMenu({ signedIn = false }: { signedIn?: boolean }) {
  const links = signedIn
    ? [{ href: '/home', label: 'your keepsakes' }, { href: '/account', label: 'your account' }, ...LINKS]
    : [...LINKS, { href: '/login', label: 'log in' }];
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon icon={IconMenu2} size={26} className="text-ink-soft" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-cocoa/40 motion-safe:animate-[fade_.2s_ease]"
          />
          <nav className="absolute right-0 top-0 flex h-full w-[78%] max-w-xs flex-col bg-oat px-6 py-5 shadow-2xl motion-safe:animate-[slidein_.22s_ease]">
            <div className="flex items-center justify-between">
              <span className="font-display text-xl font-semibold text-cocoa">snickerdoodle</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <Icon icon={IconX} size={24} className="text-ink-soft" />
              </button>
            </div>
            <div className="mt-8 flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg py-3 text-lg font-semibold text-cocoa hover:text-cinnamon"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <Button href="/start-creating" size="lg" className="mt-6 w-full" onClick={() => setOpen(false)}>
              start creating
            </Button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
