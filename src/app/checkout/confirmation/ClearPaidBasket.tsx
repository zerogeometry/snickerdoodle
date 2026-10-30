'use client';

import { useEffect } from 'react';
import { CHECKOUT_REF_KEY, SUBJECT_KEY, useBasket } from '@/lib/store';

/**
 * Back from Stripe with the payment made: empty the basket — but only when this page is the
 * confirmation of the order this tab sent to Stripe. (The basket is kept until now, so going back
 * from Stripe finds it as it was; a gift-link purchase or an old confirmation link leaves it be.)
 */
export function ClearPaidBasket({ orderRef }: { orderRef: string }) {
  const clear = useBasket((s) => s.clear);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHECKOUT_REF_KEY) !== orderRef) return;
      sessionStorage.removeItem(CHECKOUT_REF_KEY);
      sessionStorage.removeItem(SUBJECT_KEY); // consumed — don't leak into a later checkout
    } catch {
      return;
    }
    clear();
  }, [clear, orderRef]);
  return null;
}
