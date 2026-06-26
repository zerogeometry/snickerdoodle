import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { getDb } from '@/db/client';
import type { ViewerContext } from '@/authz';
import { resolveViewerContext } from './assets';
import { UPLOAD_CLAIM_COOKIE, verifyClaims } from './uploadClaims';

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

/** The upload claims a guest holds (from the signed cookie) — for their own
 * ephemeral drafts. Empty for a fresh visitor or a tampered cookie. */
export async function getUploadClaims(): Promise<string[]> {
  const jar = await cookies();
  return verifyClaims(jar.get(UPLOAD_CLAIM_COOKIE)?.value);
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
