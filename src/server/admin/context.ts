import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { accounts } from '@/db/schema';
import { getDb } from '@/db/client';
import type { Reviewer } from '@/authz';
import { getCurrentAccount } from '../session';
import { ADMIN_STEPUP_COOKIE, verifyStepUp } from './stepUp';

/** Who's asking, as the review rules need it: signed in? an admin? two-step login done? */
export async function currentReviewer(): Promise<Reviewer & { email: string | null; enrolled: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { accountId: null, isAdmin: false, mfaVerified: false, email: null, enrolled: false };
  const [row] = await getDb().select({ isAdmin: accounts.isAdmin, mfa: accounts.mfaSecret }).from(accounts).where(eq(accounts.id, account.id));
  const jar = await cookies();
  return {
    accountId: account.id,
    email: account.email,
    isAdmin: row?.isAdmin === true,
    enrolled: !!row?.mfa,
    mfaVerified: row?.isAdmin === true && !!row?.mfa && verifyStepUp(jar.get(ADMIN_STEPUP_COOKIE)?.value, account.id),
  };
}
