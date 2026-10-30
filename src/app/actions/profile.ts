'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { listActiveFamilies } from '@/server/onboarding';
import { removeProfileImage, requestEmailChange, setProfileImage, updateDisplayName, type ProfileImageKind } from '@/server/profile';
import { getCurrentAccount } from '@/server/session';
import { LIMITS, rateLimit } from '@/server/rateLimit';

const KINDS: ProfileImageKind[] = ['AVATAR', 'ACCOUNT_HEADER', 'FAMILY_BANNER'];

function refresh() {
  revalidatePath('/account');
  revalidatePath('/home');
  revalidatePath('/family');
}

/** The family a banner is for: always the signer's OWN family, resolved server-side. */
async function ownedFamilyId(accountId: string): Promise<string | null> {
  return (await listActiveFamilies(getDb(), accountId)).find((f) => f.isOwner)?.familyId ?? null;
}

/** Upload a profile picture / header, or (owner) the family banner. FormData: kind, image. */
export async function uploadProfileImageAction(form: FormData): Promise<{ ok: boolean; reason?: 'not-an-image' | 'too-big' | 'not-owner'; pending?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const kind = String(form.get('kind') ?? '') as ProfileImageKind;
  const file = form.get('image');
  if (!KINDS.includes(kind) || !(file instanceof Blob)) return { ok: false, reason: 'not-an-image' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const familyId = kind === 'FAMILY_BANNER' ? await ownedFamilyId(account.id) : null;
  try {
    const res = await setProfileImage(getDb(), account.id, { kind, buffer, familyId });
    refresh();
    return res.ok ? { ok: true, pending: res.status !== 'CLEAR' } : { ok: false, reason: res.reason };
  } catch {
    return { ok: false };
  }
}

export async function removeProfileImageAction(kind: ProfileImageKind): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account || !KINDS.includes(kind)) return { ok: false };
  const familyId = kind === 'FAMILY_BANNER' ? await ownedFamilyId(account.id) : null;
  try {
    const res = await removeProfileImage(getDb(), account.id, kind, familyId);
    refresh();
    return res;
  } catch {
    return { ok: false };
  }
}

export async function updateNameAction(name: string): Promise<{ ok: boolean; name?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const res = await updateDisplayName(getDb(), account.id, String(name ?? ''));
  if (res.ok) refresh();
  return res;
}

export async function requestEmailChangeAction(email: string): Promise<{ ok: boolean; reason?: 'invalid' | 'same' | 'too-many' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  if (!(await rateLimit(getDb(), { ...LIMITS.emailChange, caller: account.id })).ok) return { ok: false, reason: 'too-many' };
  try {
    return await requestEmailChange(getDb(), account.id, String(email ?? ''));
  } catch {
    return { ok: false };
  }
}
