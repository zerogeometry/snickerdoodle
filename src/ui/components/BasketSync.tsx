'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { loadSavedBasketAction, saveBasketAction } from '@/app/actions/basket';
import { mergeBaskets } from '@/lib/basketMerge';
import { useBasket, type BasketItem } from '@/lib/store';

/** Whose basket this tab holds (a tag from the server, never the account id) — set once it's been matched to an account. */
export const BASKET_OWNER_KEY = 'sd_basket_owner';
/** A change in this tab the account hasn't got yet (a save still on its way). */
const DIRTY_KEY = 'sd_basket_dirty';
/** How long the basket rests before a change is saved (a run of taps is one save). */
const SAVE_AFTER_MS = 500;

/** Is the basket remembered on an account? `loading` until the first check comes back. */
export const useBasketAccount = create<{ status: 'loading' | 'guest' | 'signed-in'; remindersOff: boolean; setRemindersOff: (off: boolean) => void }>((set) => ({
  status: 'loading',
  remindersOff: false,
  setRemindersOff: (remindersOff) => set({ remindersOff }),
}));

const tab = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
  drop: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  },
};

/**
 * Keeps a signed-in shopper's basket on their account (founder, 25 Nov 2026), so it follows them to another
 * tab, another day, another device. Mounted once in the root layout; every sign-in and sign-out is a full page
 * load, so one check per load is enough.
 *
 * - Signed in, first time in this tab: the saved basket and this tab's are merged, and saved.
 * - Signed in, this tab already theirs: the saved basket (the newest, from any tab) — unless this tab has a
 *   change not saved yet, which is then saved.
 * - This tab holds someone ELSE's basket (a shared computer): it's swapped for this account's.
 * - Signed out, and this tab was holding an account's basket: it's emptied here (it's still safe on the
 *   account) — the next person at this computer doesn't see it.
 * Every change afterwards is saved, a moment after the last tap.
 */
export function BasketSync() {
  useEffect(() => {
    let alive = true;
    let owner: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let applying = false;
    let unsub: (() => void) | null = null;

    const save = (items: BasketItem[]) => {
      if (!owner) return;
      void saveBasketAction(items, owner)
        .then((r) => {
          if (r.ok && useBasket.getState().items === items) tab.drop(DIRTY_KEY);
        })
        .catch(() => {});
    };
    const flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      save(useBasket.getState().items);
    };

    void loadSavedBasketAction()
      .then((r) => {
        if (!alive) return;
        if (!r.signedIn) {
          if (tab.get(BASKET_OWNER_KEY)) {
            useBasket.getState().clear();
            tab.drop(BASKET_OWNER_KEY);
            tab.drop(DIRTY_KEY);
          }
          useBasketAccount.setState({ status: 'guest' });
          return;
        }
        const tabOwner = tab.get(BASKET_OWNER_KEY);
        const here = useBasket.getState().items;
        const saved = r.items as unknown as BasketItem[];
        const next = tabOwner && tabOwner !== r.owner ? saved : tabOwner === r.owner ? (tab.get(DIRTY_KEY) ? here : saved) : mergeBaskets(saved, here);
        owner = r.owner;
        tab.set(BASKET_OWNER_KEY, r.owner);
        applying = true;
        useBasket.setState({ items: next });
        applying = false;
        if (JSON.stringify(next) !== JSON.stringify(saved)) save(next);
        else tab.drop(DIRTY_KEY);
        useBasketAccount.setState({ status: 'signed-in', remindersOff: r.remindersOff });
        unsub = useBasket.subscribe((s, prev) => {
          if (applying || s.items === prev.items) return;
          tab.set(DIRTY_KEY, '1');
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            save(useBasket.getState().items);
          }, SAVE_AFTER_MS);
        });
      })
      .catch(() => {
        if (alive) useBasketAccount.setState({ status: 'guest' });
      });

    // leaving the page with a save still waiting: send it now
    window.addEventListener('pagehide', flush);
    return () => {
      alive = false;
      unsub?.();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  return null;
}
