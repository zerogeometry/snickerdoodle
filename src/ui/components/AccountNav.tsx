'use client';

import { IconHeart, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { sessionSummaryAction } from '@/app/actions/session';

/**
 * The header's "you" corner. Signed out → "log in". Signed in → "your keepsakes" (the Keepsake
 * Home) + the account sticker (profile, your data) — the same sticker the app header uses, so a
 * parent on any page can always get back to their box. Pass `signedIn` when the server already
 * knows (no flash); otherwise it asks once on mount and shows "log in" meanwhile.
 */
export function AccountNav({ signedIn: known, compact = false }: { signedIn?: boolean; compact?: boolean }) {
  const [signedIn, setSignedIn] = useState<boolean>(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    sessionSummaryAction()
      .then((s) => live && setSignedIn(s.signedIn))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [known]);

  if (!signedIn) {
    return (
      <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-xs font-bold text-ink-soft hover:text-cinnamon md:text-sm md:font-normal">
        log in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Link
        href="/home"
        className={`inline-flex min-h-11 items-center gap-1.5 px-1 font-bold text-cocoa hover:text-cinnamon ${compact ? 'text-xs' : 'text-sm'}`}
      >
        <Icon icon={IconHeart} size={16} className="text-cinnamon" />
        <span className={compact ? 'hidden sm:inline' : ''}>your keepsakes</span>
        {compact ? <span className="sr-only sm:hidden">your keepsakes</span> : null}
      </Link>
      <Link
        href="/account"
        aria-label="Your account"
        className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-honey text-cocoa"
      >
        <Icon icon={IconUser} size={18} />
      </Link>
    </span>
  );
}
