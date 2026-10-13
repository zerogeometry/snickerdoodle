'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { setKeepChoice } from '@/server/keepChoice';
import { getCurrentAccount } from '@/server/session';

/** "Keep these in your keepsake box?" after a purchase — yes keeps them; no holds them only as
 * long as the order needs them. Only the signed-in buyer's own order + drawings. */
export async function setKeepChoiceAction(orderRef: string, keep: boolean): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  try {
    const res = await setKeepChoice(getDb(), account.id, String(orderRef), keep === true);
    revalidatePath('/home');
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
