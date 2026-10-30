'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { signIn } from '@/auth';
import { createInvite, sendInviteSignInLink } from '@/server/invites';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { LIMITS, rateLimit } from '@/server/rateLimit';
import { appUrl, sendMail } from '@/server/mail';
import type { AccessLevel, Relationship } from '@/domain/types';

/**
 * Send a family invite. Parent-initiated only (the server checks ownership). Delivered
 * through the Mailer port (console in dev; the chosen no-retention ESP in production).
 */
export async function createInviteAction(input: {
  email: string;
  relationship: Relationship;
  accessLevel: AccessLevel;
  shareOccasions?: boolean;
}): Promise<{ ok: boolean; needsAuth?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.email.trim()) return { ok: false };
  if (!(await rateLimit(getDb(), { ...LIMITS.invitesPerAccount, caller: account.id })).ok) return { ok: false };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token } = await createInvite(db, viewer, {
      familyId,
      email: input.email,
      relationship: input.relationship,
      accessLevel: input.accessLevel,
      shareOccasions: input.shareOccasions === true,
    });
    await sendMail({
      kind: 'family-invite',
      to: input.email.trim().toLowerCase(),
      subject: 'you’re invited to a family keepsake box',
      text:
        `You've been invited to join a family's private keepsake box on snickerdoodle.\n\n` +
        `Tap to join (it's just for you, and lasts 14 days):\n${appUrl(`/join/${token}`)}\n\n` +
        `Nothing is ever public — only the family you join can see what's inside.`,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * /join's "email me the link": the server sends the one-tap sign-in link to the INVITED address,
 * which never reaches the browser (06-B1 — a forwarded gift link lets anyone open /join).
 */
export async function sendJoinLinkAction(token: string, next: string | null): Promise<{ ok: boolean }> {
  try {
    return await sendInviteSignInLink(getDb(), token, next, async (email, redirectTo) => {
      await signIn('email', { email, redirect: false, redirectTo });
    });
  } catch {
    return { ok: false }; // e.g. too many links in a row — the page says so, never "check your email"
  }
}
