import { IconBrandApple, IconBrandGooglePlay } from '@tabler/icons-react';
import { DRAW_STORE_BADGES, STORE_LABEL, storeHref, type DrawStore } from '@/lib/drawApp';
import { cn } from '../cn';
import { Icon } from '../primitives/Icon';

const STORE_ICON = { appStore: IconBrandApple, googlePlay: IconBrandGooglePlay } as const;

/**
 * A "get Snickerdoodle Draw" store button, in three states (src/lib/drawApp.ts):
 *  1. link + official artwork → Apple's / Google's own badge, unaltered (their rules), as the link;
 *  2. link, no artwork yet     → our plain ink stand-in with the store's own wording;
 *  3. no link yet              → the same stand-in, faded, saying "coming soon for iPhone and iPad" (not a link at all).
 * 48px tall (≥44px tap target). Opens the store in a new tab, so the shopper keeps their place on Snickerdoodle
 * (founder, 27 Nov 2026). No tracking on the link: rel="noopener noreferrer", nothing appended.
 */
export function StoreBadge({ store, className }: { store: DrawStore; className?: string }) {
  const href = storeHref(store);
  const badge = DRAW_STORE_BADGES[store];
  const label = STORE_LABEL[store];

  if (href && badge) {
    // Google's badge file carries its required clear space around the badge (about a sixth of its height on each side),
    // so it's drawn taller and pulled into the 48px row: the badge itself then stands about as tall as the button beside it.
    const padded = store === 'googlePlay';
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn('press inline-flex min-h-12 items-center rounded-[10px]', padded && '-mx-2.5', className)}>
        <img src={badge} alt={`${label.full} (opens in a new tab)`} height={padded ? 70 : 48} className={padded ? 'block h-[70px] w-auto -my-[11px]' : 'block h-12 w-auto'} />
      </a>
    );
  }

  const face = (soon: boolean) => (
    <>
      <Icon icon={STORE_ICON[store]} size={26} stroke={1.75} />
      <span className="flex flex-col items-start text-left leading-none">
        {/* not out yet: say which devices it's coming to ("coming soon for iPhone and iPad", founder 26 Nov 2026) */}
        <span className="text-[10px] font-semibold opacity-85">{soon ? 'coming soon for' : label.small}</span>
        <span className="mt-0.5 whitespace-nowrap text-[17px] font-extrabold tracking-[-0.01em]">{soon ? label.devices : label.name}</span>
      </span>
    </>
  );
  const shape = 'inline-flex min-h-12 min-w-[164px] items-center gap-2.5 rounded-[12px] border-2 border-cocoa px-3.5 py-1.5';

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label.full} (opens in a new tab)`} className={cn('press bg-cocoa text-paper shadow-[0_3px_0_var(--color-ink-soft)]', shape, className)}>
        {face(false)}
      </a>
    );
  }
  return (
    <span className={cn('cursor-default border-dashed bg-paper text-ink-soft', shape, className)}>
      {face(true)}
    </span>
  );
}

/** Both store buttons side by side (wrapping on a narrow phone). */
export function StoreBadges({ className, align = 'start' }: { className?: string; align?: 'start' | 'center' }) {
  return (
    <div className={cn('flex flex-wrap gap-3', align === 'center' ? 'justify-center' : 'justify-center md:justify-start', className)}>
      <StoreBadge store="appStore" />
      <StoreBadge store="googlePlay" />
    </div>
  );
}
