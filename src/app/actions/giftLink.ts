'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { createGiftLink, placeGiftLinkOrder, sendGiftRequest } from '@/server/giftLinks';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import type { AccessLevel, Relationship } from '@/domain/types';
import { allow, allowVisitor } from '@/server/rateLimit';

/** Create a real, shareable gift link from chosen keepsakes (owner-only). */
export async function createGiftLinkAction(input: {
  assetIds: string[];
  /** Saved designs ("+ Keepsake") to include, sold exactly as designed. */
  designIds?: string[];
  title?: string;
  productKey?: string;
  invite?: { email: string; relationship: Relationship; accessLevel: AccessLevel; shareOccasions?: boolean } | null;
}): Promise<{ ok: boolean; needsAuth?: boolean; url?: string; linkId?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.assetIds?.length && !input.designIds?.length) return { ok: false };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { id, token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: input.assetIds ?? [],
      designIds: Array.isArray(input.designIds) ? input.designIds.map(String) : [],
      title: input.title ?? null,
      productKey: typeof input.productKey === 'string' ? input.productKey : null,
      invite: input.invite ?? null,
    });
    return { ok: true, url: `/g/${token}`, linkId: id };
  } catch {
    return { ok: false };
  }
}

/**
 * Check out a gift link's frozen snapshot — guest or signed-in. Everything (lines,
 * keepsakes, price, join saving) is resolved server-side from the token; the client
 * sends only the token. Returns a Stripe Checkout URL (or a placed ref in dev).
 */
export async function checkoutGiftLinkAction(
  token: string,
  fromName?: string,
): Promise<{
  ok: boolean;
  checkoutUrl?: string;
  ref?: string;
  reason?: 'unavailable' | 'too-small' | 'all-bought' | 'error';
}> {
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'unavailable' };
  if (!(await allowVisitor('checkout'))) return { ok: false, reason: 'error' };
  const account = await getCurrentAccount();
  const joinProvenance = account ? await resolveSessionJoinProvenance() : null;
  try {
    const res = await placeGiftLinkOrder(getDb(), {
      token,
      account: account ? { id: account.id, name: account.name, email: account.email } : null,
      joinProvenance,
      fromName: typeof fromName === 'string' ? fromName : null,
    });
    if (res.unavailable) return { ok: false, reason: 'unavailable' };
    if (res.allBought) return { ok: false, reason: 'all-bought' };
    if (!res.ok) return { ok: false, reason: res.reason === 'too-small' ? 'too-small' : 'error' };
    return { ok: true, checkoutUrl: res.checkoutUrl, ref: res.ref };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Send a gift request to chosen family members and/or email addresses (owner-only). */
export async function sendGiftRequestAction(input: {
  linkId: string;
  memberAccountIds: string[];
  emails: string[];
  note?: string;
}): Promise<{ ok: boolean; sent?: number }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  if (!allow('send-email', account.id)) return { ok: false };
  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { sent } = await sendGiftRequest(db, viewer, {
      familyId,
      linkId: String(input.linkId),
      memberAccountIds: (input.memberAccountIds ?? []).map(String).slice(0, 50),
      emails: (input.emails ?? []).map(String).slice(0, 20),
      note: typeof input.note === 'string' ? input.note : null,
    });
    return { ok: sent > 0, sent };
  } catch {
    return { ok: false };
  }
}
