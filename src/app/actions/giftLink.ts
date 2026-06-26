'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { createGiftLink } from '@/server/giftLinks';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import type { AccessLevel, Relationship } from '@/domain/types';

/** Create a real, shareable gift link from chosen keepsakes (owner-only). */
export async function createGiftLinkAction(input: {
  assetIds: string[];
  title?: string;
  invite?: { email: string; relationship: Relationship; accessLevel: AccessLevel } | null;
}): Promise<{ ok: boolean; needsAuth?: boolean; url?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.assetIds?.length) return { ok: false };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: input.assetIds,
      title: input.title ?? null,
      invite: input.invite ?? null,
    });
    return { ok: true, url: `/g/${token}` };
  } catch {
    return { ok: false };
  }
}
