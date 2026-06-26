import { IconHome, IconPackage, IconUsers, IconWand } from '@tabler/icons-react';
import type { Tab } from './BottomTabBar';

/**
 * The single canonical app-surface navigation (docs/03: "Home · Create · Family
 * · Orders"). Shared by every app screen so the bottom tab bar and desktop nav
 * never disagree. Basket is reached via a header cart button, not a tab.
 */
export const APP_TABS: Tab[] = [
  { label: 'Home', href: '/home', icon: IconHome },
  { label: 'Create', href: '/catalogue', icon: IconWand },
  { label: 'Family', href: '/family', icon: IconUsers },
  { label: 'Orders', href: '/orders', icon: IconPackage },
];

export const APP_NAV = [
  { label: 'Home', href: '/home' },
  { label: 'Create', href: '/catalogue' },
  { label: 'Family', href: '/family' },
  { label: 'Orders', href: '/orders' },
] as const;
