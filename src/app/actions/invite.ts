'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { AlreadyInFamilyError, createInvite } from '@/server/invites';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { LIMITS, rateLimit } from '@/server/rateLimit';
import { sendMail } from '@/server/mail';
import { familyInviteEmail } from '@/server/mail/familyInvite';
import type { AccessLevel, Relationship } from '@/domain/types';

/**
 * Send a family invite. Parent-initiated only (the server checks ownership). Delivered
 * through the Mailer port (console in dev; the chosen no-retention ESP in production).
 * The email says who it's from (the parent's first name only — 04-B11) and greets
 * them by the first name the parent typed (used for the email only, never stored).
 */
export async function createInviteAction(input: {
  email: string;
  relationship: Relationship;
  accessLevel: AccessLevel;
  shareOccasions?: boolean;
  name?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; reason?: 'already-member' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.email.trim()) return { ok: false };
  if (!(await rateLimit(getDb(), { ...LIMITS.invitesPerAccount, caller: account.id })).ok) return { ok: false };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token, email } = await createInvite(db, viewer, {
      familyId,
      email: input.email,
      relationship: input.relationship,
      accessLevel: input.accessLevel,
      shareOccasions: input.shareOccasions === true,
    });
    await sendMail(familyInviteEmail({ to: email, token, inviterName: account.name, inviteeName: typeof input.name === 'string' ? input.name : null }));
    return { ok: true };
  } catch (e) {
    // already in the family: say so plainly (the parent changes their level from their card instead)
    if (e instanceof AlreadyInFamilyError) return { ok: false, reason: 'already-member' };
    return { ok: false };
  }
}
