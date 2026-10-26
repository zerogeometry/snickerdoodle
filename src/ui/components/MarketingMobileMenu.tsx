'use client';

import { IconMenu2, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

const LINKS = [
  { href: '/how-it-works', label: 'how it works' },
  { href: '/gifts', label: 'gifts' },
  { href: '/our-story', label: 'our story' },
];

/**
 * The mobile marketing menu — a hamburger that opens an accessible drawer.
 *
 * The drawer is PORTALLED to <body> on the top layer (z-[70], with the sheets), not drawn inside the
 * header: the header and the page share one stacking level and the page comes later, so a drawer
 * left inside the header opened UNDER the page. While open the page behind doesn't scroll, Escape
 * closes it, and focus moves in (and back to the button on close).
 */
export function MarketingMobileMenu({ signedIn = false }: { signedIn?: boolean }) {
  const base = LINKS;
  const links = signedIn
    ? [{ href: '/home', label: 'your keepsakes' }, { href: '/account', label: 'your account' }, ...base]
    : [...base, { href: '/login', label: 'log in' }];
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    navRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button ref={buttonRef} type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="flex min-h-11 min-w-11 items-center justify-center">
        <Icon icon={IconMenu2} size={26} className="text-ink-soft" />
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-cocoa/40 motion-safe:animate-[fade_.2s_ease]"
              />
              <nav ref={navRef} className="pt-safe absolute right-0 top-0 flex h-full w-[78%] max-w-xs flex-col overflow-y-auto bg-oat px-6 pb-5 shadow-2xl motion-safe:animate-[slidein_.22s_ease]">
                <div className="flex items-center justify-between pt-5">
                  <span className="font-display text-xl font-semibold text-cocoa">snickerdoodle</span>
                  <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center">
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
