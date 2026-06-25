import Link from 'next/link';
import { cn } from '../cn';
import { Icon, type TablerIconComponent } from '../primitives/Icon';

/** Mobile bottom tab bar for the logged-in app surface (hidden on desktop). */
export type Tab = { label: string; href: string; icon: TablerIconComponent };

export function BottomTabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[#EFE6D6] bg-white px-2 pb-5 pt-2 md:hidden"
    >
      {tabs.map((t) => {
        const on = t.label === active;
        return (
          <Link
            key={t.label}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center gap-0.5 px-3 text-[10px] font-semibold',
              on ? 'text-cinnamon' : 'text-[#B3A491]',
            )}
          >
            <Icon icon={t.icon} size={21} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
