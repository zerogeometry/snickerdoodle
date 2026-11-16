'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { AuthzError } from '@/authz';
import { currentReviewer } from '@/server/admin/context';
import { markHandled } from '@/server/admin/today';
import { retryOrder, revealContact } from '@/server/admin/orders';
import { revealRights, setRightsStatus, type RightsMove } from '@/server/admin/inbox';

/**
 * The admin app's buttons (Today, Orders, Inbox). Every action re-checks the caller server-side (an admin with
 * two-step login, from the database, never a client claim) and validates its input; a refusal is a quiet
 * { ok: false }, the same as something that doesn't exist.
 */

const REF = /^[A-Z0-9-]{3,40}$/i;
const UUID = /^[0-9a-f-]{36}$/i;
const KEY = /^[a-z-]+:[A-Za-z0-9:._@-]{1,120}$/;

async function guarded<T>(fn: () => Promise<T>): Promise<T | { ok: false }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false };
    throw e;
  }
}

/** "Done" on a Today item that a person dealt with. */
export async function markHandledAction(key: string): Promise<{ ok: boolean }> {
  if (typeof key !== 'string' || !KEY.test(key)) return { ok: false };
  return guarded(async () => {
    await markHandled(getDb(), await currentReviewer(), key);
    revalidatePath('/admin');
    return { ok: true };
  });
}

/** "Try again" on a stuck order not yet at Prodigi. */
export async function retryOrderAction(ref: string): Promise<{ ok: boolean }> {
  if (typeof ref !== 'string' || !REF.test(ref)) return { ok: false };
  return guarded(async () => {
    const ok = await retryOrder(getDb(), await currentReviewer(), ref);
    revalidatePath(`/admin/orders/${ref}`);
    revalidatePath('/admin');
    return { ok };
  });
}

/** The customer's email and address for one order (audited). */
export async function revealContactAction(ref: string): Promise<{ ok: true; email: string | null; address: string[] } | { ok: false }> {
  if (typeof ref !== 'string' || !REF.test(ref)) return { ok: false };
  return guarded(async () => {
    const c = await revealContact(getDb(), await currentReviewer(), ref);
    return c ? { ok: true as const, ...c } : { ok: false as const };
  });
}

/** A data request's own words and sender (audited). */
export async function revealRightsAction(id: string): Promise<{ ok: true; email: string | null; name: string | null; details: string | null } | { ok: false }> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false };
  return guarded(async () => {
    const x = await revealRights(getDb(), await currentReviewer(), id);
    return x ? { ok: true as const, ...x } : { ok: false as const };
  });
}

/** Move a data request along (in progress, waiting on them, done, declined). */
export async function setRightsStatusAction(id: string, status: RightsMove, outcome: string | null): Promise<{ ok: boolean }> {
  if (typeof id !== 'string' || !UUID.test(id) || !['IN_PROGRESS', 'CLOCK_PAUSED', 'COMPLETED', 'DECLINED'].includes(status)) return { ok: false };
  if (outcome !== null && (typeof outcome !== 'string' || outcome.length > 1000)) return { ok: false };
  return guarded(async () => {
    const ok = await setRightsStatus(getDb(), await currentReviewer(), id, status, outcome);
    revalidatePath('/admin/inbox');
    revalidatePath('/admin');
    return { ok };
  });
}
