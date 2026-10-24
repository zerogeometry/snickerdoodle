'use client';

import { useLayoutEffect } from 'react';
import { useUpload } from '@/lib/store';

/**
 * Puts this tab's drawing back after a refresh (sessionStorage — src/lib/uploadSession.ts). A layout
 * effect, so it's read before any page's own effects run; after mount, so the server render and the
 * first client render agree (no hydration mismatch).
 */
export function UploadSession() {
  useLayoutEffect(() => {
    if (useUpload.persist.hasHydrated()) return;
    // …then write back what's on screen (a drawing chosen before the read wins over the stored one)
    void useUpload.persist.rehydrate()?.then(() => useUpload.setState({}));
  }, []);
  return null;
}
