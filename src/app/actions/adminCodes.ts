'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { AuthzError } from '@/authz';
import { currentReviewer } from '@/server/admin/context';
import { assertAdmin } from '@/server/admin/today';
import { createCode, revealPartnerEmail, setCodeActive } from '@/server/admin/codes';
import type { CodeInput, CodeProblem } from '../../../scripts/lib/promo-codes.mjs';

/**
 * The codes screen's actions (/admin/codes). Each one re-checks the caller server-side (an admin with two-step login,
 * from the database and the signed step-up cookie, never a client claim) and takes nothing from the browser but what
 * a person typed: the code's value, limits and partner are checked again by the shared rules (scripts/lib/promo-codes.mjs)
 * before anything is saved. To anyone else they quietly do nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_FIELDS = ['code', 'kind', 'amount', 'minSpend', 'maxUses', 'startsOn', 'endsOn', 'commission', 'partnerName', 'partnerType', 'partnerEmail', 'classLabel'] as const;

async function admin() {
  const r = await currentReviewer();
  assertAdmin(r);
  return r;
}

/** Only the known fields, only as short strings (and one yes/no): whatever else arrives is dropped. */
function cleanInput(raw: unknown): CodeInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: CodeInput = { firstOrder: src.firstOrder === true };
  for (const f of TEXT_FIELDS) {
    const v = src[f];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || v.length > 300) return null;
    out[f] = v;
  }
  return out;
}

export type CreateCodeActionResult = { ok: true; code: string } | { ok: false; problems?: CodeProblem[] };

export async function createCodeAction(raw: unknown): Promise<CreateCodeActionResult> {
  try {
    const r = await admin();
    const input = cleanInput(raw);
    if (!input) return { ok: false };
    const res = await createCode(getDb(), r, input);
    if (!res.ok) return { ok: false, problems: res.problems };
    revalidatePath('/admin/codes');
    return { ok: true, code: res.code };
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false };
    throw e;
  }
}

export async function setCodeActiveAction(id: unknown, active: unknown): Promise<{ ok: boolean; code?: string }> {
  if (typeof id !== 'string' || !UUID.test(id) || typeof active !== 'boolean') return { ok: false };
  try {
    const row = await setCodeActive(getDb(), await admin(), id, active);
    if (!row) return { ok: false };
    revalidatePath('/admin/codes');
    return { ok: true, code: row.code };
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false };
    throw e;
  }
}

/** A partner's email, shown on request (logged as personal data viewed). */
export async function revealPartnerEmailAction(partnerKey: unknown): Promise<{ ok: boolean; emails?: string[] }> {
  if (typeof partnerKey !== 'string' || !partnerKey.trim() || partnerKey.length > 120) return { ok: false };
  try {
    return { ok: true, emails: await revealPartnerEmail(getDb(), await admin(), partnerKey) };
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false };
    throw e;
  }
}
