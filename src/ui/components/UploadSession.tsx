'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useBasket, useUpload } from '@/lib/store';

/** The create flow: while you're anywhere in here, your drawing stays with you. */
const FLOW = ['/start-creating', '/customize', '/studio', '/catalogue', '/checkout', '/login'];
const inFlow = (path: string) => FLOW.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Puts this tab's drawing back after a refresh (sessionStorage — src/lib/uploadSession.ts). A layout
 * effect, so it's read before any page's own effects run; after mount, so the server render and the
 * first client render agree (no hydration mismatch).
 *
 * …and lets it go when you leave the create flow without keeping it or putting it in the basket
 * (founder, 26 Oct): coming back means a fresh upload — what you'd expect, and no stale drawing (or
 * expired link) waiting on the create page. Kept or in-basket drawings stay.
 */
export function UploadSession() {
  const path = usePathname();
  useLayoutEffect(() => {
    if (useUpload.persist.hasHydrated()) return;
    // …then write back what's on screen (a drawing chosen before the read wins over the stored one)
    void useUpload.persist.rehydrate()?.then(() => useUpload.setState({}));
  }, []);
  useEffect(() => {
    if (!path || inFlow(path)) return;
    if (!useUpload.persist.hasHydrated() || !useBasket.persist.hasHydrated()) return;
    const u = useUpload.getState().upload;
    if (!u || u.kept) return;
    const inBasket = !!u.assetId && useBasket.getState().items.some((i) => JSON.stringify(i).includes(u.assetId!));
    if (!inBasket) useUpload.getState().resetUpload();
  }, [path]);
  return null;
}
