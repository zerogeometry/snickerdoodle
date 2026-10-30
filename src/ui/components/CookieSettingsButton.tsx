'use client';

import { COOKIE_SETTINGS_EVENT } from './CookieBanner';

/** "cookie settings": brings the cookie banner back so a choice can be changed any time (09-B10). */
export function CookieSettingsButton({ className, children = 'cookie settings' }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))} className={className}>
      {children}
    </button>
  );
}
