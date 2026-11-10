'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { callbackUrl, connectChoices, createAuthCode, parseConnectRequest, revokeAppTokens } from '@/server/app/link';
import { deleteProgressBackups, parseConnectSync, removeEverythingDrawSent, updateSyncFromWebsite, type SyncChoices } from '@/server/app/sync';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';

/**
 * The "connect snickerdoodle draw?" buttons. The app's request is re-checked from scratch on every
 * press (never trusted from the page), the grown-up must be signed in, and only a family they RUN can
 * be linked. Each answers with the URL to send the browser to: always the allow-listed redirect URI.
 */

export interface ConnectParams {
  response_type: string;
  client_id: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  redirect_uri: string;
}

type Answer = { ok: true; url: string } | { ok: false; reason: 'request' | 'signed-out' | 'family' | 'sync' };

/**
 * "connect". The grown-up's sync choices are required: a keepsakes option (none / proud / all — never
 * a default) and the two boxes (on only if ticked). Refused with `sync` otherwise.
 */
export async function approveAppLinkAction(input: { params: ConnectParams; familyId: string | 'new'; childIds: string[] | null; sync: unknown }): Promise<Answer> {
  const parsed = parseConnectRequest({ ...input.params });
  if (!parsed.ok) return { ok: false, reason: 'request' };
  const sync = parseConnectSync(input.sync);
  if (!sync) return { ok: false, reason: 'sync' };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'signed-out' };
  const db = getDb();
  const { owned, joinedElsewhere } = await connectChoices(db, account.id);
  let familyId: string;
  if (input.familyId === 'new') {
    // a brand-new grown-up with no family yet: their keepsake box starts here (as "keep it" would)
    if (owned.length || joinedElsewhere) return { ok: false, reason: 'family' };
    familyId = await ensureHomeFamily(db, account.id, account.name);
  } else {
    if (!owned.some((f) => f.id === input.familyId)) return { ok: false, reason: 'family' };
    familyId = input.familyId;
  }
  const childIds = Array.isArray(input.childIds) ? input.childIds.filter((x): x is string => typeof x === 'string').slice(0, 50) : null;
  const code = await createAuthCode(db, { accountId: account.id, familyId, childIds, req: parsed.req, sync });
  return { ok: true, url: callbackUrl(parsed.req, { code }) };
}

/** "not now" — back to the app, which says "no problem" and keeps working unlinked. */
export async function declineAppLinkAction(input: { params: ConnectParams }): Promise<Answer> {
  const parsed = parseConnectRequest({ ...input.params });
  if (!parsed.ok) return { ok: false, reason: 'request' };
  return { ok: true, url: callbackUrl(parsed.req, { error: 'access_denied' }) };
}

/** Signed in, but they don't run a family (they're in someone else's): back to the app, which says
 * "ask the grown-up who runs your family" (its swap answers 403 not-owner). */
export async function notOwnerAppLinkAction(input: { params: ConnectParams }): Promise<Answer> {
  const parsed = parseConnectRequest({ ...input.params });
  if (!parsed.ok) return { ok: false, reason: 'request' };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'signed-out' };
  const code = await createAuthCode(getDb(), { accountId: account.id, familyId: null, childIds: null, req: parsed.req });
  return { ok: true, url: callbackUrl(parsed.req, { code }) };
}

/** The account page's "what syncs" for one of this account's own phones (any subset of the three). */
export async function updateAppSyncAction(input: { tokenId: string; patch: Record<string, unknown> }): Promise<{ ok: true; sync: SyncChoices } | { ok: false }> {
  const account = await getCurrentAccount();
  if (!account || typeof input.tokenId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.tokenId) || !input.patch || typeof input.patch !== 'object') return { ok: false };
  const res = await updateSyncFromWebsite(getDb(), account.id, input.tokenId, input.patch);
  if (!res.ok) return { ok: false };
  revalidatePath('/account');
  return { ok: true, sync: res.sync };
}

/** The account page's "delete the backed-up drawing days" — in the families this account runs. */
export async function deleteDrawingDaysAction(): Promise<{ ok: boolean; deleted: number }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, deleted: 0 };
  const db = getDb();
  const { owned } = await connectChoices(db, account.id);
  const deleted = await deleteProgressBackups(db, account.id, owned.map((f) => f.id));
  revalidatePath('/account');
  return { ok: true, deleted };
}

/**
 * The account page's "remove everything snickerdoodle draw sent" (A-48), after its confirm step: the
 * literal `confirm` is required so nothing can trigger it by accident. Deletes for good, through the
 * website's own cascading delete, in the families this account runs.
 */
export async function removeEverythingDrawSentAction(input: { confirm: string }): Promise<{ ok: true; removed: number; kept: number } | { ok: false }> {
  const account = await getCurrentAccount();
  if (!account || input?.confirm !== 'remove-everything') return { ok: false };
  const db = getDb();
  const { owned } = await connectChoices(db, account.id);
  const res = await removeEverythingDrawSent(db, account.id, owned.map((f) => f.id));
  revalidatePath('/account');
  revalidatePath('/home');
  return { ok: true, ...res };
}

/** The account page's "disconnect" — this account's own phones only. */
export async function unlinkAppDeviceAction(input: { tokenId: string }): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account || typeof input.tokenId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.tokenId)) return { ok: false };
  const n = await revokeAppTokens(getDb(), { tokenId: input.tokenId, accountId: account.id }, 'unlinked-on-website', { accountId: account.id, actorType: 'MEMBER' });
  revalidatePath('/account');
  return { ok: n > 0 };
}
