import { auth } from '@/auth';
import { getDb } from '@/db/client';
import type { ViewerContext } from '@/authz';
import { resolveViewerContext } from './assets';

export interface CurrentAccount {
  id: string;
  email: string;
  name: string | null;
}

/** The signed-in account, or null for a guest. */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? null };
}

/**
 * The authz ViewerContext for the current account within a given family — the
 * bridge from "who's logged in" to "what they may see". A guest (or a non-member)
 * resolves to a context with no membership, which the policy then denies.
 */
export async function getViewerContext(familyId: string): Promise<ViewerContext> {
  const account = await getCurrentAccount();
  return resolveViewerContext(getDb(), account?.id ?? null, familyId);
}
