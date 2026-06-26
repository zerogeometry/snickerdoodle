'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { createInvite } from '@/server/invites';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import type { AccessLevel, Relationship } from '@/domain/types';

/**
 * Send a family invite. Parent-initiated only (the server checks ownership). In
 * dev the join link is logged to the server console; production emails it via a
 * no-retention email sub-processor.
 */
export async function createInviteAction(input: {
  email: string;
  relationship: Relationship;
  accessLevel: AccessLevel;
}): Promise<{ ok: boolean; needsAuth?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.email.trim()) return { ok: false };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token } = await createInvite(db, viewer, {
      familyId,
      email: input.email,
      relationship: input.relationship,
      accessLevel: input.accessLevel,
    });
    // eslint-disable-next-line no-console
    console.log(`\n┌─ family invite for ${input.email.trim().toLowerCase()}\n│ http://localhost:3000/join/${token}\n└─\n`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
