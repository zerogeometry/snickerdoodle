import { IconHeartPlus, IconHome, IconPackage, IconUsers, IconWand } from '@tabler/icons-react';
import type { Tab } from './BottomTabBar';

/**
 * The single canonical app-surface navigation (docs/03: "Home · Create · Family
 * · Orders"). Shared by every app screen so the bottom tab bar and desktop nav
 * never disagree. Basket is reached via a header cart button, not a tab.
 * "Keep" (founder, 17 Nov 2026) sits between home and create on phones: it isn't a page — it opens the
 * phone's picker to add pictures straight to the keepsake box. Desktop gets "add keepsake" on the
 * keepsake page instead (APP_NAV is unchanged).
 */
export const APP_TABS: Tab[] = [
  { label: 'Home', href: '/home', icon: IconHome },
  { label: 'Keep', href: '/home', icon: IconHeartPlus, action: 'keep' },
  { label: 'Create', href: '/start-creating', icon: IconWand },
  { label: 'Family', href: '/family', icon: IconUsers },
  { label: 'Orders', href: '/orders', icon: IconPackage },
];

export const APP_NAV = [
  { label: 'Home', href: '/home' },
  { label: 'Create', href: '/start-creating' },
  { label: 'Family', href: '/family' },
  { label: 'Orders', href: '/orders' },
] as const;
