import Link from 'next/link';
import { cn } from '../cn';
import { Icon, type TablerIconComponent } from '../primitives/Icon';

/**
 * The mobile app's tab bar (hidden on desktop): a floating ink "pill" in the thumb zone, like
 * a native app. The active tab glows sunshine and its icon hops once on arrival (.hop —
 * reduced-motion-safe). Sits above the home indicator via safe-area padding.
 */
export type Tab = { label: string; href: string; icon: TablerIconComponent };

export function BottomTabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3.5 md:hidden">
      <div className="grid h-16 grid-cols-4 rounded-[22px] bg-cocoa shadow-[0_10px_24px_rgba(43,33,24,.3)]">
        {tabs.map((t) => {
          const on = t.label === active;
          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'press flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] lowercase',
                on ? 'font-extrabold text-honey' : 'font-semibold text-oat/85',
              )}
            >
              <span className={on ? 'hop' : undefined}>
                <Icon icon={t.icon} size={22} />
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
