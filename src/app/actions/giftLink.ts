'use server';

import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { createGiftLink, NothingToShowError, placeGiftLinkOrder, sendGiftLinks } from '@/server/giftLinks';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { LIMITS, rateLimit } from '@/server/rateLimit';
import { ACCESS_LEVELS, CIRCLES, type AccessLevel, type Circle, type Relationship } from '@/domain/types';

/**
 * An OPEN link to copy / WhatsApp / text yourself (D27, founder answer C): we can't know who will open it, so the
 * parent picks who it's for — home, family or extended (extended unless they say otherwise) — and it shows only
 * what that circle may see. Owner-only.
 */
export async function createOpenGiftLinkAction(input: {
  assetIds: string[];
  /** Saved designs ("+ Keepsake") to include, sold exactly as designed. */
  designIds?: string[];
  title?: string;
  productKey?: string;
  circle?: Circle;
}): Promise<{ ok: boolean; needsAuth?: boolean; url?: string; linkId?: string; reason?: 'too-private' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!input.assetIds?.length && !input.designIds?.length) return { ok: false };

  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.giftLinksPerAccount, caller: account.id })).ok) return { ok: false };
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const circle: Circle = input.circle && (CIRCLES as readonly string[]).includes(input.circle) ? input.circle : 'EXTENDED';
  try {
    const { id, token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: (input.assetIds ?? []).map(String),
      designIds: Array.isArray(input.designIds) ? input.designIds.map(String) : [],
      title: input.title ?? null,
      productKey: typeof input.productKey === 'string' ? input.productKey : null,
      recipient: { kind: 'open', circle },
    });
    return { ok: true, url: `/g/${token}`, linkId: id };
  } catch (e) {
    if (e instanceof NothingToShowError) return { ok: false, reason: 'too-private' };
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

/**
 * Send a gift request (D27: ONE LINK PER PERSON): each family member picked, and each new address, gets their own
 * link, emailed only to them, showing only what their circle may see. Owner-only; everything is re-checked
 * server-side (members are this family's ACTIVE members; circles come from the membership or the invite).
 */
export async function sendGiftLinksAction(input: {
  assetIds: string[];
  designIds?: string[];
  title?: string;
  productKey?: string;
  memberAccountIds: string[];
  /** someone new: an address, and (when inviting them) how they're related — sets the circle their link shows */
  people: { email: string; relationship?: Relationship | null }[];
  invite?: { accessLevel: AccessLevel; shareOccasions?: boolean } | null;
  note?: string;
}): Promise<{ ok: boolean; sent?: number; skipped?: string[]; batchId?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  if (!input.assetIds?.length && !input.designIds?.length) return { ok: false };
  const db = getDb();
  const members = (input.memberAccountIds ?? []).map(String).slice(0, 20);
  const people = (Array.isArray(input.people) ? input.people : []).slice(0, 20).map((p) => ({ email: String(p?.email ?? ''), relationship: (p?.relationship ?? null) as Relationship | null }));
  // each request sends emails (and makes a link each): limited per account, weighted by how many go out
  const recipients = members.length + people.length;
  if (recipients === 0) return { ok: false };
  if (!(await rateLimit(db, { ...LIMITS.giftRequestsPerAccount, caller: account.id, cost: recipients })).ok) return { ok: false };
  if (!(await rateLimit(db, { ...LIMITS.giftLinksPerAccount, caller: account.id })).ok) return { ok: false };
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const access = input.invite?.accessLevel;
  try {
    const res = await sendGiftLinks(db, viewer, {
      familyId,
      assetIds: (input.assetIds ?? []).map(String),
      designIds: Array.isArray(input.designIds) ? input.designIds.map(String) : [],
      title: input.title ?? null,
      productKey: typeof input.productKey === 'string' ? input.productKey : null,
      note: typeof input.note === 'string' ? input.note : null,
      to: [...members.map((memberAccountId) => ({ memberAccountId })), ...people],
      invite: access && (ACCESS_LEVELS as readonly string[]).includes(access) ? { accessLevel: access, shareOccasions: input.invite?.shareOccasions === true } : null,
    });
    return { ok: res.sent > 0, sent: res.sent, skipped: res.skipped, batchId: res.batchId };
  } catch {
    return { ok: false };
  }
}
