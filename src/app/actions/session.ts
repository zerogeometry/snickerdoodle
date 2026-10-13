'use server';

import { getCurrentAccount } from '@/server/session';

/** Just enough for a header to say "you're signed in" — never the email or id. */
export async function sessionSummaryAction(): Promise<{ signedIn: boolean }> {
  return { signedIn: (await getCurrentAccount()) !== null };
}
