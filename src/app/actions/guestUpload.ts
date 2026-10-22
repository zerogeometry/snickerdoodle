'use server';

import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { ingestEphemeralUpload } from '@/server/ingest';
import { RETENTION_DAYS } from '@/server/retention';
import { ImageTooLargeError } from '@/storage';
import { UPLOAD_CLAIM_COOKIE, appendClaim, signClaims, verifyClaims } from '@/server/uploadClaims';

/** The terms version a guest accepts at the upload moment. Bump on any change so
 * the recorded consent always points at the exact terms that were shown. */
const TERMS_VERSION = '2026-06-26';

/**
 * Start a PRE-ACCOUNT upload (the no-account-wall wow flow). The guest accepts
 * the terms at the upload moment (the lawful basis), the bytes are EXIF-stripped,
 * content-safety-checked and stored as an ephemeral claim-scoped draft, and the
 * single-use claim is handed back in a signed httpOnly cookie so the same browser
 * can preview / place / clean-edges it — and only it.
 */
export async function startGuestUpload(
  formData: FormData,
): Promise<{ ok: boolean; assetId?: string; needsTerms?: boolean; blocked?: boolean }> {
  if (formData.get('termsAccepted') !== 'true') return { ok: false, needsTerms: true };
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > 25 * 1024 * 1024) return { ok: false }; // 25MB guard

  const db = getDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  let ingested: Awaited<ReturnType<typeof ingestEphemeralUpload>>;
  try {
    ingested = await ingestEphemeralUpload(db, { buffer, kind: 'DRAWING', termsVersion: TERMS_VERSION });
  } catch (e) {
    if (e instanceof ImageTooLargeError) return { ok: false }; // a decompression bomb, or not an image
    throw e;
  }
  const { assetId, claimId, moderationStatus } = ingested;
  // BLOCKED (CSAM) content is preserved server-side per the runbook but NEVER
  // surfaced — don't hand back a claim, so it can't be viewed or ordered.
  if (moderationStatus === 'BLOCKED') return { ok: false, blocked: true };

  const jar = await cookies();
  const claims = verifyClaims(jar.get(UPLOAD_CLAIM_COOKIE)?.value);
  jar.set(UPLOAD_CLAIM_COOKIE, signClaims(appendClaim(claims, claimId)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RETENTION_DAYS * 86_400,
  });
  return { ok: true, assetId };
}
