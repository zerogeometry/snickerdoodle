import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';
import { Logo } from './Logo';

/**
 * The compact, sticky app header for the create/buy flow screens (start creating, the range,
 * customize, the studio, sign-in, invites, wishes) — the same kraft bar as the app shell's
 * phone header (AppDesktopNav), so every screen feels like one app. Optional sticker-style back
 * button (≥44px), the badge + wordmark, an optional middle slot (e.g. the step trail) and an
 * optional right slot (basket, log in…). Sits under the status bar via .pt-safe.
 */
export function FlowHeader({
  back,
  middle,
  right,
  tag,
  wide = false,
}: {
  back?: { href: string; label: string };
  middle?: ReactNode;
  right?: ReactNode;
  /** A small sticker beside the wordmark, e.g. "studio". */
  tag?: string;
  /** Match a page whose content widens on big screens (the made-real create page). */
  wide?: boolean;
}) {
  return (
    <header className="pt-safe kraft sticky top-0 z-30 border-b-2 border-cocoa/10">
      <div className={`mx-auto flex min-h-[60px] w-full max-w-7xl items-center${wide ? ' 2xl:max-w-[1600px]' : ''} justify-between gap-3 px-4 py-2 md:px-6`}>
        <div className="flex min-w-0 items-center gap-2.5">
          {back ? (
            <Link
              href={back.href}
              aria-label={back.label}
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)]"
            >
              <Icon icon={IconArrowLeft} size={19} />
            </Link>
          ) : null}
          <Link href="/" aria-label="snickerdoodle home" className="flex min-h-11 min-w-0 items-center gap-2">
            <Logo height={36} />
          </Link>
          {tag ? (
            <span className="sticker shrink-0 rotate-[-4deg] rounded-pill bg-honey px-2 py-0.5 text-[11px] font-extrabold lowercase text-cocoa">
              {tag}
            </span>
          ) : null}
        </div>
        {middle ? <div className="hidden min-w-0 sm:block">{middle}</div> : null}
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}
