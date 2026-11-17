import Link from 'next/link';
import { cn } from '../cn';
import { Icon, type TablerIconComponent } from '../primitives/Icon';
import { KeepTab } from './KeepTab';
import { TabTrack } from './TabTrack';

/**
 * The mobile app's tab bar (hidden on desktop): a floating ink "pill" in the thumb zone, like a native
 * app, and the same bar as Snickerdoodle Draw's. The chosen tab sits on a sunshine pill (ink icon and
 * word); moving to another tab slides the pill across, stretched the way it came, and it lands; the new
 * tab's icon hops (TabTrack + .tab-pill / .hop in globals.css, reduced-motion-safe). Sits above the home
 * indicator via safe-area padding.
 */
/** `action: 'keep'` = not a page: it opens the phone's picker to add pictures to the keepsake box (KeepTab). */
export type Tab = { label: string; href: string; icon: TablerIconComponent; action?: 'keep' };

export function BottomTabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  const at = Math.max(0, tabs.findIndex((t) => t.label === active && !t.action));
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3.5 md:hidden">
      <TabTrack at={at} count={tabs.length}>
        {tabs.map((t, i) => {
          if (t.action === 'keep') return <KeepTab key={t.label} label={t.label} />;
          const on = i === at;
          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'press-soft relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] lowercase',
                on ? 'font-extrabold text-cocoa' : 'font-semibold text-oat/85',
              )}
            >
              <span className="tab-icon inline-block">
                <Icon icon={t.icon} size={22} />
              </span>
              {t.label}
            </Link>
          );
        })}
      </TabTrack>
    </nav>
  );
}
