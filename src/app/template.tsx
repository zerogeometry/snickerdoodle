import type { ReactNode } from 'react';

/**
 * Re-mounts on every navigation, so each screen arrives with the app's page-enter motion
 * (a short CSS rise + fade; compositor-only, reduced-motion-safe). No JS animation library.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
