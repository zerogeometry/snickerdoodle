'use server';

import { createHash } from 'node:crypto';
import { getDb } from '@/db/client';
import { basketRemindersOff, loadBasket, saveBasket, setBasketReminders, type SavedLine } from '@/server/savedBasket';
import { getCurrentAccount } from '@/server/session';

/** A tag for "whose basket this tab holds" — so a tab never mixes two people's baskets. Not a secret; never the id itself. */
const ownerTag = (accountId: string) => createHash('sha256').update(`basket-owner:${accountId}`).digest('base64url').slice(0, 16);

/**
 * The basket remembered on the signed-in account (founder, 25 Nov 2026), or `signedIn: false`. Lines whose
 * drawings are gone or no longer theirs to see are left out (src/server/savedBasket.ts).
 */
export async function loadSavedBasketAction(): Promise<{ signedIn: false } | { signedIn: true; owner: string; items: SavedLine[]; remindersOff: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { signedIn: false };
  const db = getDb();
  return { signedIn: true, owner: ownerTag(account.id), items: await loadBasket(db, account.id), remindersOff: await basketRemindersOff(db, account.id) };
}

/** Remember this basket on the signed-in account (an empty one forgets it). Signed out: nothing is stored. */
export async function saveBasketAction(items: unknown, owner: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  // a tab still holding someone else's basket never writes it onto this account
  if (!account || owner !== ownerTag(account.id)) return { ok: false };
  return saveBasket(getDb(), account.id, items);
}

/** The basket's own "no reminder emails, thanks" (or back on) — logged like any consent change. */
export async function setBasketRemindersAction(on: boolean): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  await setBasketReminders(getDb(), account.id, on === true, 'basket:switch');
  return { ok: true };
}
