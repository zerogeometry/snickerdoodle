'use server';

import { getDb } from '@/db/client';
import { profileImagesFor } from '@/server/profile';
import { getCurrentAccount } from '@/server/session';

/** Just enough for a header to say "you're signed in" — never the email or id. */
export async function sessionSummaryAction(): Promise<{ signedIn: boolean }> {
  return { signedIn: (await getCurrentAccount()) !== null };
}

/** The signed-in person's own profile picture url (for the header sticker), or null. */
export async function myAvatarAction(): Promise<string | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  return (await profileImagesFor(getDb(), account.id, [account.id])).get(account.id)?.avatarUrl ?? null;
}
